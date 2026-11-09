// 網頁版文字辨識的 Web Worker（ocr-web.js 開的）：onnxruntime-web 跑 models/ocr/ 的 PP-OCRv6 small（偵測＋辨識）。
// 前處理、後處理照 RapidOCR 3.x（辨識套件用的就是它）：
//   整張圖長邊超過 2000 縮到 2000（取 32 的倍數），太扁、太矮的上下補黑邊；
//   偵測：短邊不到 736 放大到 736、取 32 的倍數，(x/255-0.5)/0.5（BGR），機率 > 0.3、2×2 膨脹，
//         分數（框裡平均機率）>= 0.5，框往外擴 面積×1.6／周長；
//   辨識：高 48，寬照比例（至少 320），6 張一批、同一批補到一樣寬，CTC 貪婪解碼，信心 < 0.5 的不要。
// 跟 RapidOCR 不一樣的地方（JS 沒有 OpenCV）：文字框一律當成水平的長方形（連通區塊的外框，不算旋轉角度）、
// 不做方向分類（假設字是正的）、縮放用雙線性。
'use strict';
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
importScripts(ORT + 'ort.wasm.min.js');

let MODEL = 'models/ocr/';
const FILES = [['det.onnx', 2674015], ['rec.onnx', 5587038]];   // 大小給下載進度條用（換模型要改）
let CACHE = 'vitools-ocr-1';   // 換模型時改名字，舊的會刪掉
let det = null, rec = null, KEYS = null, loading = null;

function progress(o) { self.postMessage(Object.assign({ type: 'progress' }, o)); }
const LOCAL = /^(vitools\.local|127\.0\.0\.1|localhost)$/.test(self.location.hostname);

async function getFile(name, done, total) {
  const url = new URL(MODEL + name, self.location.href).href;
  let cache = null;
  if (!LOCAL && self.caches) {
    try {
      cache = await caches.open(CACHE);
      const hit = await cache.match(url);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch (e) { cache = null; }
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('下載模型失敗（' + name + '，HTTP ' + r.status + '）');
  const size = +r.headers.get('Content-Length') || 0;
  const parts = [];
  let got = 0;
  const rd = r.body.getReader();
  for (;;) {
    const { done: end, value } = await rd.read();
    if (end) break;
    parts.push(value);
    got += value.length;
    progress({ stage: 'download', loaded: done + got, total: total || (done + size), local: LOCAL });
  }
  const buf = new Uint8Array(got);
  let o = 0;
  parts.forEach(p => { buf.set(p, o); o += p.length; });
  if (cache) { try { await cache.put(url, new Response(buf)); } catch (e) { /* 空間不夠就算了 */ } }
  return buf;
}

async function cachedAll() {
  if (LOCAL) return true;
  if (!self.caches) return false;
  try {
    const c = await caches.open(CACHE);
    for (const [n] of FILES) if (!(await c.match(new URL(MODEL + n, self.location.href).href))) return false;
    return true;
  } catch (e) { return false; }
}

function load() {
  if (loading) return loading;
  loading = (async () => {
    if (self.caches && !LOCAL) {
      try { (await caches.keys()).forEach(k => { if (k.startsWith('vitools-ocr-') && k !== CACHE) caches.delete(k); }); } catch (e) { /* */ }
    }
    ort.env.wasm.wasmPaths = ORT;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator.hardwareConcurrency || 1) : 1;
    const keys = await (await fetch(new URL(MODEL + 'keys.txt', self.location.href).href)).text();
    // 只有簡體才有的字直接換成繁體（模型偶爾把繁體認成簡體：则、温、会、内；s2t.txt 是 tools/build-ocr-s2t.py 產生的）
    const s2t = new Map();
    try {
      const m = Array.from(await (await fetch(new URL(MODEL + 's2t.txt', self.location.href).href)).text());
      for (let i = 0; i + 1 < m.length; i += 2) s2t.set(m[i], m[i + 1]);
    } catch (e) { /* 沒有對照表就照原樣 */ }
    KEYS = ['blank'].concat(keys.split(/\r?\n/).map(k => s2t.get(k) || k), [' ']);
    const total = FILES.reduce((a, f) => a + f[1], 0);
    const bufs = [];
    let done = 0;
    for (const [n] of FILES) {
      const b = await getFile(n, done, total);
      bufs.push(b);
      done += b.length;
    }
    progress({ stage: 'init' });
    const opt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    det = await ort.InferenceSession.create(bufs[0], opt);
    rec = await ort.InferenceSession.create(bufs[1], opt);
    return { threads: ort.env.wasm.numThreads };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

// ---------- 影像（RGB，Uint8Array，w×h×3） ----------
function fromRGBA(d, w, h) {
  const o = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) { o[i * 3] = d[j]; o[i * 3 + 1] = d[j + 1]; o[i * 3 + 2] = d[j + 2]; }
  return { w, h, d: o };
}
// 雙線性縮放（對齊 cv2.INTER_LINEAR 的像素中心算法）
function resize(im, W, H) {
  if (W === im.w && H === im.h) return im;
  const o = new Uint8Array(W * H * 3), sx = im.w / W, sy = im.h / H;
  for (let y = 0; y < H; y++) {
    let fy = (y + 0.5) * sy - 0.5; if (fy < 0) fy = 0;
    const y0 = Math.min(im.h - 1, Math.floor(fy)), y1 = Math.min(im.h - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < W; x++) {
      let fx = (x + 0.5) * sx - 0.5; if (fx < 0) fx = 0;
      const x0 = Math.min(im.w - 1, Math.floor(fx)), x1 = Math.min(im.w - 1, x0 + 1), wx = fx - x0;
      const a = (y0 * im.w + x0) * 3, b = (y0 * im.w + x1) * 3, c = (y1 * im.w + x0) * 3, e = (y1 * im.w + x1) * 3, t = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) {
        o[t + k] = Math.round((im.d[a + k] * (1 - wx) + im.d[b + k] * wx) * (1 - wy) + (im.d[c + k] * (1 - wx) + im.d[e + k] * wx) * wy);
      }
    }
  }
  return { w: W, h: H, d: o };
}
function crop(im, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0, o = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(im.h - 1, Math.max(0, y0 + y));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(im.w - 1, Math.max(0, x0 + x)), s = (sy * im.w + sx) * 3, t = (y * w + x) * 3;
      o[t] = im.d[s]; o[t + 1] = im.d[s + 1]; o[t + 2] = im.d[s + 2];
    }
  }
  return { w, h, d: o };
}
function rot90(im) {   // 逆時針 90 度（np.rot90）
  const W = im.h, H = im.w, o = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (x * im.w + (im.w - 1 - y)) * 3, t = (y * W + x) * 3;
    o[t] = im.d[s]; o[t + 1] = im.d[s + 1]; o[t + 2] = im.d[s + 2];
  }
  return { w: W, h: H, d: o };
}
// (x/255-0.5)/0.5，BGR，CHW
function tensorCHW(im, padW) {
  const W = padW || im.w, n = im.h * W, f = new Float32Array(3 * n);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const s = (y * im.w + x) * 3, t = y * W + x;
    f[t] = im.d[s + 2] / 127.5 - 1; f[n + t] = im.d[s + 1] / 127.5 - 1; f[2 * n + t] = im.d[s] / 127.5 - 1;
  }
  return f;
}

