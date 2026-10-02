// 沿用視障輔助工具集的主題設定（site-theme）；沒有設定時跟隨系統。放在 <head> 裡同步載入，避免先閃一下另一種配色
(function () {
  try {
    var t = localStorage.getItem('site-theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
  // 工具集首頁切換主題時會用 postMessage 通知各分頁
  window.addEventListener('message', function (e) {
    if (e.source === window.parent && e.data && e.data.type === 'setTheme' && (e.data.theme === 'dark' || e.data.theme === 'light'))
      document.documentElement.setAttribute('data-theme', e.data.theme);
  });
})();
