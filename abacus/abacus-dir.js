/*
 * 珠算三頁（出題練習、補數說明、教學筆記）共用的加減法撥珠方向。
 * 'high'＝從最高位開始（預設，跟唸數字的順序一樣）；'low'＝從個位開始（撥過的檔不會再動）。
 * 存在 localStorage，三頁一起跟著變；網址 ?dir=high 或 ?dir=low 可以指定，只影響這一頁、不改存的設定。
 * <html data-dir="..."> 讓 data-show="high"／data-show="low" 的內容只在對應方向顯示（藏起來的報讀軟體不會念）。
 * 要放在 <head>，頁面內容出來前就決定好方向。
 */
(function (g) {
  'use strict';
  const KEY = 'abacus-dir';
  const ok = v => v === 'high' || v === 'low';
  let fromUrl = null;
  try { const v = new URLSearchParams(location.search).get('dir'); if (ok(v)) fromUrl = v; } catch (e) { /* 沒有網址參數 */ }
  function stored() { try { const v = localStorage.getItem(KEY); return ok(v) ? v : null; } catch (e) { return null; } }
  let cur = fromUrl || stored() || 'high';
  const root = document.documentElement;
  root.dataset.dir = cur;

  const st = document.createElement('style');
  st.textContent = `
html[data-dir="high"] [data-show="low"],html[data-dir="low"] [data-show="high"]{display:none!important}
.dir-sw{display:inline-flex;flex-wrap:wrap;gap:2px 12px;align-items:center}
.dir-sw label{display:inline-flex;gap:4px;align-items:center;cursor:pointer;margin:0}
.abacus-top{display:flex;flex-wrap:wrap;gap:6px 20px;align-items:center;margin:0 0 12px}`;
  document.head.appendChild(st);

  const radios = [];
  function sync() { radios.forEach(r => { r.checked = r.value === cur; }); }
  function apply(v) {
    cur = v; root.dataset.dir = v; sync();
    g.dispatchEvent(new CustomEvent('abacusdirchange', { detail: v }));
  }
  function set(v) {
    if (!ok(v) || v === cur) return;
    try { localStorage.setItem(KEY, v); } catch (e) { /* 存不了就只改這一頁 */ }
    if (fromUrl) {   // 自己切換了，網址上的 ?dir 就拿掉，免得重新整理又變回去
      fromUrl = null;
      try { const u = new URL(location.href); u.searchParams.delete('dir'); history.replaceState(null, '', u); } catch (e) { /* 不影響切換 */ }
    }
    apply(v);
  }
  // 另一個分頁改了方向，這一頁也跟著改（網址指定的除外）
  g.addEventListener('storage', e => { if (e.key === KEY && ok(e.newValue) && !fromUrl && e.newValue !== cur) apply(e.newValue); });

  let n = 0;
  // 在 el 裡放方向切換
  function mount(el) {
    const name = 'abacus-dir-' + (++n);
    el.innerHTML = `<span class="dir-sw" role="radiogroup" aria-label="加減法撥珠方向">加減法撥珠方向：
      <label><input type="radio" name="${name}" value="high"> 從最高位開始</label>
      <label><input type="radio" name="${name}" value="low"> 從個位開始</label></span>`;
    el.querySelectorAll('input').forEach(r => { radios.push(r); r.addEventListener('change', () => { if (r.checked) set(r.value); }); });
    sync();
  }

  g.AbacusDir = { get: () => cur, set, mount };
})(window);