// ---------- 偵測 ----------
async function detect(im) {
  const h = im.h, w = im.w;
  let r = 1;
  if (Math.min(h, w) < 736) r = 736 / Math.min(h, w);
  const H = Math.max(32, Math.round(Math.floor(h * r) / 32) * 32), W = Math.max(32, Math.round(Math.floor(w * r) / 32) * 32);
  const x = resize(im, W, H);
  const out = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', tensorCHW(x), [1, 3, H, W]) });
  const pred = out[det.outputNames[0]].data;   // [1,1,H,W]
  // 二值化＋2×2 膨脹（cv2.dilate，錨點在中心：看自己、左、上、左上）
  const bin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) bin[i] = pred[i] > 0.3 ? 1 : 0;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) {
    const i = y * W + x2;
    mask[i] = bin[i] || (x2 > 0 && bin[i - 1]) || (y > 0 && bin[i - W]) || (x2 > 0 && y > 0 && bin[i - W - 1]) ? 1 : 0;
  }
  // 連通區塊（8 連通）→ 外框
  const lab = new Int32Array(W * H), boxes = [], stack = [];
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || lab[i]) continue;
    n++;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    stack.push(i); lab[i] = n;
    while (stack.length) {
      const p = stack.pop(), py = (p / W) | 0, px = p - py * W;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        const q = qy * W + qx;
        if (mask[q] && !lab[q]) { lab[q] = n; stack.push(q); }
      }
    }
    if (n > 1000) break;
    const bw = x1 - x0, bh = y1 - y0;
    if (Math.min(bw, bh) < 3) continue;
    let s = 0;
    for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) s += pred[y * W + xx];
    s /= (bw + 1) * (bh + 1);
    if (s < 0.5) continue;
    const dist = bw * bh * 1.6 / (2 * (bw + bh));
    const ex0 = x0 - dist, ey0 = y0 - dist, ex1 = x1 + dist, ey1 = y1 + dist;
    if (Math.min(ex1 - ex0, ey1 - ey0) < 5) continue;
    const cx = v => Math.max(0, Math.min(w, Math.round(v / W * w))), cy = v => Math.max(0, Math.min(h, Math.round(v / H * h)));
    const b = [cx(ex0), cy(ey0), cx(ex1), cy(ey1)];
    if (b[2] - b[0] <= 3 || b[3] - b[1] <= 3) continue;
    boxes.push({ box: b, score: s });
  }
  // 由上而下（y 相差 10 以內算同一行），同一行由左而右（RapidOCR sorted_boxes）
  boxes.sort((a, b) => a.box[1] - b.box[1]);
  let line = 0;
  boxes.forEach((b, k) => { if (k && b.box[1] - boxes[k - 1].box[1] >= 10) line++; b.line = line; });
  boxes.sort((a, b) => a.line - b.line || a.box[0] - b.box[0]);
  return boxes;
}

