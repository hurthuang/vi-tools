// 桌面版（desktop/，ViTools）共用小工具，給各頁的「🔊 報讀」區塊與文件整理的匯出音檔用。
// 在一般瀏覽器裡這個檔案什麼都不做。桌面版提供的功能（語音清單、試聽、匯出 MP3/WAV）見 desktop/README.md「給網頁用的介面」。
// 對外：window.vitoolsDesktopAudio = {
//   onDesktop(fn)        在桌面版裡呼叫 fn(window.vitoolsDesktop)（iframe 裡要等 vitoolsdesktop-ready 事件）
//   voiceWarning(voices) 缺臺灣中文語音時的提示文字（沒問題回傳空字串）
//   progressText(p)      匯出進度文字 }
// （原本右下角的「匯出音檔」浮動面板已由各頁的報讀區塊取代，2026-09-25 移除）
(function () {
  'use strict';

  // 桌面版在 iframe 裡是 DOMContentLoaded 才注入 vitoolsDesktop，頁面程式可能先跑，所以要等 ready 事件
  function onDesktop(fn) {
    if (window.vitoolsDesktop) fn(window.vitoolsDesktop);
    else window.addEventListener('vitoolsdesktop-ready', () => fn(window.vitoolsDesktop), { once: true });
  }

  // 語音都是 Windows 內建的，別台電腦可能沒裝臺灣中文語音
  function voiceWarning(voices) {
    if (!voices.length) return '這台電腦沒有可用的 Windows 語音，無法試聽或匯出。請到 Windows「設定 → 時間與語言 → 語音 → 新增語音」安裝「中文(台灣)」。';
    if (!voices.some(v => /^zh-TW/i.test(v.lang)))
      return '找不到臺灣中文語音，中文可能念不出來。請到 Windows「設定 → 時間與語言 → 語音 → 新增語音」安裝「中文(台灣)」，再重新開啟本程式。';
    return '';
  }

  const progressText = p => p.stage === 'encode' ? '轉成 MP3 中…' : `合成中… ${p.done} / ${p.total} 段`;

  window.vitoolsDesktopAudio = { onDesktop, voiceWarning, progressText };
})();
