// 網頁版文字辨識：圖（canvas）→ 一行一行的字。沒有本機辨識套件時用（有辨識套件的話用辨識套件，它還會分版面、認算式）。
// 模型 models/ocr/（PP-OCRv6 small，PaddleOCR，Apache-2.0）第一次用才下載，存瀏覽器快取；在 Web Worker 跑，不卡畫面。
//   vitoolsOcr.recognize(canvas) → [{ box:[x0,y0,x1,y1]（canvas 像素）, text, score }]，由上而下、由左而右
//   vitoolsOcr.onprogress = m => { m.stage: 'download'（m.loaded／m.total）、'init' }
//   vitoolsOcr.cached() → 模型下載過了沒（桌面版、本機一律 true）
//   vitoolsOcr.config({ model: 'models/ocr-test/xxx/' })：試驗用，換模型資料夾
(function () {
  'use strict';
  const BASE = new URL('.', document.currentScript.src).href;
  let worker = null, seq = 0, loadP = null;
  const wait = new Map();
  const api = { onprogress: null, threads: null };

  function start() {
    if (worker) return;
    worker = new Worker(BASE + 'ocr-worker.js');
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') { if (api.onprogress) api.onprogress(m); return; }
      const w = wait.get(m.id);
      if (!w) return;
      wait.delete(m.id);
      if (m.error) w.reject(new Error(m.error)); else w.resolve(m.result);
    };
    worker.onerror = e => {
      const err = new Error('文字辨識程式載入失敗' + (e.message ? '：' + e.message : '（可能沒有網路）'));
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

  api.config = o => { loadP = null; api.threads = null; return call('config', o); };
  api.load = () => loadP || (loadP = call('load').then(r => { api.threads = r.threads; return r; }).catch(e => { loadP = null; throw e; }));
  api.cached = () => call('cached');
  api.loaded = () => api.threads != null;
  api.recognize = function (cv) {
    const im = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    return api.load().then(() => call('ocr', { width: cv.width, height: cv.height, data: im.data }, [im.data.buffer]));
  };

  window.vitoolsOcr = api;
})();
