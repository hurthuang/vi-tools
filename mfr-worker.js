// 網頁版算式辨識的 Web Worker（mfr-web.js 開的）：onnxruntime-web 跑 models/mfr/ 的量化 MFR。
// 前處理、解碼跟辨識套件 app/exam/ort_mfr.py 一樣（384×384、PIL BICUBIC、(x/255-0.5)/0.5、貪婪解碼），
// 結果用 mfr-tidy.js 整理（Pix2Text post_process＋辨識套件 tidy）。
'use strict';
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
importScripts(ORT + 'ort.wasm.min.js', 'mfr-tidy.js');

const MODEL = 'models/mfr/';
const FILES = [['encoder_model_int8.onnx', 24002612], ['decoder_model_int8.onnx', 10728964]];
const CACHE = 'vitools-mfr-1';   // 換模型時改名字，舊的會刪掉
const BOS = 1, EOS = 2, MAX_NEW = 512, S = 384;
let enc = null, dec = null, ID2TOK = null, loading = null;

function progress(o) { self.postMessage(Object.assign({ type: 'progress' }, o)); }

// 本機（桌面版、測試伺服器）不用另存快取
const LOCAL = /^(vitools\.local|127\.0\.0\.1|localhost)$/.test(self.location.hostname);

async function getFile(name, size, done, total) {
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
  const parts = [];
  let got = 0;
  const rd = r.body.getReader();
  for (;;) {
    const { done: end, value } = await rd.read();
    if (end) break;
    parts.push(value);
    got += value.length;
    progress({ stage: 'download', loaded: done + got, total, local: LOCAL });
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
      try { (await caches.keys()).forEach(k => { if (k.startsWith('vitools-mfr-') && k !== CACHE) caches.delete(k); }); } catch (e) { /* */ }
    }
    ort.env.wasm.wasmPaths = ORT;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator.hardwareConcurrency || 1) : 1;
    const tj = await (await fetch(new URL(MODEL + 'tokenizer.json', self.location.href).href)).json();
    ID2TOK = [];
    for (const k in tj.model.vocab) ID2TOK[tj.model.vocab[k]] = k;
    const total = FILES.reduce((a, f) => a + f[1], 0);
    const bufs = [];
    let done = 0;
    for (const [n, size] of FILES) {
      bufs.push(await getFile(n, size, done, total));
      done += size;
    }
    progress({ stage: 'init' });
    const opt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    enc = await ort.InferenceSession.create(bufs[0], opt);
    dec = await ort.InferenceSession.create(bufs[1], opt);
    return { threads: ort.env.wasm.numThreads };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

// ByteLevel 解碼（GPT-2 的 bytes↔unicode 表）
const B2U = (() => {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n++); }
  const m = {};
  bs.forEach((b, i) => { m[String.fromCharCode(cs[i])] = b; });
  return m;
})();
function decode(ids) {
  const bytes = [];
  ids.forEach(i => { if (i <= 4 || !ID2TOK[i]) return; for (const ch of ID2TOK[i]) bytes.push(B2U[ch]); });
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// PIL 的 BICUBIC（a=-0.5，縮小時放寬支撐；先橫向再直向，中間取整到 0～255）
function cubic(x) {
  const a = -0.5;
  x = Math.abs(x);
  if (x < 1) return ((a + 2) * x - (a + 3)) * x * x + 1;
  if (x < 2) return (((x - 5) * x + 8) * x - 4) * a;
  return 0;
}
function coeffs(inSize, outSize) {
  const scale = inSize / outSize, fs = Math.max(scale, 1), support = 2 * fs;
  const res = [];
  for (let i = 0; i < outSize; i++) {
    const c = (i + 0.5) * scale;
    const xmin = Math.max(0, Math.floor(c - support + 0.5)), xmax = Math.min(inSize, Math.floor(c + support + 0.5));
    const w = [];
    let tot = 0;
    for (let x = xmin; x < xmax; x++) { const v = cubic((x - c + 0.5) / fs); w.push(v); tot += v; }
    res.push({ xmin, w: w.map(v => (tot ? v / tot : 0)) });
  }
  return res;
}
const clip = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function pixels(W, H, src) {
  const ch = coeffs(W, S), cv = coeffs(H, S);
  const mid = new Float32Array(S * H * 3);
  for (let y = 0; y < H; y++) {
    for (let i = 0; i < S; i++) {
      const { xmin, w } = ch[i];
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < w.length; k++) {
        const o = (y * W + xmin + k) * 4;
        r += src[o] * w[k]; g += src[o + 1] * w[k]; b += src[o + 2] * w[k];
      }
      const o = (y * S + i) * 3;
      mid[o] = clip(r); mid[o + 1] = clip(g); mid[o + 2] = clip(b);
    }
  }
  const out = new Float32Array(3 * S * S);
  for (let j = 0; j < S; j++) {
    const { xmin, w } = cv[j];
    for (let i = 0; i < S; i++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < w.length; k++) {
        const o = ((xmin + k) * S + i) * 3;
        r += mid[o] * w[k]; g += mid[o + 1] * w[k]; b += mid[o + 2] * w[k];
      }
      const p = j * S + i;
      out[p] = (clip(r) / 255 - 0.5) / 0.5;
      out[S * S + p] = (clip(g) / 255 - 0.5) / 0.5;
      out[2 * S * S + p] = (clip(b) / 255 - 0.5) / 0.5;
    }
  }
  return new ort.Tensor('float32', out, [1, 3, S, S]);
}

async function run(W, H, rgba) {
  await load();
  const hs = (await enc.run({ [enc.inputNames[0]]: pixels(W, H, rgba) }))[enc.outputNames[0]];
  const ids = [BOS];
  let lp = 0, n = 0;
  for (let s = 0; s < MAX_NEW; s++) {
    const feed = { input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]), encoder_hidden_states: hs };
    const lg = (await dec.run(feed)).logits;
    const V = lg.dims[2], d = lg.data, off = (ids.length - 1) * V;
    let best = 0, mx = -Infinity;
    for (let v = 0; v < V; v++) if (d[off + v] > mx) { mx = d[off + v]; best = v; }
    let sum = 0;
    for (let v = 0; v < V; v++) sum += Math.exp(d[off + v] - mx);
    lp += Math.log(1 / sum + 1e-8);
    n++;
    ids.push(best);
    if (best === EOS) break;
  }
  const raw = decode(ids.slice(1).filter(i => i !== EOS));
  return { raw, tex: vitoolsMfrTidy.clean(raw), score: Math.round(Math.exp(lp / Math.max(1, n)) * 1000) / 1000 };
}

self.onmessage = async e => {
  const m = e.data;
  try {
    let result;
    if (m.type === 'load') result = await load();
    else if (m.type === 'cached') result = await cachedAll();
    else if (m.type === 'run') result = await run(m.w, m.h, new Uint8ClampedArray(m.data));
    self.postMessage({ id: m.id, result });
  } catch (err) {
    self.postMessage({ id: m.id, error: (err && err.message) || String(err) });
  }
};
