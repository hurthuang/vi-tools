// 版面整理直接開原始文件（不用辨識套件）：PDF、圖檔、Word、純文字 → 中繼檔（.vtdoc.html，規格 docs/notes/vtdoc.md）。
//   有開 vi-tools 辨識套件時，PDF／圖檔交給它整份辨識（haodian-ocr.js 的 doc），這裡是沒有辨識套件時用的：
//   - PDF：讀文字層，一行一行接成段落，照開頭判斷類型（題號→題目、(A)→選項、一、→大題），帶原卷與位置（data-box）
//          算式不會辨識（PDF 文字層的算式多半是亂的），在版面整理拉框「辨識成一個算式」
//   - 圖檔：帶原卷（每頁一張）；有網頁版文字辨識（ocr-web.js）就辨識文字，沒有就在版面整理拉框新增
//   - PDF 的掃描頁（沒有文字層）、附圖裡的字（文字層讀不到）：有網頁版文字辨識就用它
//     opt.ocr(canvas, what) → [{ box:[x0,y0,x1,y1]（canvas 像素）, text, score }]（版面整理傳進來，沒有就不辨識）
//   - Word（.docx）、純文字：照段落判斷類型，沒有原卷
//   await vitoolsVtdocBuild.fromFiles(files, { onProgress(msg) }) → { html, name, note }
(function () {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const PDF_EMBED_MAX = 15 * 1024 * 1024;   // 同辨識套件：超過就改放每頁圖
  const PAGE_SIDE = 1600;                    // 每頁圖的長邊（同辨識套件）
  const IMG_EXT = /\.(png|jpe?g|gif|bmp|webp)$/i;

  const load = window.loadScript || (src => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('無法載入：' + src));
    document.head.appendChild(s);
  }));
  function pdfReady() {
    return window.pdfjsLib ? Promise.resolve() : load(PDFJS + 'pdf.min.js').then(() => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    });
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function attr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function sha256(u8) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', u8).then(h => [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''));
  }
  function now() {
    const d = new Date(), z = -d.getTimezoneOffset(), p = n => String(Math.abs(n)).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' +
      p(d.getSeconds()) + (z >= 0 ? '+' : '-') + p(Math.floor(Math.abs(z) / 60)) + ':' + p(Math.abs(z) % 60);
  }
  function baseName(n) { return String(n || '文件').replace(/\.[^.]+$/, ''); }

  // ---------- 一行文字 → 類型（跟辨識套件的自動分區塊同樣的開頭判斷，簡化版） ----------
  const RE_Q = /^\s*(\d{1,3})\s*[.．、](?!\d)/;
  const RE_OPT = /^\s*(?:[（(]\s*([A-EＡ-Ｅ])\s*[)）]|([①-⑩]))/;
  const RE_SEC = /^\s*[一二三四五六七八九十]{1,3}\s*[、.．]/;
  const RE_ITEM = /^\s*(?:[（(]\s*(?:\d{1,2}|[甲乙丙丁戊己庚辛]|[一二三四五六七八九十])\s*[)）]|[⑴-⒇])/;
  function kindOf(t) {
    if (RE_Q.test(t)) return 'q';
    if (RE_OPT.test(t)) return 'opt';
    if (RE_SEC.test(t)) return 'h2';
    if (RE_ITEM.test(t)) return 'item';
    return 'p';
  }
  function optLabel(t) {
    const m = t.match(RE_OPT);
    if (!m) return '';
    if (m[1]) return String.fromCharCode(m[1].charCodeAt(0) > 0xff ? m[1].charCodeAt(0) - 0xfee0 : m[1].charCodeAt(0));
    return m[2];
  }
  // 一行好幾個選項「(A) 3 (B) 4 (C) 5」→ 拆開
  function splitOpts(t) {
    if (!RE_OPT.test(t)) return [t];
    const parts = t.split(/\s*(?=[（(]\s*[A-EＡ-Ｅ]\s*[)）])/).filter(s => s.trim());
    return parts.length > 1 && parts.every(s => RE_OPT.test(s)) ? parts : [t];
  }

  // 段落清單 [{ text, kind?, page?, box? }] → <main> 的內容（題目包成 section，選項放在題目裡）
  function bodyHtml(paras) {
    const out = [];
    let inQ = false, page = 1, title = false, n = 0;
    const close = () => { if (inQ) { out.push('</section>'); inQ = false; } };
    paras.forEach(p => {
      if (p.page && p.page > page) {
        close();
        for (let k = page + 1; k <= p.page; k++) out.push(`<hr class="vt-page" data-page="${k}" aria-hidden="true">`);
        page = p.page;
      }
      const box = p.box ? ` data-box="${p.page} ${p.box.map(v => v.toFixed(4)).join(' ')}"` : '';
      const blk = p.page ? ` data-blk="p${p.page}-b${n++}"` : '';
      if (p.fig) {   // 附圖：輸出方式＝標附圖、做觸圖；圖裡的字當標籤（座標是圖的像素）
        const f = p.fig, W = f.box[2] - f.box[0], H = f.box[3] - f.box[1];
        const alt = f.labels.length ? '圖中文字：' + f.labels.map(l => l.text).join('、') : '附圖';
        const lis = f.labels.map(l => `<li data-x="${Math.round((l.cx - f.box[0]) / W * f.w)}" data-y="${Math.round((l.cy - f.box[1]) / H * f.h)}">${esc(l.text)}</li>`).join('');
        out.push(`<figure class="vt-fig" data-how="mark" data-tactile="1"${blk}${box}><img src="${f.src}" alt="${attr(alt)}">` +
          (lis ? `<ul class="vt-labels" hidden>${lis}</ul>` : '') + '</figure>');
        return;
      }
      const kind = p.kind || kindOf(p.text);
      const tx = esc(p.text);
      if (!title && kind === 'p' && !out.length && p.text.length <= 60) { out.push(`<h1${blk}${box}>${tx}</h1>`); title = true; return; }
      if (kind === 'h2') { close(); out.push(`<h2 class="vt-section"${blk}${box}>${tx}</h2>`); return; }
      if (kind === 'q') {
        close();
        const m = p.text.match(RE_Q);
        out.push(`<section class="vt-q" data-num="${m ? m[1] : ''}"${blk}${box}><h3>${tx}</h3>`);
        inQ = true;
        return;
      }
      if (kind === 'opt') { out.push(`<p class="vt-opt" data-label="${attr(optLabel(p.text))}"${blk}${box}>${tx}</p>`); return; }
      if (kind === 'item') { out.push(`<p class="vt-item"${blk}${box}>${tx}</p>`); return; }
      out.push(`<p${blk}${box}>${tx}</p>`);
    });
    close();
    return out.join('\n');
  }

  const STYLE = "body{font-family:'Microsoft JhengHei',sans-serif;font-size:20px;line-height:2;max-width:860px;margin:0 auto;padding:24px;color:#111;background:#fff}" +
    'h1{font-size:1.4em}h2{font-size:1.2em;border-bottom:2px solid #036;color:#036;margin-top:1.6em}' +
    'h3{font-size:1em;margin:1.2em 0 .3em}.vt-opt{margin:.2em 0 .2em 1.5em}hr.vt-page{border:0;border-top:1px dashed #bbb}@media print{body{font-size:14pt}}';

  function makeDoc(title, source, body, tail, note) {
    const t = now();
    const meta = { format: 'vtdoc', version: 1, title, subject: '', source, created: t, modified: t,
      history: [{ tool: '版面整理', time: t, note }] };
    if (!source) delete meta.source;
    return '<!DOCTYPE html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="generator" content="vtdoc 1">\n' +
      `<title>${esc(title)}</title>\n<script type="application/json" id="vtdoc-meta">${JSON.stringify(meta).replace(/</g, '\\u003c')}</script>\n` +
      `<style>${STYLE}</style>\n</head>\n<body>\n<main>\n${body}\n</main>\n${tail || ''}</body>\n</html>\n`;
  }
  function titleOf(paras, name) {
    const p = paras.find(x => x.text.trim());
    return p && p.text.length <= 60 && kindOf(p.text) === 'p' ? p.text.trim() : baseName(name);
  }

  // ---------- PDF ----------
  // 一頁的文字層 → 行 [{ text, box:[x0,y0,x1,y1] }]（頁面比例），照閱讀順序（兩欄：先左欄再右欄）
  function pageLines(pg) {
    const vp = pg.getViewport({ scale: 1 });
    return pg.getTextContent().then(tc => {
      const its = [];
      tc.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const e = it.transform[4], f = it.transform[5];
        const h = it.height || Math.hypot(it.transform[2], it.transform[3]);
        const r = vp.convertToViewportRectangle([e, f, e + (it.width || 0), f + h]);
        its.push({ s: it.str, b: [Math.min(r[0], r[2]) / vp.width, Math.min(r[1], r[3]) / vp.height,
          Math.max(r[0], r[2]) / vp.width, Math.max(r[1], r[3]) / vp.height] });
      });
      const chars = its.reduce((n, x) => n + x.s.trim().length, 0);
      const g = gutter(its);
      its.forEach(x => { x.col = colOf(x.b, g); });
      // 跨過分界、左右兩塊緊接著（間隔不到字高的 0.4）的（置中的標題、頁尾）是同一行，不分欄
      if (g != null) {
        const sameRow = (a, b) => Math.min(a.b[3], b.b[3]) - Math.max(a.b[1], b.b[1]) > 0.5 * Math.min(a.b[3] - a.b[1], b.b[3] - b.b[1]);
        for (let changed = true; changed;) {
          changed = false;
          its.forEach(a => {
            if (a.col !== 1) return;
            its.forEach(b => {
              if (b.col === 1 || !sameRow(a, b) || b.b[0] - a.b[2] > 0.4 * (a.b[3] - a.b[1]) || b.b[0] < a.b[0]) return;
              if (a.col !== 0 || b.col !== 0) { a.col = 0; b.col = 0; changed = true; }
            });
          });
          its.forEach(b => {
            if (b.col !== 2) return;
            its.forEach(a => { if (a.col === 0 && sameRow(a, b) && b.b[0] - a.b[2] <= 0.4 * (a.b[3] - a.b[1]) && b.b[0] >= a.b[0]) { b.col = 0; changed = true; } });
          });
        }
      }
      const lines = [];
      its.sort((x, y) => (x.b[1] + x.b[3]) - (y.b[1] + y.b[3])).forEach(x => {
        // 同一行：同一欄、垂直方向重疊一半以上，而且水平方向不能隔太遠
        const ln = lines.find(l => l.col === x.col && Math.min(l.hi, x.b[3]) - Math.max(l.lo, x.b[1]) > 0.5 * Math.min(l.hi - l.lo, x.b[3] - x.b[1]) &&
          l.its.some(y => x.b[0] - y.b[2] < 0.06 && y.b[0] - x.b[2] < 0.06));
        if (ln) { ln.its.push(x); ln.lo = Math.min(ln.lo, x.b[1]); ln.hi = Math.max(ln.hi, x.b[3]); }
        else lines.push({ its: [x], lo: x.b[1], hi: x.b[3], col: x.col });
      });
      const out = lines.map(l => {
        l.its.sort((x, y) => x.b[0] - y.b[0]);
        let t = '';
        // 英數字之間：PDF 裡真的隔開（超過字高的 1/4）才補空白；「1 1 2學年度」這種一字一塊的接回去
        let prev = null;
        l.its.forEach(x => {
          const gap = prev ? x.b[0] - prev.b[2] : 0, h = x.b[3] - x.b[1];
          if (t && /[A-Za-z0-9]$/.test(t) && /^[A-Za-z0-9]/.test(x.s) && gap > 0.25 * h) t += ' ';
          t += x.s;
          prev = x;
        });
        const bx = [Math.min(...l.its.map(x => x.b[0])), l.lo, Math.max(...l.its.map(x => x.b[2])), l.hi].map(v => Math.max(0, Math.min(1, v)));
        return { text: t.replace(/\s+/g, ' ').trim(), box: bx, col: l.col };
      }).filter(l => l.text);
      return { lines: order(out), chars, gutter: g };
    });
  }
  // 兩欄的分界（頁面比例的 x）：頁面中間找一條幾乎沒有字跨過、左右兩邊都有不少字的直線；不是兩欄 → null
  // 網頁版文字辨識的結果（canvas 像素）→ 行：同一欄、上下重疊一半以上的片段接成一行，兩欄的頁先左欄再右欄
  function ocrLines(res, W, H) {
    const its = res.map(r => ({ s: r.text, b: [r.box[0] / W, r.box[1] / H, r.box[2] / W, r.box[3] / H] }));
    const g = gutter(its);
    its.forEach(x => { x.col = colOf(x.b, g); });
    its.sort((a, b) => a.b[1] - b.b[1]);
    const rows = [];
    its.forEach(x => {
      const h = x.b[3] - x.b[1];
      const r = rows.find(r => r.col === x.col && Math.min(r.b[3], x.b[3]) - Math.max(r.b[1], x.b[1]) > 0.5 * Math.min(h, r.b[3] - r.b[1]));
      if (r) { r.its.push(x); r.b = [Math.min(r.b[0], x.b[0]), Math.min(r.b[1], x.b[1]), Math.max(r.b[2], x.b[2]), Math.max(r.b[3], x.b[3])]; }
      else rows.push({ col: x.col, b: x.b.slice(), its: [x] });
    });
    const lines = rows.map(r => {
      r.its.sort((a, b) => a.b[0] - b.b[0]);
      let t = '';
      r.its.forEach((x, k) => {
        const gap = k ? x.b[0] - r.its[k - 1].b[2] : 0, h = x.b[3] - x.b[1];
        if (t && (gap > 0.6 * h || (/[A-Za-z0-9]$/.test(t) && /^[A-Za-z0-9]/.test(x.s)))) t += ' ';
        t += x.s;
      });
      return { text: t.replace(/\s+/g, ' ').trim(), box: r.b, col: r.col };
    }).filter(l => l.text);
    return { lines: order(lines), gutter: g };
  }
  function pageCanvas(pg, side) {
    const vp1 = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: side / Math.max(vp1.width, vp1.height) });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    return pg.render({ canvasContext: cx, viewport: vp }).promise.then(() => cv);
  }

  function gutter(its) {
    let best = null;
    for (let g = 0.3; g <= 0.7; g += 0.005) {
      let L = 0, R = 0, X = 0;
      its.forEach(x => { if (x.b[2] <= g + 0.002) L++; else if (x.b[0] >= g - 0.002) R++; else X++; });
      if (L < 8 || R < 8 || X > Math.max(2, 0.04 * its.length)) continue;
      const score = X * 10 + Math.abs(g - 0.5);
      if (!best || score < best.score) best = { g, score };
    }
    return best ? best.g : null;
  }
  // 0＝跨兩欄（或不是兩欄）、1＝左欄、2＝右欄
  function colOf(b, g) {
    if (g == null) return 0;
    if (b[2] <= g + 0.01) return 1;
    if (b[0] >= g - 0.01) return 2;
    return 0;
  }
  // 一頁裡內嵌的圖片 → 框 [x0,y0,x1,y1]（頁面比例）；太小（圖示、裝飾）、太大（整頁掃描、底圖）的不算，重疊的併成一張
  async function imageBoxes(pg) {
    const vp = pg.getViewport({ scale: 1 });
    const ops = await pg.getOperatorList();
    const O = pdfjsLib.OPS;
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    let ctm = [1, 0, 0, 1, 0, 0];
    const st = [], out = [];
    const PAINT = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintJpegXObject].filter(x => x != null));
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === O.save) st.push(ctm);
      else if (fn === O.restore) ctm = st.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === O.transform) ctm = mul(ctm, a);
      else if (fn === O.paintFormXObjectBegin) { st.push(ctm); if (a && a[0]) ctm = mul(ctm, a[0]); }
      else if (fn === O.paintFormXObjectEnd) ctm = st.pop() || [1, 0, 0, 1, 0, 0];
      else if (PAINT.has(fn)) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) =>
          vp.convertToViewportPoint(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]));
        const xs = pts.map(p => p[0] / vp.width), ys = pts.map(p => p[1] / vp.height);
        const b = [Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys)), Math.min(1, Math.max(...xs)), Math.min(1, Math.max(...ys))];
        const area = (b[2] - b[0]) * (b[3] - b[1]);
        if (area > 0.003 && area < 0.6) out.push(b);
      }
    }
    // 重疊或幾乎相連的併起來（一張圖切成好幾塊存的 PDF）
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < out.length && !changed; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i], b = out[j];
          if (a[0] <= b[2] + 0.005 && b[0] <= a[2] + 0.005 && a[1] <= b[3] + 0.005 && b[1] <= a[3] + 0.005) {
            out[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
            out.splice(j, 1);
            changed = true;
            break;
          }
        }
      }
    }
    return out;
  }
  // 附圖的圖（JPEG dataURL，長邊最多 1400）
  async function cropFigures(pg, figs) {
    const vp1 = pg.getViewport({ scale: 1 });
    const sc = 2000 / Math.max(vp1.width, vp1.height);
    const vp = pg.getViewport({ scale: sc });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: cx, viewport: vp }).promise;
    figs.forEach(f => {
      const [x0, y0, x1, y1] = [f.box[0] * cv.width, f.box[1] * cv.height, f.box[2] * cv.width, f.box[3] * cv.height].map(Math.round);
      const s = Math.min(1, 1400 / Math.max(x1 - x0, y1 - y0));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((x1 - x0) * s)); c.height = Math.max(1, Math.round((y1 - y0) * s));
      c.getContext('2d').drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
      f.src = c.toDataURL('image/jpeg', 0.85);
      f.w = c.width; f.h = c.height;
    });
    cv.width = cv.height = 0;
  }
  // 圖片框裡（外擴一點）的文字行 → 那張附圖的標籤，不再當段落
  function attachLabels(lines, figs) {
    const rest = [];
    lines.forEach(l => {
      const cx = (l.box[0] + l.box[2]) / 2, cy = (l.box[1] + l.box[3]) / 2;
      const f = figs.find(f => cx >= f.box[0] - 0.01 && cx <= f.box[2] + 0.01 && cy >= f.box[1] - 0.01 && cy <= f.box[3] + 0.01 &&
        (l.text.length <= 12 || (l.box[0] >= f.box[0] - 0.01 && l.box[2] <= f.box[2] + 0.01)));
      if (!f) { rest.push(l); return; }
      f.labels.push({ text: l.text, cx, cy });
    });
    return rest;
  }

  // 閱讀順序：由上往下；兩欄的頁，兩條跨欄的行（標題、跨欄的圖）之間先左欄再右欄
  function order(lines) {
    lines.sort((a, b) => a.box[1] - b.box[1]);
    if (!lines.some(l => l.col)) return lines;
    const out = [];
    let seg = [];
    const flush = () => { out.push(...seg.filter(x => x.col === 1), ...seg.filter(x => x.col === 2)); seg = []; };
    lines.forEach(l => { if (l.col) seg.push(l); else { flush(); out.push(l); } });
    flush();
    return out;
  }
  // 行 → 段落：同一欄、上下靠得近、下一行不是新的題號／選項／小項，就接起來
  function joinLines(lines, page) {
    const paras = [];
    let cur = null;
    lines.forEach(l => {
      if (l.fig) { cur = null; paras.push({ fig: l.fig, page, box: l.box, text: '' }); return; }
      const h = l.box[3] - l.box[1];
      const k = kindOf(l.text);
      const near = cur && l.box[1] - cur.last[3] < 0.9 * h && l.box[1] >= cur.last[1] &&
        Math.abs(l.box[0] - cur.box[0]) < 0.12 && Math.min(l.box[2], cur.box[2]) > Math.max(l.box[0], cur.box[0]);
      if (near && k === 'p' && !/[。？！?!：:]$/.test(cur.text) ||
          near && k === 'p' && cur.last[2] > cur.box[2] - 0.02 && cur.text.length > 15) {
        const sp = /[A-Za-z0-9,.]$/.test(cur.text) && /^[A-Za-z0-9]/.test(l.text) ? ' ' : '';
        cur.text += sp + l.text;
        cur.box = [Math.min(cur.box[0], l.box[0]), cur.box[1], Math.max(cur.box[2], l.box[2]), l.box[3]];
        cur.last = l.box;
        return;
      }
      splitOpts(l.text).forEach((t, j, all) => {
        cur = { text: t, page, box: l.box.slice(), last: l.box };
        if (all.length > 1) cur.kind = 'opt';
        paras.push(cur);
      });
    });
    paras.forEach(p => delete p.last);
    return paras;
  }

  function renderPage(pdf, n) {
    return pdf.getPage(n).then(pg => {
      const vp1 = pg.getViewport({ scale: 1 });
      const sc = PAGE_SIDE / Math.max(vp1.width, vp1.height);
      const vp = pg.getViewport({ scale: sc });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      return pg.render({ canvasContext: cx, viewport: vp }).promise.then(() => cv.toDataURL('image/jpeg', 0.8).split(',')[1]);
    });
  }

  // 附圖：文字層讀不到字的，用網頁版文字辨識認圖裡的字當標籤（12 個字以內的才算）
  //   圖裡的字常常很小（座標軸的數字），那一塊另外算成高解析度的圖（最多 4 倍＝288 DPI，長邊最多 2000）再辨識
  async function figCanvas(pg, box) {
    const vp1 = pg.getViewport({ scale: 1 });
    const w = (box[2] - box[0]) * vp1.width, h = (box[3] - box[1]) * vp1.height;
    const k = Math.min(4, 2000 / Math.max(w, h, 1));
    const vp = pg.getViewport({ scale: k });
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: cx, viewport: vp, transform: [1, 0, 0, 1, -box[0] * vp.width, -box[1] * vp.height] }).promise;
    return cv;
  }
  async function figLabels(pg, figs, ocr, progress, n) {
    for (let k = 0; k < figs.length; k++) {
      const f = figs[k];
      if (!ocr || f.labels.length) continue;
      const cv = await figCanvas(pg, f.box);
      progress('第 ' + n + ' 頁：辨識附圖裡的字（' + (k + 1) + '／' + figs.length + '）');
      const res = await ocr(cv, 'fig').catch(() => []);
      res.forEach(r => {
        const t = r.text.trim();
        if (!t || t.length > 12) return;
        const cx = (r.box[0] + r.box[2]) / 2 / cv.width, cy = (r.box[1] + r.box[3]) / 2 / cv.height;
        f.labels.push({ text: t, cx: f.box[0] + cx * (f.box[2] - f.box[0]), cy: f.box[1] + cy * (f.box[3] - f.box[1]) });
      });
      f.ocr = f.labels.length > 0;
      cv.width = cv.height = 0;
    }
  }

  async function fromPdf(file, progress, ocr) {
    await pdfReady();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
    const paras = [], scanned = [], ocrd = [];
    let nfig = 0, nfigOcr = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      progress('讀 PDF 文字層：第 ' + n + '／' + pdf.numPages + ' 頁');
      const pg = await pdf.getPage(n);
      const r = await pageLines(pg);
      if (r.chars < 20) {
        if (!ocr) { scanned.push(n); continue; }
        // 掃描頁：整頁算成圖（長邊 2000，跟辨識套件 RapidOCR 一樣）用網頁版文字辨識
        progress('第 ' + n + '／' + pdf.numPages + ' 頁是掃描頁：網頁版文字辨識中（一頁大約 10～20 秒）');
        const cv = await pageCanvas(pg, 2000);
        const res = await ocr(cv, 'page');
        const o = ocrLines(res, cv.width, cv.height);
        cv.width = cv.height = 0;
        if (o.lines.length) { paras.push(...joinLines(o.lines, n)); ocrd.push(n); } else scanned.push(n);
        continue;
      }
      const figs = (await imageBoxes(pg).catch(() => [])).map(box => ({ box, labels: [] }));
      let lines = r.lines;
      if (figs.length) {
        progress('第 ' + n + ' 頁：裁附圖（' + figs.length + ' 張）');
        lines = attachLabels(lines, figs);
        await cropFigures(pg, figs);
        await figLabels(pg, figs, ocr, progress, n);
        nfigOcr += figs.filter(f => f.ocr).length;
        lines = order(lines.concat(figs.map(f => ({ text: '', box: f.box, fig: f, col: colOf(f.box, r.gutter) }))));
        nfig += figs.length;
      }
      paras.push(...joinLines(lines, n));
    }
    const source = { name: file.name, kind: 'pdf', pages: pdf.numPages, sha256: await sha256(data) };
    let tail;
    if (data.length <= PDF_EMBED_MAX) {
      source.embed = 'pdf';
      tail = `<script type="application/pdf" id="vtdoc-source">${b64(data)}</script>\n`;
    } else {
      source.embed = 'pages';
      const ps = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        progress('PDF 太大（超過 15 MB），改放每頁的圖：第 ' + n + '／' + pdf.numPages + ' 頁');
        ps.push(`<script type="image/jpeg" class="vtdoc-page" data-page="${n}">${await renderPage(pdf, n)}</script>\n`);
      }
      tail = ps.join('');
    }
    let note = '讀 PDF 文字層，自動分成 ' + (paras.length - nfig) + ' 段' + (nfig ? '、附圖 ' + nfig + ' 張' : '') + '（沒有辨識算式）';
    if (ocrd.length) note += '；第 ' + ocrd.join('、') + ' 頁是掃描頁，用網頁版文字辨識（請對照原卷檢查）';
    if (nfigOcr) note += '；' + nfigOcr + ' 張附圖裡的字用網頁版文字辨識';
    if (scanned.length) note += '；第 ' + scanned.join('、') + ' 頁沒有文字層（掃描頁）';
    return { html: makeDoc(titleOf(paras, file.name), source, bodyHtml(paras), tail, note), name: baseName(file.name) + '.vtdoc.html', note,
      scanned, pages: pdf.numPages };
  }

  // ---------- 圖檔（可以一次選好幾張，一張一頁） ----------
  function imagePage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const s = Math.min(1, PAGE_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.naturalWidth * s); cv.height = Math.round(im.naturalHeight * s);
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片打不開：' + file.name)); };
      im.src = url;
    });
  }
  function fileCanvas(file, side) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const s = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.naturalWidth * s); cv.height = Math.round(im.naturalHeight * s);
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片打不開：' + file.name)); };
      im.src = url;
    });
  }
  async function fromImages(files, progress, ocr) {
    const ps = [], paras = [];
    let got = 0;
    for (let i = 0; i < files.length; i++) {
      progress('讀圖：第 ' + (i + 1) + '／' + files.length + ' 張');
      ps.push(`<script type="image/jpeg" class="vtdoc-page" data-page="${i + 1}">${await imagePage(files[i])}</script>\n`);
      if (!ocr) continue;
      progress('第 ' + (i + 1) + '／' + files.length + ' 張：網頁版文字辨識中（一張大約 10～20 秒）');
      const cv = await fileCanvas(files[i], 2000);
      const o = ocrLines(await ocr(cv, 'page'), cv.width, cv.height);
      cv.width = cv.height = 0;
      if (o.lines.length) got++;
      paras.push(...joinLines(o.lines, i + 1));
    }
    const hrs = files.map((f, i) => i ? `<hr class="vt-page" data-page="${i + 1}" aria-hidden="true">` : '').filter(Boolean).join('\n');
    // 有辨識的：照段落排；最後一頁之前沒有字的頁也要換頁線，bodyHtml 遇到下一頁的段落才補
    const body = paras.length ? bodyHtml(paras) + (paras[paras.length - 1].page < files.length ?
      '\n' + files.map((f, i) => i + 1 > paras[paras.length - 1].page ? `<hr class="vt-page" data-page="${i + 1}" aria-hidden="true">` : '').filter(Boolean).join('\n') : '') : hrs;
    const note = '圖檔 ' + files.length + ' 張' + (ocr ? '，用網頁版文字辨識自動分成 ' + paras.length + ' 段（沒有辨識算式，請對照原卷檢查）' : '（沒有辨識文字）');
    const source = { name: files.map(f => f.name).join('、'), kind: 'image', pages: files.length, embed: 'pages' };
    return { html: makeDoc(paras.length ? titleOf(paras, files[0].name) : baseName(files[0].name), source, body, ps.join(''), note),
      name: baseName(files[0].name) + '.vtdoc.html', note, pages: files.length, images: !got };
  }

  // ---------- Word、純文字 ----------
  function fromText(text, name, what) {
    const paras = [];
    String(text).replace(/\r\n?/g, '\n').split('\n').forEach(l => {
      const t = l.replace(/\s+/g, ' ').trim();
      if (!t) return;
      splitOpts(t).forEach((s, j, all) => paras.push(all.length > 1 ? { text: s, kind: 'opt' } : { text: s }));
    });
    const note = what + '，自動分成 ' + paras.length + ' 段（沒有原卷）';
    return { html: makeDoc(titleOf(paras, name), null, bodyHtml(paras), '', note), name: baseName(name) + '.vtdoc.html', note };
  }
  async function fromDocx(file) {
    if (typeof window.docxXmlToText !== 'function') await load('shared.js');
    if (!window.JSZip) await load(JSZIP);
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const read = async n => { const f = zip.file(n); return f ? f.async('string') : ''; };
    const xml = await read('word/document.xml');
    if (!xml) throw new Error('找不到 word/document.xml，不是 Word 檔？');
    return fromText(docxXmlToText(xml, await read('word/numbering.xml'), await read('word/styles.xml')), file.name, 'Word 檔');
  }

  function kind(f) {
    const n = f.name.toLowerCase();
    if (/\.vtdoc\.html?$|\.html?$/.test(n)) return 'vtdoc';
    if (n.endsWith('.pdf')) return 'pdf';
    if (IMG_EXT.test(n)) return 'image';
    if (n.endsWith('.docx')) return 'docx';
    if (n.endsWith('.txt')) return 'txt';
    return '';
  }

  async function fromFiles(files, opt) {
    const progress = (opt && opt.onProgress) || (() => {});
    files = [...files];
    const k = kind(files[0]);
    const ocr = opt && opt.ocr;
    if (k === 'image') return fromImages(files.filter(f => kind(f) === 'image'), progress, ocr);
    if (files.length > 1) throw new Error('一次只能開一個檔（圖檔可以一次選好幾張）');
    if (k === 'pdf') return fromPdf(files[0], progress, ocr);
    if (k === 'docx') return fromDocx(files[0]);
    if (k === 'txt') return fromText(await files[0].text(), files[0].name, '純文字檔');
    throw new Error('不支援這種檔案：' + files[0].name + '（可以開中繼檔、PDF、圖檔、Word .docx、.txt）');
  }

  window.vitoolsVtdocBuild = { fromFiles, kind, kindOf, ocrLines };
})();
