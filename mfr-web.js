// 網頁版算式辨識：框好的一個算式（canvas）→ LaTeX。沒有本機辨識套件時用（有辨識套件的話用辨識套件，比較快）。
// 模型 models/mfr/（Pix2Text MFR 1.5 int8，約 33 MB）第一次用才下載，存瀏覽器快取；在 Web Worker 跑，不卡畫面。
//   vitoolsMfr.recognize(canvas) → { tex, raw, score }
//   vitoolsMfr.onprogress = m => { m.stage: 'download'（m.loaded／m.total）、'init' }
//   vitoolsMfr.cached() → 模型下載過了沒（桌面版、本機一律 true）
//   vitoolsMfr.clean(canvas)：辨識前的前處理（灰階、淺色變白，跟辨識套件 mathocr.clean 一樣），就地改
//   原卷裁圖用 vtdoc-view 的 sv.cropCanvas(page, box)（200 DPI，已經 clean 過）
(function () {
  'use strict';
  const BASE = new URL('.', document.currentScript.src).href;
  let worker = null, seq = 0, loadP = null;
  const wait = new Map();
  const api = { onprogress: null, threads: null };

  function start() {
    if (worker) return;
    worker = new Worker(BASE + 'mfr-worker.js');
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') { if (api.onprogress) api.onprogress(m); return; }
      const w = wait.get(m.id);
      if (!w) return;
      wait.delete(m.id);
      if (m.error) w.reject(new Error(m.error)); else w.resolve(m.result);
    };
    worker.onerror = e => {
      const err = new Error('算式辨識程式載入失敗' + (e.message ? '：' + e.message : '（可能沒有網路）'));
      wait.forEach(w => w.reject(err));
      wait.clear();
      worker.terminate();
      worker = null;
      loadP = null;
      e.preventDefault();
    };
  }
  function call(type, data, transfer) {
    start();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      wait.set(id, { resolve, reject });
      worker.postMessage(Object.assign({ id, type }, data || {}), transfer || []);
    });
  }

  api.load = () => loadP || (loadP = call('load').then(r => { api.threads = r.threads; return r; }).catch(e => { loadP = null; throw e; }));
  api.cached = () => call('cached');
  api.loaded = () => api.threads != null;

  // 灰階、>=200 變白（PIL convert('L') 的算法）
  api.clean = function (cv) {
    const cx = cv.getContext('2d');
    const im = cx.getImageData(0, 0, cv.width, cv.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      let L = (d[i] * 19595 + d[i + 1] * 38470 + d[i + 2] * 7471 + 0x8000) >> 16;
      if (L >= 200) L = 255;
      d[i] = d[i + 1] = d[i + 2] = L;
      d[i + 3] = 255;
    }
    cx.putImageData(im, 0, 0);
    return cv;
  };

  api.recognize = function (cv) {
    if (!cv || cv.width < 4 || cv.height < 4) return Promise.reject(new Error('框太小'));
    return api.load().then(() => {
      const im = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      return call('run', { w: cv.width, h: cv.height, data: im.data.buffer }, [im.data.buffer]);
    });
  };

  window.vitoolsMfr = api;
})();