// ---------- 辨識 ----------
async function recognize(crops) {
  const order = crops.map((c, i) => i).sort((a, b) => crops[a].w / crops[a].h - crops[b].w / crops[b].h);
  const res = new Array(crops.length);
  for (let s = 0; s < order.length; s += 6) {
    const ids = order.slice(s, s + 6);
    let mr = 320 / 48;
    ids.forEach(i => { mr = Math.max(mr, crops[i].w / crops[i].h); });
    const IW = Math.floor(48 * mr), n = 3 * 48 * IW, batch = new Float32Array(ids.length * n);
    ids.forEach((i, k) => {
      const c = crops[i], rw = Math.min(IW, Math.ceil(48 * c.w / c.h));
      batch.set(tensorCHW(resize(c, rw, 48), IW), k * n);   // 右邊補 0
    });
    const out = await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', batch, [ids.length, 3, 48, IW]) });
    const o = out[rec.outputNames[0]], T = o.dims[1], C = o.dims[2], d = o.data;
    ids.forEach((i, k) => {
      let txt = '', sum = 0, cnt = 0, prev = -1;
      for (let t = 0; t < T; t++) {
        let best = 0, bv = -1;
        const base = (k * T + t) * C;
        for (let c2 = 0; c2 < C; c2++) if (d[base + c2] > bv) { bv = d[base + c2]; best = c2; }
        if (best !== 0 && best !== prev) { txt += KEYS[best] || ''; sum += bv; cnt++; }
        prev = best;
      }
      res[i] = { text: txt, score: cnt ? sum / cnt : 0 };
    });
  }
  return res;
}

// 整張圖 → [{ box:[x0,y0,x1,y1]（原圖像素）, text, score }]
async function ocr(width, height, rgba) {
  await load();
  let im = fromRGBA(rgba, width, height);
  // 長邊 > 2000 縮小（32 的倍數）；短邊 < 30 放大
  let rx = 1, ry = 1;
  if (Math.max(im.w, im.h) > 2000) {
    const r = 2000 / Math.max(im.w, im.h);
    const W = Math.round(Math.floor(im.w * r) / 32) * 32, H = Math.round(Math.floor(im.h * r) / 32) * 32;
    rx = im.w / W; ry = im.h / H;
    im = resize(im, W, H);
  }
  if (Math.min(im.w, im.h) < 30) {
    const r = 30 / Math.min(im.w, im.h), W = Math.floor(im.w * r), H = Math.floor(im.h * r);
    rx *= im.w / W; ry *= im.h / H;
    im = resize(im, W, H);
  }
  // 太矮或太扁（寬／高 > 8）：上下補黑邊
  let pad = 0;
  if (im.h <= 30 || im.w / im.h > 8) {
    pad = Math.floor(Math.abs(Math.max(Math.floor(im.w / 8), 30) * 2 - im.h) / 2);
    const o = new Uint8Array(im.w * (im.h + 2 * pad) * 3);
    o.set(im.d, pad * im.w * 3);
    im = { w: im.w, h: im.h + 2 * pad, d: o };
  }
  const boxes = await detect(im);
  const crops = boxes.map(b => {
    let c = crop(im, b.box[0], b.box[1], b.box[2], b.box[3]);
    if (c.h / c.w >= 1.5) c = rot90(c);
    return c;
  });
  const texts = crops.length ? await recognize(crops) : [];
  const out = [];
  boxes.forEach((b, i) => {
    const t = texts[i];
    if (!t || !t.text || t.score < 0.5) return;
    out.push({ box: [b.box[0] * rx, (b.box[1] - pad) * ry, b.box[2] * rx, (b.box[3] - pad) * ry].map(Math.round), text: t.text, score: t.score });
  });
  return out;
}

self.onmessage = async e => {
  const m = e.data;
  try {
    let result;
    if (m.type === 'config') {   // 試驗用：換模型資料夾
      if (m.model) { MODEL = m.model; CACHE = 'vitools-ocr-test'; det = rec = null; loading = null; }
      result = true;
    } else if (m.type === 'load') result = await load();
    else if (m.type === 'cached') result = await cachedAll();
    else if (m.type === 'ocr') result = await ocr(m.width, m.height, m.data);
    self.postMessage({ id: m.id, result });
  } catch (err) {
    self.postMessage({ id: m.id, error: String(err && err.message || err) });
  }
};
