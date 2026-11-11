// 本機 vi-tools 辨識套件的「辨識一塊」（辨識套件 app/exam/region.py、server.py 的 /api/ocr）。
// 偵測到才有功能：辨識套件沒開（或沒裝）時 detect() 回 null，頁面就不顯示辨識的按鈕。
// 桌面版 0.5.0 起，辨識套件放在 ViTools 資料夾裡會自動找到，第一次辨識時在背景啟動（detect／ensure，見下面）。
//   const hd = await vitoolsHaodian.detect()        （打開頁面時用 detect({ auto: true })，見下面）→ { base:'http://127.0.0.1:18760/', version } 或 null
//   await vitoolsHaodian.recognize(src, box, { type, mode })
//     src：vtdoc-view 的 regionSource(p, box)；box：[x0,y0,x1,y1]（頁面比例）
//     type：q 題目、opt 選項、其他照文字；mode：auto（文字＋算式）／math（整塊一個算式）
//     → { lines:[…] }（算式寫成 \( \)）或 { tex, score }
//   await vitoolsHaodian.omr(dataURL)（found.omr，辨識套件 0.4.2 起、完整版才有）
//     → { results:[{ engine:'homr'|'audiveris', musicxml | error, sec }], spacing, scale, sec }
//   vitoolsHaodian.omrSummary(musicxml) → 「1 個聲部、8 小節、17 個音；沒認出調號；4/8 拍」（給使用者挑結果）
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
      .then(j => j && j.ocr ? { base, version: j.version, modes: j.ocr, doc: !!j.doc, word: !!j.word, music: j.music !== false, omr: !!j.omr } : null)
      .catch(() => null);
  }

  // 20 個連接埠一起試，第一個回應的就是。
  // 打開頁面時自動找用 detect({ auto: true })：這台瀏覽器連上過辨識套件才真的去找。
  //   沒裝的人不要每次都連本機（Chrome 會問要不要允許存取區域網路，主控台也一堆連不上的錯誤）；
  //   第一次請使用者按「找本機辨識套件」（detect()），找到就記住（localStorage）
  const SEEN = 'vitools-recognizer-seen';
  function seen() { try { return !!localStorage.getItem(SEEN); } catch (e) { return false; } }

  // 桌面版 0.5.0 起（features 有 'recognizer'）：辨識套件放在 ViTools 資料夾裡就找得到，用到才在背景啟動。
  //   這時 found 先是 { lazy: true, base: '' … }（頁面照「有辨識套件」顯示），第一次辨識時 ensure() 請桌面版啟動
  //   iframe 裡的 vitoolsDesktop 在 DOMContentLoaded 才注入，在 WebView2 裡最多等它 1 秒
  function desktop() {
    const ok = d => d && Array.isArray(d.features) && d.features.includes('recognizer') && d.recognizer ? d : null;
    if (window.vitoolsDesktop) return Promise.resolve(ok(window.vitoolsDesktop));
    let inApp = false;
    try { inApp = !!(window.top.chrome && window.top.chrome.webview); } catch (e) { /* */ }
    if (!inApp) return Promise.resolve(null);
    return new Promise(res => {
      const t = setTimeout(() => res(ok(window.vitoolsDesktop)), 1000);
      window.addEventListener('vitoolsdesktop-ready', () => { clearTimeout(t); res(ok(window.vitoolsDesktop)); }, { once: true });
    });
  }
  const pingAll = () => Promise.all(PORTS.map(ping)).then(rs => rs.find(Boolean) || null);

  async function detect(opt) {
    const d = await desktop();
    // 桌面版：連本機不會跳區域網路的詢問，一律找；沒在跑但資料夾裡有，就先當成有（用到再開）
    if (!d && opt && opt.auto && !seen()) return (found = null);
    found = await pingAll();
    if (found) { try { localStorage.setItem(SEEN, '1'); } catch (e) { /* 存不了就每次按 */ } return found; }
    if (d) {
      const st = await d.recognizer.status().catch(() => null);
      // 還沒啟動，不知道是不是完整版：樂譜先當成有，辨識時辨識套件會回「試卷版沒有樂譜辨識」
      if (st && st.found) found = { lazy: true, base: '', version: st.version, modes: ['auto', 'math', 'text'], doc: true, desktop: true, path: st.path, omr: true };
    }
    return found;
  }
  // 桌面版：辨識套件放在別的地方時讓使用者選資料夾（不是桌面版或取消 → null）
  async function pick() {
    const d = await desktop();
    if (!d) return null;
    const st = await d.recognizer.pick();
    return st && st.found ? detect() : null;
  }
  // 要真的呼叫辨識套件前：桌面版背景啟動（最多等 60 秒）；onStatus(文字) 顯示進度
  let starting = null;
  function ensure(onStatus) {
    if (!found) return Promise.reject(new Error('沒有連上辨識套件'));
    if (!found.lazy) return Promise.resolve(found);
    if (!starting) {
      if (onStatus) onStatus('啟動辨識套件…（大約 5～10 秒）');
      starting = desktop().then(d => {
        if (!d) throw new Error('沒有連上辨識套件');
        return d.recognizer.start();
      }).then(() => pingAll()).then(f => {
        if (!f) throw new Error('辨識套件啟動了，但連不上');
        found = f;
        return f;
      }).finally(() => { starting = null; });
    }
    return starting;
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

  async function post(body) {
    await ensure();
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
  async function api(path, opt) {
    await ensure();
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

  // Word 檔 → 用這台電腦的 Word 另存 PDF（和 .docx），給版面整理當原卷（辨識套件 0.4.1 起，found.word）
  //   await vitoolsHaodian.word(file) → { pdf: File, docx: File }
  async function word(file) {
    if (!found) throw new Error('沒有連上辨識套件');
    const u8 = new Uint8Array(await file.arrayBuffer());
    const r = await api('api/word', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data: b64(u8) }) });
    const bin = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const base = file.name.replace(/\.docx?$/i, '');
    return { pdf: new File([bin(r.pdf)], base + '.pdf', { type: 'application/pdf' }), docx: new File([bin(r.docx)], base + '.docx') };
  }

  // 一塊譜例的圖 → 兩個引擎的 MusicXML（辨識套件 0.4.2 起的 /api/omr；試卷版回 409）
  async function omr(image) {
    if (!found) throw new Error('沒有連上辨識套件');
    if (!found.omr) throw new Error('這個辨識套件不能辨識樂譜（要 0.4.2 以上的完整版）');
    return api('api/omr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
  }

  const ENGINE = { homr: 'homr', audiveris: 'Audiveris' };
  function omrSummary(xml) {
    try {
      const d = new DOMParser().parseFromString(xml, 'application/xml');
      const parts = d.querySelectorAll('part');
      if (!parts.length) return '沒有內容';
      const ms = parts[0].querySelectorAll('measure').length;
      const notes = d.querySelectorAll('note pitch').length;
      const f = d.querySelector('key fifths'), beats = d.querySelector('time beats'), bt = d.querySelector('time beat-type');
      const key = f ? (+f.textContent === 0 ? '無升降記號' : Math.abs(+f.textContent) + ' 個' + (+f.textContent > 0 ? '升記號' : '降記號')) : '沒認出調號';
      return parts.length + ' 個聲部、' + ms + ' 小節、' + notes + ' 個音；' + key + '；' + (beats && bt ? beats.textContent + '/' + bt.textContent + ' 拍' : '沒認出拍號');
    } catch (e) { return '讀不出內容'; }
  }

  window.vitoolsHaodian = { detect, recognize, doc, ensure, pick, word, omr, omrSummary, ENGINE, get found() { return found; } };
})();
