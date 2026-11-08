// 本機vi-tools 辨識套件的「辨識一塊」（辨識套件 app/exam/region.py、server.py 的 /api/ocr）。
// 偵測到才有功能：辨識套件沒開（或沒裝）時 detect() 回 null，頁面就不顯示辨識的按鈕。
// 之後桌面版的辨識套件也提供同樣的 /api/ocr，這邊不用改。
//   const hd = await vitoolsHaodian.detect()        → { base:'http://127.0.0.1:18760/', version } 或 null
//   await vitoolsHaodian.recognize(src, box, { type, mode })
//     src：vtdoc-view 的 regionSource(p, box)；box：[x0,y0,x1,y1]（頁面比例）
//     type：q 題目、opt 選項、其他照文字；mode：auto（文字＋算式）／math（整塊一個算式）
//     → { lines:[…] }（算式寫成 \( \)）或 { tex, score }
(function () {
  'use strict';
  const PORTS = [];
  for (let p = 18760; p < 18780; p++) PORTS.push(p);
  let found = null;
  const sent = new Set();   // 這次開頁面已經送過 PDF 的 sha256

  function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

  function ping(port) {
    const base = 'http://127.0.0.1:' + port + '/';
    return Promise.race([fetch(base + 'api/ocr', { cache: 'no-store' }), timeout(1500)])
      .then(r => r.ok ? r.json() : null)
      .then(j => j && j.ocr ? { base, version: j.version, modes: j.ocr } : null)
      .catch(() => null);
  }

  // 20 個連接埠一起試，第一個回應的就是
  function detect() {
    return Promise.all(PORTS.map(ping)).then(rs => (found = rs.find(Boolean) || null));
  }

  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  const shaCache = new WeakMap();
  function sha256(u8) {
    if (shaCache.has(u8)) return Promise.resolve(shaCache.get(u8));
    return crypto.subtle.digest('SHA-256', u8).then(h => {
      const hex = [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
      shaCache.set(u8, hex);
      return hex;
    });
  }

  function post(body) {
    return fetch(found.base + 'api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => r.json().then(j => { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }));
  }

  function recognize(src, box, opt) {
    if (!found) return Promise.reject(new Error('沒有連上辨識套件'));
    const o = Object.assign({ type: 'p', mode: 'auto' }, opt || {});
    if (!src) return Promise.reject(new Error('沒有原卷'));
    if (src.kind === 'image') return post({ mode: o.mode, type: o.type, image: src.image });
    return sha256(src.data).then(sha => {
      const body = { mode: o.mode, type: o.type, pdf_sha256: sha, page: src.page, box };
      // PDF 只送一次（辨識套件照 sha256 記住）；辨識套件重開過記不得了會回 need_pdf，再連 PDF 一起送
      if (!sent.has(sha)) body.pdf = b64(src.data);
      return post(body).then(r => {
        sent.add(sha);
        if (!r.need_pdf) return r;
        body.pdf = b64(src.data);
        return post(body);
      });
    });
  }

  window.vitoolsHaodian = { detect, recognize, get found() { return found; } };
})();
