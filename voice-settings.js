// 中英分語音設定（各頁共用，存在瀏覽器本機）：朗讀時英文段改用英文語音
// 需要 lang-segments.js（切段規則）。對外：window.vitoolsVoiceSettings = {
//   get()                      → { enVoice: 'auto'|'off'|語音名稱, minWords: 2|1, pause: 'natural'|'original'|'min' }
//   set(patch)                 更新設定（同頁與其他分頁的設定介面會跟著更新）
//   englishVoice()             → 目前要用的英文 SpeechSynthesisVoice，或 null（不切換、或這台電腦沒有英文語音）
//   segments(text)             → [{ lang: 'zh'|'en', text }]；不切換時整段是 zh
//   mount(container, idPrefix) 在 container 裡放設定介面（英文語音、切換條件；桌面版多「匯出時換語音的停頓」）
//   exportArgs(text, zhNativeId, nativeVoices, api) → { segments, pause, note }：給 vitoolsDesktop.exportAudio 用；
//                              app 不支援分段（舊版）或不切換時 segments 為 undefined，照原本整段單一語音匯出 }
(function () {
  'use strict';

  const KEY = 'vitools-voice-settings';
  const DEFAULTS = { enVoice: 'auto', minWords: 2, pause: 'natural' };
  const listeners = new Set();

  function get() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
    return Object.assign({}, DEFAULTS, s);
  }
  function set(patch) {
    const s = Object.assign(get(), patch);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    listeners.forEach(fn => fn(s));
  }
  // 其他分頁（同網站的 iframe）改了設定時也跟著更新
  window.addEventListener('storage', e => { if (e.key === KEY) listeners.forEach(fn => fn(get())); });

  const webVoices = () => (window.speechSynthesis ? speechSynthesis.getVoices() : []);
  const isEnglish = v => /^en([-_]|$)/i.test(v.lang);
  function englishVoices() {
    // 美式英文排前面
    return webVoices().filter(isEnglish).sort((a, b) => (/US/i.test(b.lang) ? 1 : 0) - (/US/i.test(a.lang) ? 1 : 0));
  }
  function englishVoice() {
    const s = get();
    if (s.enVoice === 'off') return null;
    const list = englishVoices();
    return (s.enVoice !== 'auto' && list.find(v => v.name === s.enVoice)) || list[0] || null;
  }

  function segments(text) {
    if (!englishVoice() || !window.vitoolsLangSegments) return [{ lang: 'zh', text }];
    return window.vitoolsLangSegments.split(text, { minWords: get().minWords });
  }

  // 匯出：英文段的網頁語音對應到同名的 Windows 語音（沒有就用第一個英文 Windows 語音）
  function exportArgs(text, zhNativeId, nativeVoices, api) {
    const web = englishVoice();
    if (!web) return { note: '' };
    if (!api || !api.features || !api.features.includes('segments'))
      return { note: '這個版本的桌面版不支援中英分語音，匯出時整段用同一個語音' };
    const natives = nativeVoices.filter(v => /^en/i.test(v.lang));
    const hit = natives.find(v => web.name === v.name || web.name.startsWith(v.name + ' ')) || natives[0];
    if (!hit) return { note: '這台電腦沒有英文的 Windows 語音，匯出時英文也用中文語音' };
    const segs = segments(text).map(s => ({ text: s.text, voiceId: s.lang === 'en' ? hit.id : zhNativeId }));
    const note = web.name === hit.name || web.name.startsWith(hit.name + ' ') ? '' : `英文語音「${web.name}」無法匯出，改用 ${hit.name}`;
    return { segments: segs.length > 1 ? segs : undefined, pause: get().pause, note };
  }

  // 設定介面：英文語音（自動／不切換／各英文語音）、切換條件；桌面版多停頓選項
  function mount(container, prefix) {
    const wrap = document.createElement('div');
    wrap.className = 'vs-controls';
    wrap.innerHTML = `
      <label>英文語音 <select id="${prefix}-en"></select></label>
      <label class="vs-rule">切換條件 <select id="${prefix}-rule">
        <option value="2">兩個以上英文單字</option><option value="1">每個英文字</option></select></label>
      <label class="vs-pause" hidden>匯出時換語音的停頓 <select id="${prefix}-pause">
        <option value="natural">縮短（建議）</option><option value="original">保留原本</option><option value="min">最短</option></select></label>`;
    container.appendChild(wrap);
    const en = wrap.querySelector(`#${prefix}-en`), rule = wrap.querySelector(`#${prefix}-rule`), pause = wrap.querySelector(`#${prefix}-pause`);

    function refresh() {
      const s = get(), list = englishVoices();
      const auto = list[0];
      en.innerHTML = '';
      en.add(new Option(auto ? `自動（${auto.name}）` : '自動（這台電腦沒有英文語音）', 'auto'));
      en.add(new Option('不切換（英文也用中文語音）', 'off'));
      for (const v of list) en.add(new Option(`${v.name}（${v.lang}）`, v.name));
      en.value = [...en.options].some(o => o.value === s.enVoice) ? s.enVoice : 'auto';
      rule.value = String(s.minWords);
      pause.value = s.pause;
      const active = !!englishVoice();
      wrap.querySelector('.vs-rule').hidden = !active;
      wrap.querySelector('.vs-pause').hidden = !active || !window.vitoolsDesktop;
    }
    en.addEventListener('change', () => set({ enVoice: en.value }));
    rule.addEventListener('change', () => set({ minWords: Number(rule.value) }));
    pause.addEventListener('change', () => set({ pause: pause.value }));
    listeners.add(refresh);
    if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', refresh);
    window.addEventListener('vitoolsdesktop-ready', refresh);
    refresh();
    return wrap;
  }

  window.vitoolsVoiceSettings = { get, set, englishVoice, segments, exportArgs, mount };
})();
