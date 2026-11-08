/*
 * 珠算三頁（出題練習、各級撥珠教法、教學法筆記）共用的加減法撥珠方向。
 * 'high'＝從最高位開始（預設，跟唸數字的順序一樣）；'low'＝從個位開始（撥過的檔不會再動）。
 * 存在 localStorage，三頁一起跟著變；網址 ?dir=high 或 ?dir=low 可以指定，只影響這一頁、不改存的設定。
 * <html data-dir="..."> 讓 data-show="high"／data-show="low" 的內容只在對應方向顯示（藏起來的報讀軟體不會念）。
 * 要放在 <head>，頁面內容出來前就決定好方向。
 *
 * 加法進位的順序（使用者 2026-11-08）：'carry'＝先進位（預設：左邊一檔先加 1，再用大補數修正）；
 * 'comp'＝先扣補數（同傳統口訣「七去三進一」：這一檔先扣大補數，再到左邊一檔加 1）。
 * 只管加法（乘法加乘積也算）；減法借位、小補數不受影響。存 localStorage abacus-carry，網址 ?carry=carry|comp；
 * <html data-carry> 搭配 data-carry-show="carry|comp"；切換時發出 abacuscarrychange。
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
html[data-carry="carry"] [data-carry-show="comp"],html[data-carry="comp"] [data-carry-show="carry"]{display:none!important}
.dir-hint{display:block;font-size:.9em;opacity:.8}
html:not([data-dir="low"]) .dir-hint,html[data-carry="comp"] .dir-hint{display:none}
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

  // ---- 加法進位的順序 ----
  const CKEY = 'abacus-carry';
  const okC = v => v === 'carry' || v === 'comp';
  let carryUrl = null;
  try { const v = new URLSearchParams(location.search).get('carry'); if (okC(v)) carryUrl = v; } catch (e) { /* 沒有網址參數 */ }
  function storedC() { try { const v = localStorage.getItem(CKEY); return okC(v) ? v : null; } catch (e) { return null; } }
  let carry = carryUrl || storedC() || 'carry';
  root.dataset.carry = carry;
  const cradios = [];
  function syncC() { cradios.forEach(r => { r.checked = r.value === carry; }); }
  function applyC(v) {
    carry = v; root.dataset.carry = v; syncC();
    g.dispatchEvent(new CustomEvent('abacuscarrychange', { detail: v }));
  }
  function setCarry(v) {
    if (!okC(v) || v === carry) return;
    try { localStorage.setItem(CKEY, v); } catch (e) { /* 存不了就只改這一頁 */ }
    if (carryUrl) {
      carryUrl = null;
      try { const u = new URL(location.href); u.searchParams.delete('carry'); history.replaceState(null, '', u); } catch (e) { /* 不影響切換 */ }
    }
    applyC(v);
  }
  g.addEventListener('storage', e => { if (e.key === CKEY && okC(e.newValue) && !carryUrl && e.newValue !== carry) applyC(e.newValue); });

  let n = 0;
  // 在 el 裡放方向切換和加法進位的順序
  function mount(el) {
    const name = 'abacus-dir-' + (++n), cname = 'abacus-carry-' + n;
    el.innerHTML = `<span class="dir-sw" role="radiogroup" aria-label="加減法撥珠方向">加減法撥珠方向：
      <label><input type="radio" name="${name}" value="high"> 從最高位開始</label>
      <label><input type="radio" name="${name}" value="low"> 從個位開始</label></span>
      <span class="dir-sw" role="radiogroup" aria-label="加法進位的順序">加法進位的順序：
      <label><input type="radio" name="${cname}" value="carry"> 先進位</label>
      <label><input type="radio" name="${cname}" value="comp"> 先扣補數（同口訣）</label></span>
      <span class="dir-hint">從個位開始時，選「先扣補數」手指比較順：這一檔做完，左邊一檔就是下一個要撥的檔。</span>`;
    el.querySelectorAll(`input[name="${name}"]`).forEach(r => { radios.push(r); r.addEventListener('change', () => { if (r.checked) set(r.value); }); });
    el.querySelectorAll(`input[name="${cname}"]`).forEach(r => { cradios.push(r); r.addEventListener('change', () => { if (r.checked) setCarry(r.value); }); });
    sync(); syncC();
  }

  g.AbacusDir = { get: () => cur, set, mount, carry: () => carry, setCarry };
})(window);
