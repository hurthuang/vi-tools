// 「🔊 報讀」區塊：顯示要念的文字（可先轉換，例如算式轉 MathCAT 報讀文字），用瀏覽器內建語音朗讀、存成報讀檔（.txt）；
// 在桌面版（有 window.vitoolsDesktop）裡再多「匯出音檔」。
// 報讀文字一行一個項目：點一行（或方向鍵移到那行按 Enter／空白鍵）就從那行念到結尾，念到的行會反白；Esc 停止。
// 用法：createSpeechBlock(放在哪個元素後面, config)，config：
//   id           區塊 id（各元素 id 以它為開頭）
//   title        摘要列標題
//   getText()    取得原文
//   transform(text) 選用：轉換成要念的文字，回傳 { text, note }（note 顯示在狀態列）或字串
//   sources      選用：多個朗讀內容 [{ id, label, getText, transform }]，區塊會多一個「朗讀內容」選單（取代 getText/transform）
//   watch(update) 選用：原文改變時呼叫 update()（區塊展開時才會真的重新轉換）
//   fileName()   選用：存報讀檔與匯出音檔的預設檔名（不含副檔名）
// 頁面有載入 lang-segments.js 與 voice-settings.js 時，「語音設定」裡多中英分語音的選項，朗讀與匯出時英文段用英文語音
// 區塊元素（details）的 speechText 屬性是目前完整的報讀文字
(function () {
  'use strict';

  const PREF_KEY = 'vitools-speech-block';
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
  const savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(Object.assign(loadPrefs(), p))); } catch {} };

  const STYLE = `
    .speech-block { border: 1px solid var(--bd, #8888); border-radius: 7px; background: var(--surf, transparent); padding: 6px 10px; }
    .speech-block > summary { cursor: pointer; font-weight: 700; font-size: .85rem; padding: 2px 0; }
    .speech-block > summary:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 3px #ff9800); border-radius: 4px; }
    .speech-block .sb-body { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
    .speech-block .sb-label { font-size: .75rem; color: var(--dim, inherit); }
    .speech-block .sb-list { max-height: 14em; min-height: 3em; overflow-y: auto; resize: vertical;
      border: 1px solid var(--bd, #8888); border-radius: 7px; background: var(--surf2, transparent); padding: 6px; line-height: 1.6; }
    .speech-block .sb-line { display: block; width: 100%; text-align: left; font: inherit; color: inherit; background: none;
      border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer; white-space: pre-wrap; }
    .speech-block .sb-line:hover { background: rgba(74,144,217,.15); }
    .speech-block .sb-line:focus-visible { outline: 2px solid var(--blue, #1565c0); outline-offset: 1px; }
    .speech-block .sb-line.active { background: var(--blue, #1565c0); color: #fff; }
    .speech-block .sb-empty { color: var(--dim, inherit); font-size: .85rem; padding: 2px 6px; }
    .speech-block .sb-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: .8rem; }
    .speech-block .sb-row label { display: inline-flex; align-items: center; gap: 4px; }
    .speech-block select { max-width: 16em; font: inherit; }
    .speech-block .sb-warn { font-size: .78rem; color: var(--red, #c62828); }
    .speech-block .sb-settings > summary { cursor: pointer; font-size: .8rem; }
    .speech-block .sb-settings > .sb-row { margin-top: 6px; }
    .speech-block .vs-controls { display: contents; }
    .speech-block .vs-controls label[hidden] { display: none; }
  `;
  let styled = false;

  // 一行再依句末標點切成小段逐段念：一次交給 speechSynthesis 太長會被截斷
  function chunks(text) {
    const out = [];
    for (const s of text.split(/(?<=[。！？!?；;])/)) {
      let t = s.trim();
      while (t.length > 200) { out.push(t.slice(0, 200)); t = t.slice(200); }
      if (t) out.push(t);
    }
    return out;
  }

  const blocks = [];

  function createSpeechBlock(anchor, config) {
    if (!anchor) return null;
    if (!styled) {
      const st = document.createElement('style');
      st.textContent = STYLE;
      document.head.appendChild(st);
      styled = true;
    }
    const id = config.id;
    const el = document.createElement('details');
    el.className = 'speech-block';
    el.id = id;
    el.innerHTML = `
      <summary>🔊 ${config.title || '報讀'}</summary>
      <div class="sb-body">
        ${config.sources && config.sources.length > 1
          ? `<div class="sb-row"><label>朗讀內容 <select id="${id}-source"></select></label></div>` : ''}
        <div class="sb-row acts">
          <button type="button" class="btn pri" id="${id}-play">▶ 朗讀</button>
          <button type="button" class="btn" id="${id}-stop" disabled>⏹ 停止</button>
          <button type="button" class="btn" id="${id}-save">📄 存報讀檔</button>
          <button type="button" class="btn" id="${id}-export" hidden>💾 匯出音檔…</button>
        </div>
        <details class="sb-settings" id="${id}-settings">
          <summary>語音設定</summary>
          <div class="sb-row">
            <label>語音 <select id="${id}-voice"><option value="">（預設）</option></select></label>
            <label>速度 <input type="range" id="${id}-rate" min="0.5" max="3" step="0.1" value="1"> <span id="${id}-rate-val">1.0</span> 倍</label>
          </div>
          <div class="sb-row" id="${id}-bilingual"></div>
        </details>
        <p class="sb-warn" id="${id}-voice-warn" hidden></p>
        <div class="sb-label" id="${id}-label">報讀文字：點一行從那行朗讀（方向鍵移動，Enter 朗讀，Esc 停止）</div>
        <div class="sb-list" id="${id}-list" role="group" aria-labelledby="${id}-label"></div>
        <div class="st" id="${id}-st" role="status" aria-live="polite"></div>
      </div>`;
    anchor.after(el);

    const $ = s => document.getElementById(`${id}-${s}`);
    const list = $('list'), playBtn = $('play'), stopBtn = $('stop'), exportBtn = $('export'), saveBtn = $('save');
    const voiceSel = $('voice'), rate = $('rate'), rateVal = $('rate-val'), status = $('st');
    // 中英分語音設定（voice-settings.js，頁面有載入才有）
    const VS = window.vitoolsVoiceSettings || null;
    if (VS) VS.mount($('bilingual'), `${id}-vs`);
    const setStatus = (msg, cls) => { status.textContent = msg; status.className = 'st' + (cls ? ' ' + cls : ''); };
    const prefs = loadPrefs();

    rate.value = prefs.rate || 1;
    rateVal.textContent = Number(rate.value).toFixed(1);
    rate.addEventListener('input', () => { rateVal.textContent = Number(rate.value).toFixed(1); savePrefs({ rate: Number(rate.value) }); });
    voiceSel.addEventListener('change', () => savePrefs({ voice: voiceSel.value }));

    // 瀏覽器語音清單（臺灣中文排前面）
    function fillVoices() {
      if (!window.speechSynthesis) return;
      const voices = speechSynthesis.getVoices();
      if (!voices.length) return;
      const zh = voices.filter(v => /zh[-_]TW/i.test(v.lang)), others = voices.filter(v => !/zh[-_]TW/i.test(v.lang));
      voiceSel.innerHTML = '';
      for (const v of [...zh, ...others]) voiceSel.add(new Option(`${v.name}（${v.lang}）`, v.name));
      const want = prefs.voice && voices.some(v => v.name === prefs.voice) ? prefs.voice : (zh[0] || voices[0]).name;
      voiceSel.value = want;
    }
    if (window.speechSynthesis) { fillVoices(); speechSynthesis.addEventListener('voiceschanged', fillVoices); }
    else { playBtn.disabled = true; setStatus('這個瀏覽器不支援語音朗讀', 'err'); }

    // ── 報讀文字的逐行清單：只有目前那一行可 Tab 進入（方向鍵在行之間移動）
    let spokenText = '', lines = [], cur = 0;
    Object.defineProperty(el, 'speechText', { get: () => spokenText });
    const lineEls = () => list.querySelectorAll('.sb-line');
    function setCurrent(i, focus) {
      const els = lineEls();
      if (!els.length) return;
      cur = Math.max(0, Math.min(i, els.length - 1));
      els.forEach((b, j) => { b.tabIndex = j === cur ? 0 : -1; });
      if (focus) els[cur].focus();
    }
    function render(text) {
      spokenText = text;
      lines = text.split('\n').map(s => s.trim()).filter(Boolean);
      list.innerHTML = '';
      if (!lines.length) {
        list.innerHTML = '<div class="sb-empty">（沒有文字）</div>';
        return;
      }
      lines.forEach((t, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sb-line';
        b.dataset.idx = i;
        b.textContent = t;
        b.title = `第 ${i + 1} 行，點擊從此朗讀`;
        list.appendChild(b);
      });
      setCurrent(cur < lines.length ? cur : 0);
    }
    list.addEventListener('click', e => {
      const b = e.target.closest('.sb-line');
      if (b) { setCurrent(Number(b.dataset.idx)); play(cur); }
    });
    list.addEventListener('keydown', e => {
      const b = e.target.closest('.sb-line');
      if (!b) return;
      const i = Number(b.dataset.idx);
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); setCurrent(i + 1, true); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); setCurrent(i - 1, true); }
      else if (e.key === 'Home') { e.preventDefault(); setCurrent(0, true); }
      else if (e.key === 'End') { e.preventDefault(); setCurrent(lines.length - 1, true); }
      else if (e.key === 'Escape') { e.preventDefault(); stop(); setStatus('已停止'); }
      // Enter／空白鍵是按鈕本身的點擊，交給上面的 click
    });

    // ── 朗讀內容：有多個來源時用選單切換（記住上次選的）
    const sources = config.sources || [{ id: 'default', getText: config.getText, transform: config.transform }];
    const srcSel = $('source');
    if (srcSel) {
      for (const s of sources) srcSel.add(new Option(s.label, s.id));
      if (sources.some(s => s.id === prefs['src:' + id])) srcSel.value = prefs['src:' + id];
      srcSel.addEventListener('change', () => {
        savePrefs({ ['src:' + id]: srcSel.value });
        stop();
        cur = 0;
        doneSource = null;
        update().catch(() => {});
      });
    }
    const currentSource = () => (srcSel && sources.find(s => s.id === srcSel.value)) || sources[0];

    // ── 轉換：區塊展開時才做；原文與朗讀內容都沒變就沿用
    let doneSource = null, pending = null, timer = null;
    async function update() {
      const src = currentSource();
      const text = src.getText() || '';
      const source = src.id + '\u0000' + text;
      if (source === doneSource) return pending;
      doneSource = source;
      const job = (async () => {
        if (!text.trim()) { render(''); setStatus('沒有文字'); return; }
        if (!src.transform) { render(text); setStatus(''); return; }
        setStatus('轉換中…');
        try {
          const r = await src.transform(text);
          if (doneSource !== source) return;   // 轉換期間原文或朗讀內容又改了，交給下一次
          render(typeof r === 'string' ? r : r.text);
          setStatus(typeof r === 'string' ? '' : (r.note || ''));
        } catch (e) {
          doneSource = null;
          setStatus('轉換失敗：' + e.message, 'err');
          throw e;
        }
      })();
      pending = job.catch(() => {});
      return job;
    }
    const scheduleUpdate = () => {
      if (!el.open) { doneSource = null; return; }
      clearTimeout(timer);
      timer = setTimeout(() => update().catch(() => {}), 700);
    };
    el.addEventListener('toggle', () => { if (el.open) update().catch(() => {}); else stop(); });
    if (config.watch) config.watch(scheduleUpdate);

    // ── 朗讀（瀏覽器內建語音）：從第 from 行念到結尾，念到哪一行就反白
    let speaking = false;
    const clearActive = () => list.querySelectorAll('.sb-line.active').forEach(b => b.classList.remove('active'));
    function stop() {
      if (!speaking) return;
      speaking = false;
      speechSynthesis.cancel();
      clearActive();
      playBtn.disabled = false; stopBtn.disabled = true;
    }
    async function play(from) {
      clearTimeout(timer);
      try { await update(); } catch { return; }
      if (!lines.length) { setStatus('沒有可朗讀的文字', 'err'); return; }
      from = Math.max(0, Math.min(from || 0, lines.length - 1));
      speechSynthesis.cancel();
      speaking = true;
      playBtn.disabled = true; stopBtn.disabled = false;
      const voice = speechSynthesis.getVoices().find(v => v.name === voiceSel.value);
      const enVoice = VS ? VS.englishVoice() : null;
      const note = /^(朗讀|已停止|已存報讀檔|已儲存|已取消)/.test(status.textContent) ? '' : status.textContent;
      setStatus(from ? `從第 ${from + 1} 行開始朗讀…` : '朗讀中…');
      const els = lineEls();
      for (let i = from; i < lines.length; i++) {
        // 每行照標點切小塊，再切成中英段：英文段用英文語音（語音設定裡可關掉）
        const parts = [];
        for (const c of chunks(lines[i]))
          for (const s of (VS ? VS.segments(c) : [{ lang: 'zh', text: c }])) if (s.text.trim()) parts.push(s);
        parts.forEach((seg, k) => {
          const u = new SpeechSynthesisUtterance(seg.text);
          const v = seg.lang === 'en' && enVoice ? enVoice : voice;
          u.lang = v ? v.lang : 'zh-TW';
          if (v) u.voice = v;
          u.rate = Number(rate.value);
          if (k === 0) u.onstart = () => {
            if (!speaking) return;
            clearActive();
            els[i].classList.add('active');
            els[i].scrollIntoView({ block: 'nearest' });
            // 焦點已在清單裡時跟著移動，不搶走其他地方的焦點
            if (list.contains(document.activeElement)) setCurrent(i, true); else setCurrent(i);
          };
          if (i === lines.length - 1 && k === parts.length - 1)
            u.onend = () => { if (speaking) { stop(); setStatus('朗讀結束' + (note ? '；' + note : '')); } };
          u.onerror = e => { if (speaking && e.error !== 'interrupted' && e.error !== 'canceled') { stop(); setStatus('朗讀失敗：' + e.error, 'err'); } };
          speechSynthesis.speak(u);
        });
      }
    }
    playBtn.addEventListener('click', () => play(cur));
    stopBtn.addEventListener('click', () => { stop(); setStatus('已停止'); });

    // ── 存報讀檔：把完整報讀文字存成 .txt（瀏覽器下載，和頁面其他「存 ○○」按鈕一樣）
    const baseName = () => config.fileName ? config.fileName() : `${(document.title || '').replace(/\s*[-|].*$/, '')}_報讀`;
    saveBtn.addEventListener('click', async () => {
      clearTimeout(timer);
      try { await update(); } catch { return; }
      if (!spokenText.trim()) { setStatus('沒有可儲存的報讀文字', 'err'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([spokenText], { type: 'text/plain;charset=utf-8' }));
      a.download = baseName() + '.txt';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setStatus('已存報讀檔：' + a.download, 'ok');
    });

    // ── 桌面版：匯出音檔（完整報讀文字；網頁語音名稱對應到同名的 Windows 語音）
    const onDesktop = fn => {
      if (window.vitoolsDesktop) fn(window.vitoolsDesktop);
      else window.addEventListener('vitoolsdesktop-ready', () => fn(window.vitoolsDesktop), { once: true });
    };
    onDesktop(api => {
      exportBtn.hidden = false;
      // 匯出用 Windows 語音：缺臺灣中文語音時提示安裝（提示文字來自 desktop-audio.js，頁面有載入才會顯示）
      const shared = window.vitoolsDesktopAudio;
      if (shared) api.getVoices().then(voices => {
        const warn = shared.voiceWarning(voices);
        $('voice-warn').textContent = warn;
        $('voice-warn').hidden = !warn;
      }).catch(() => {});
      exportBtn.addEventListener('click', async () => {
        exportBtn.disabled = true;
        try {
          await update();
          if (!spokenText.trim()) throw new Error('沒有可匯出的文字');
          const natives = await api.getVoices();
          const web = voiceSel.value;
          const hit = natives.find(v => web === v.name || web.startsWith(v.name + ' '))
            || natives.find(v => /^zh-TW/i.test(v.lang)) || natives[0];
          // 中英分語音：英文段用對應的 Windows 英文語音（語音設定裡的英文語音與停頓）
          const bi = VS ? VS.exportArgs(spokenText, hit && hit.id, natives, api) : {};
          const note = [status.textContent, bi.note].filter(Boolean).join('；');
          setStatus('請選擇存檔位置…');
          const r = await api.exportAudio({ text: spokenText, voiceId: hit && hit.id, rate: Number(rate.value), fileName: baseName(),
            segments: bi.segments, pause: bi.pause },
            p => setStatus(p.stage === 'encode' ? '轉成 MP3 中…' : `合成中… ${p.done} / ${p.total} 段`));
          setStatus(r.saved ? '已儲存：' + r.path + (note ? '；' + note : '') : '已取消', r.saved ? 'ok' : '');
        } catch (e) { setStatus('錯誤：' + e.message, 'err'); }
        exportBtn.disabled = false;
      });
    });

    const block = { el, update, open() { el.open = true; playBtn.focus(); } };
    blocks.push(block);
    return block;
  }

  // Alt+Shift+A：展開目前看得到的報讀區塊並移到「朗讀」按鈕（桌面版首頁也會轉給這個函式）
  function focusVisibleBlock() {
    const b = blocks.find(x => x.el.offsetParent !== null);
    if (b) b.open();
    return !!b;
  }
  document.addEventListener('keydown', e => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && e.code === 'KeyA' && blocks.length && focusVisibleBlock()) e.preventDefault();
  });
  window.__vtdToggle = window.__vtdToggle || focusVisibleBlock;

  window.createSpeechBlock = createSpeechBlock;
})();
