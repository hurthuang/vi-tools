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
//   vitoolsHaodian.updateNotice(el, onStatus)：GitHub 上有新版就在 el 裡放提示（0.4.3 起的辨識套件有「更新」按鈕，
//     只換 app\ 約 1 MB、自己重新啟動；比較舊的給下載連結，要換整個資料夾）；沒有新版、查不到 → el 清空
//   桌面版 0.5.1 起：canInstall()、install()、installPanel(el, onStatus, onDone)：在 app 裡下載安裝、整包更新辨識套件（見下面）
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
      .then(j => j && j.ocr ? { base, version: j.version, modes: j.ocr, doc: !!j.doc, word: !!j.word, music: j.music !== false, omr: !!j.omr, update: !!j.update } : null)
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
      if (st && st.found) found = { lazy: true, base: '', version: st.version, modes: ['auto', 'math', 'text'], doc: true, desktop: true, path: st.path, omr: st.edition !== 'exam', edition: st.edition || '' };
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
      if (onStatus) onStatus('啟動辨識套件…（大約 5～30 秒，舊電腦比較久）');
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
  //   await vitoolsHaodian.word(file, onStatus?) → { pdf: File, docx: File }；onStatus：要先啟動辨識套件時說一聲
  async function word(file, onStatus) {
    if (!found) throw new Error('沒有連上辨識套件');
    await ensure(onStatus);
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

  // ---------- 新版提示、自己更新（辨識套件 0.4.3 起的 /api/update） ----------
  const REL_API = 'https://api.github.com/repos/hurthuang/vi-tools-recognizer/releases/latest';
  const REL_PAGE = 'https://github.com/hurthuang/vi-tools-recognizer/releases/latest';
  const LATEST = 'vitools-recognizer-latest';
  const vnum = v => String(v || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  function newer(a, b) {   // a 比 b 新
    const x = vnum(a), y = vnum(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  }
  // GitHub 上最新的版本；6 小時查一次（GitHub API 沒登入一小時只能查 60 次）；fresh：不用記住的（剛裝好時）
  async function latest(fresh) {
    try {
      const c = JSON.parse(localStorage.getItem(LATEST) || 'null');
      if (!fresh && c && Date.now() - c.t < 6 * 3600e3) return c.v;
    } catch (e) { /* */ }
    const r = await Promise.race([fetch(REL_API, { headers: { Accept: 'application/vnd.github+json' } }), timeout(8000)]);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = String((await r.json()).tag_name || '').replace(/^v/, '');
    try { localStorage.setItem(LATEST, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* */ }
    return v;
  }
  // 會自己更新的辨識套件：連上的看 /api/ocr 的 update；桌面版還沒啟動的只知道版本（0.4.3 起才有）
  const canSelf = f => !!(f && (f.update || (f.lazy && !newer('0.4.3', f.version))));
  async function checkUpdate() {
    if (!found || !found.version) return null;
    const v = await latest();
    return v && newer(v, found.version) ? { current: found.version, latest: v, self: canSelf(found), url: REL_PAGE } : null;
  }
  // 請辨識套件下載新版的 app\ 換上、重新啟動，等它用新版本回應（最多 60 秒）
  async function selfUpdate(onStatus) {
    await ensure(onStatus);
    if (onStatus) onStatus('下載新版的辨識套件程式（約 1 MB）…');
    const r = await fetch(found.base + 'api/update', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    if (onStatus) onStatus('已換上 ' + j.version + '，辨識套件重新啟動中…');
    const base = found.base;
    for (let i = 0; i < 120; i++) {
      await new Promise(res => setTimeout(res, 500));
      const f = await ping(+base.match(/:(\d+)\//)[1]);
      if (f && f.version === j.version) { found = f; return f; }
    }
    found = await pingAll();
    if (found && found.version === j.version) return found;
    throw new Error('更新好了，但辨識套件沒有重新啟動；請關掉再打開辨識套件');
  }
  function updateNotice(el, onStatus) {
    if (!el) return Promise.resolve(null);
    return checkUpdate().catch(() => null).then(u => {
      el.textContent = '';
      delete el.dataset.whole;
      el.hidden = !u;
      if (!u) return null;
      const t = document.createElement('span');
      t.textContent = '辨識套件有新版 ' + u.latest + '（現在是 ' + u.current + '）';
      el.appendChild(t);
      const link = () => {
        const a = document.createElement('a');
        a.href = u.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = '下載新版（解壓縮後換掉整個「vi-tools辨識套件」資料夾，輸出資料夾記得搬過去）';
        return a;
      };
      el.appendChild(document.createTextNode(' '));
      // 要換整包（0.4.3 以前的版本，或執行環境也換了）：桌面版 0.5.1 起可以直接下載換上，其他給下載連結
      const whole = () => installer().then(d => {
        if (!d) { el.appendChild(link()); return; }
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn';
        b.textContent = '下載整包更新（' + sizeOf(found && found.edition) + '）';
        b.title = '下載新版整個辨識套件、換掉舊的；「輸出」資料夾（辨識結果）會搬過去';
        b.addEventListener('click', () => installRun(b, el, { edition: '' }, onStatus, f => {
          el.textContent = '辨識套件已更新到 ' + (f && f.version || '');
          if (el.onupdated) el.onupdated(f);
        }));
        el.appendChild(b);
      });
      if (!u.self) { whole(); return u; }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn';
      b.textContent = '更新辨識套件';
      b.title = '只下載換掉程式的部分（約 1 MB），辨識套件會自己重新啟動；辨識結果不會動到';
      b.addEventListener('click', () => {
        b.disabled = true;
        selfUpdate(onStatus).then(f => {
          el.textContent = '辨識套件已更新到 ' + f.version;
          if (onStatus) onStatus('辨識套件已更新到 ' + f.version);
          if (el.onupdated) el.onupdated(f);
        }).catch(e => {
          b.disabled = false;
          if (onStatus) onStatus('更新失敗：' + e.message);
          if (/整包/.test(e.message) && !el.querySelector('a') && !el.dataset.whole) { el.dataset.whole = '1'; b.remove(); whole(); }
        });
      });
      el.appendChild(b);
      return u;
    });
  }

  // ── 桌面版 0.5.1 起：在 app 裡安裝、整包更新辨識套件（desktop/RecognizerInstall.cs）
  //   canInstall() → Promise<bool>
  //   install({ edition: 'exam'|'full'|'', file }, onStatus) → 裝好後的 detect() 結果；選 zip 時取消 → null；失敗 → reject
  //   installPanel(el, onStatus, onDone(found))：在 el 放「安裝試卷版／完整版／選已下載的 zip」按鈕（沒裝辨識套件時用）
  function installer() {
    return desktop().then(d => d && d.features.includes('recognizerInstall') ? d : null);
  }
  const canInstall = () => installer().then(Boolean);
  const sizeOf = ed => ed === 'full' ? '約 560 MB' : ed === 'exam' ? '約 330 MB' : '330～560 MB';
  const MB = b => Math.round(b / 1e6) + ' MB';
  async function install(opt, onStatus) {
    const d = await installer();
    if (!d) throw new Error('這個版本的桌面版不能安裝辨識套件，請先更新桌面版');
    let lastStep = -1, lastStage = '';
    const st = await d.recognizer.install(opt || {}, p => {
      if (!onStatus) return;
      const pct = p.total ? Math.floor(p.done * 100 / p.total) : 0;
      // 狀態列是 aria-live：每 10% 才更新一次，報讀軟體不會一直念（視窗標題有每 1% 的進度）
      const step = Math.floor(pct / 10);
      if (p.stage === lastStage && step === lastStep) return;
      lastStep = step; lastStage = p.stage;
      onStatus(p.stage === 'download' ? '下載辨識套件… ' + pct + '%（' + MB(p.done) + '／' + MB(p.total) + '）'
        : p.stage === 'extract' ? '解壓縮辨識套件… ' + pct + '%' : '換上辨識套件…');
    });
    if (st && st.cancelled) return null;
    found = null; starting = null;
    return catchUp(await detect(), onStatus);
  }
  // 裝好的 zip 不一定是最新版：只改程式的小版本，Release 只附 app zip（約 1 MB），大 zip 留在前一個完整版
  //   （桌面版 0.5.2 起會往舊的 Release 找大 zip）→ 裝好後接著「更新辨識套件」，補到最新的程式
  async function catchUp(f, onStatus) {
    if (!f || !canSelf(f)) return f;
    try {
      const v = await latest(true);
      if (!v || !newer(v, f.version)) return f;
      if (onStatus) onStatus('辨識套件 ' + f.version + ' 裝好了，接著更新到 ' + v + '（約 1 MB）…');
      return await selfUpdate(onStatus);
    } catch (e) {
      return Object.assign({}, found || f, { catchUpError: e.message });
    }
  }
  // 按鈕按下去：其他按鈕停用、多一個「停止」；做完呼叫 done(found)
  function installRun(btn, box, opt, onStatus, done) {
    const btns = [...box.querySelectorAll('button')];
    btns.forEach(x => { x.disabled = true; });
    const stop = document.createElement('button');
    stop.type = 'button'; stop.className = 'btn';
    stop.textContent = '停止下載';
    stop.addEventListener('click', () => { stop.disabled = true; installer().then(d => d && d.recognizer.cancel()); });
    if (!opt.file) btn.after(stop);
    if (onStatus) onStatus(opt.file ? '選擇下載好的 zip…' : '查詢最新版的辨識套件…');
    return install(opt, onStatus).then(f => {
      if (f === null && opt.file) { if (onStatus) onStatus('沒有選 zip'); return; }
      if (onStatus) onStatus(!f ? '裝好了，但找不到辨識套件'
        : f.catchUpError ? '辨識套件 ' + (f.version || '') + ' 裝好了，但沒有更新到最新版：' + f.catchUpError + '（之後可以按「更新辨識套件」）'
        : '辨識套件 ' + (f.version || '') + ' 裝好了' + (f.lazy ? '，第一次辨識時會在背景開啟' : ''));
      if (done) done(f);
    }).catch(e => {
      if (onStatus) onStatus((opt.edition === '' ? '更新' : '安裝') + '辨識套件失敗：' + e.message);
    }).finally(() => {
      stop.remove();
      btns.forEach(x => { x.disabled = false; });
    });
  }
  function installPanel(el, onStatus, onDone) {
    if (!el) return Promise.resolve(false);
    return installer().then(d => {
      el.textContent = '';
      el.hidden = !d;
      if (!d) return false;
      const add = (text, title, opt) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn';
        b.textContent = text; b.title = title;
        b.addEventListener('click', () => installRun(b, el, opt, onStatus, onDone));
        el.appendChild(b);
        el.appendChild(document.createTextNode(' '));
      };
      add('安裝辨識套件（試卷版，約 330 MB）', '從 GitHub 下載 vi-tools 辨識套件試卷版：文字、算式、版面，放進 ViTools 資料夾', { edition: 'exam' });
      add('安裝完整版（約 560 MB，多樂譜辨識）', '試卷版再加上樂譜辨識（Audiveris、homr）', { edition: 'full' });
      add('用已下載的 zip 安裝', '學校網路下載太慢時：在別的地方下載好 vi-tools-recognizer-…-portable.zip，選這個檔安裝', { edition: '', file: true });
      // 2026-11-13 使用者在 i5-5200U（2015 年筆電）上跑很久：先說清楚，免得以為當機
      const note = document.createElement('span');
      note.className = 'dim';
      note.style.fontSize = '.85rem';
      note.textContent = '辨識很吃電腦效能：舊筆電辨識有算式的試卷，一頁可能要 10～60 秒；筆電請插上電源。';
      el.appendChild(note);
      return true;
    });
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

  window.vitoolsHaodian = { detect, recognize, doc, ensure, pick, word, omr, omrSummary, ENGINE, checkUpdate, selfUpdate, updateNotice, newer,
    canInstall, install, installPanel,
    get found() { return found; } };
})();
