// 本機 vi-tools 辨識套件的「辨識一塊」（辨識套件 app/exam/region.py、server.py 的 /api/ocr）。
// 偵測到才有功能：辨識套件沒開（或沒裝）時 detect() 回 null，頁面就不顯示辨識的按鈕。
// 之後桌面版的辨識套件也提供同樣的 /api/ocr，這邊不用改。
//   const hd = await vitoolsHaodian.detect()        （打開頁面時用 detect({ auto: true })，見下面）→ { base:'http://127.0.0.1:18760/', version } 或 null
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
      .then(j => j && j.ocr ? { base, version: j.version, modes: j.ocr, doc: !!j.doc } : null)
      .catch(() => null);
  }

  // 20 個連接埠一起試，第一個回應的就是。
  // 打開頁面時自動找用 detect({ auto: true })：這台瀏覽器連上過辨識套件才真的去找。
  //   沒裝的人不要每次都連本機（Chrome 會問要不要允許存取區域網路，主控台也一堆連不上的錯誤）；
  //   第一次請使用者按「找本機辨識套件」（detect()），找到就記住（localStorage）
  const SEEN = 'vitools-recognizer-seen';
  function seen() { try { return !!localStorage.getItem(SEEN); } catch (e) { return false; } }
  function detect(opt) {
    if (opt && opt.auto && !seen()) return Promise.resolve(found = null);
    return Promise.all(PORTS.map(ping)).then(rs => {
      found = rs.find(Boolean) || null;
      if (found) try { localStorage.setItem(SEEN, '1'); } catch (e) { /* 存不了就每次按 */ }
      return found;
    });
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

  // 整份原卷（PDF、圖檔）→ 中繼檔的 HTML（辨識套件 0.3 起的 /api/doc，試卷模式；found.doc 為 true 才有）
  //   await vitoolsHaodian.doc(file, { pages:'1-3', onProgress(st), signal })
  //   st：{ state, done, total, eta, elapsed, log[] }；signal 取消 → 辨識套件做完這一頁就停，回傳做完的頁
  function api(path, opt) {
    return fetch(found.base + path, opt).then(r => {
      const ct = r.headers.get('Content-Type') || '';
      const body = ct.includes('json') ? r.json() : r.text();
      return body.then(b => { if (!r.ok) throw new Error((b && b.error) || ('HTTP ' + r.status)); return b; });
    });
  }
  async function doc(file, opt) {
    if (!found) throw new Error('沒有連上辨識套件');
    if (!found.doc) throw new Error('這個版本的辨識套件不能整份辨識，請更新到 0.3 以上');
    const o = opt || {};
    const u8 = new Uint8Array(await file.arrayBuffer());
    const { id } = await api('api/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, data: b64(u8), pages: o.pages || '' }) });
    if (/\.pdf$/i.test(file.name)) sent.add(await sha256(u8));   // 辨識套件已經記住這份 PDF
    let stopped = false;
    const stop = () => { if (!stopped) { stopped = true; api('api/doc/' + id + '/cancel', { method: 'POST' }).catch(() => {}); } };
    if (o.signal) { if (o.signal.aborted) stop(); else o.signal.addEventListener('abort', stop); }
    for (;;) {
      const st = await api('api/doc/' + id, { cache: 'no-store' });
      if (o.onProgress) o.onProgress(st);
      if (st.state === 'error') throw new Error((st.log || []).slice(-1)[0] || '辨識失敗');
      if (st.state === 'stopped' && !st.done) throw new Error('已停止，沒有做完的頁');
      if (st.state === 'done' || st.state === 'stopped') return api('api/doc/' + id + '/vtdoc', { cache: 'no-store' });
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  window.vitoolsHaodian = { detect, recognize, doc, get found() { return found; } };
})();
