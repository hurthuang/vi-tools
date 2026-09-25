// 桌面版橋接：在每個頁面（含首頁分頁的 iframe）提供 window.vitoolsDesktop，語音合成與存檔交給 Windows 原生層。
// 介面都在網頁（desktop-audio.js、speech-block.js、pdf-to-accessible.html），說明見 README「給網頁用的介面」
(() => {
  // 旗標放在 document：iframe 由 about:blank 換成工具頁時會沿用同一個 window
  if (document.__vtdLoaded) return;
  document.__vtdLoaded = true;
  // 工具頁面放在首頁的 iframe 裡。iframe 自己的 chrome.webview 送不到原生層，
  // 所以一律經由最上層頁面（同源）的 chrome.webview 傳遞
  let host;
  try { host = window.top.chrome && window.top.chrome.webview; } catch {}
  if (!host) return;

  // 首頁：Alt+Shift+A 轉給目前顯示中的工具頁
  if (window.top === window) {
    document.addEventListener('keydown', e => {
      if (!(e.altKey && e.shiftKey && !e.ctrlKey && e.code === 'KeyA')) return;
      for (const f of document.querySelectorAll('iframe')) {
        try {
          if (f.offsetParent !== null && f.contentWindow.__vtdToggle) {
            e.preventDefault(); f.contentWindow.focus(); f.contentWindow.__vtdToggle(); return;
          }
        } catch {}
      }
    });
  }

  // Ctrl+Shift+O：線上網頁與內附離線版互換（原生層處理，停在同一頁）
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyO') { e.preventDefault(); host.postMessage({ type: 'toggleWebSource' }); }
  });

  // 各分頁共用最上層的 chrome.webview，用 fid 分辨回覆屬於哪一頁
  const fid = Math.random().toString(36).slice(2);
  const send = m => host.postMessage({ ...m, fid });

  // ── window.vitoolsDesktop：桌面版提供給網頁的功能。網頁偵測到它才顯示桌面專用介面（如匯出音檔）
  // apiVersion：有不相容的改變才加 1；新增功能不加，網頁用 `'功能名' in vitoolsDesktop` 判斷
  // appVersion：app 版本（原生層載入本檔時換掉佔位字串）
  // 就緒時對 window 發出 'vitoolsdesktop-ready' 事件（iframe 裡本檔在 DOMContentLoaded 才注入，網頁自己的程式可能先跑）
  const API_VERSION = 1;
  let reqSeq = 0;
  const waiting = new Map();   // reqId → { resolve, reject, onProgress }
  host.addEventListener('message', e => {
    const m = e.data;
    if (!m || m.fid !== fid || m.reqId == null || !waiting.has(m.reqId)) return;
    const w = waiting.get(m.reqId);
    switch (m.type) {
      case 'progress': if (w.onProgress) w.onProgress({ stage: 'synthesize', done: m.done, total: m.total }); return;
      case 'encoding': if (w.onProgress) w.onProgress({ stage: 'encode' }); return;
      case 'voices': w.resolve(m.voices); break;
      case 'previewAudio': w.resolve(m.data); break;
      case 'exportDone': w.resolve({ saved: true, path: m.path }); break;
      case 'exportCancelled': w.resolve({ saved: false }); break;
      case 'error': w.reject(new Error(m.message)); break;
      default: return;
    }
    waiting.delete(m.reqId);
  });
  function call(type, args, onProgress) {
    return new Promise((resolve, reject) => {
      const reqId = ++reqSeq;
      waiting.set(reqId, { resolve, reject, onProgress });
      send({ ...args, type, reqId });
    });
  }
  const api = Object.freeze({
    apiVersion: API_VERSION,
    appVersion: '__VITOOLS_APP_VERSION__',
    // Windows 語音清單：[{ id, name, lang, isDefault }]
    getVoices: () => call('getVoices', {}),
    // 試聽：合成前 300 字，回傳 WAV 的 base64
    previewAudio: ({ text, voiceId, rate = 1, volume = 1 }) => call('preview', { text, voiceId, rate, volume }),
    // 匯出：跳出存檔視窗（MP3／WAV），回傳 { saved: true, path } 或 { saved: false }（取消）
    // onProgress({ stage: 'synthesize', done, total }｜{ stage: 'encode' })
    exportAudio: ({ text, voiceId, rate = 1, volume = 1, fileName = '' }, onProgress) =>
      call('export', { text, voiceId, rate, volume, fileName }, onProgress),
  });
  window.vitoolsDesktop = api;
  window.dispatchEvent(new Event('vitoolsdesktop-ready'));
})();
