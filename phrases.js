// 常用詞句（版面整理）：插在題目裡的固定說法，點字卷和音檔可以用不同的字
//   一句 = { pb: 點字卷的字, pa: 音檔念的字 }，空字串＝那一邊不出現（例：「此題型盲生不適合作答」只放點字卷，音檔改念「此題請參閱紙本試卷」）
//   存在這台電腦的瀏覽器（localStorage vitools-phrases）；可以匯出成 .json 給其他老師、匯入別人的（相同的不重複加）
//   window.vitoolsPhrases = { open({ onPick }), isOpen(), list(), defaults }
(function () {
  'use strict';
  const KEY = 'vitools-phrases';
  const DEFAULTS = [
    { pb: '「此題型盲生不適合作答」', pa: '此題請參閱紙本試卷' },
    { pb: '(選項請參閱附圖)', pa: '(選項請參閱紙本試卷)' },
    { pb: '請參閱紙本試卷', pa: '請參閱紙本試卷' },
  ];
  const clean = it => ({ pb: String(it && it.pb || '').trim(), pa: String(it && it.pa || '').trim() });
  function list() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (j && Array.isArray(j.items)) return j.items.map(clean).filter(x => x.pb || x.pa);
    } catch (e) { /* 讀不到就用預設 */ }
    return DEFAULTS.map(x => ({ ...x }));
  }
  function save(items) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, items })); return true; } catch (e) { return false; }
  }
  const label = it => (window.vitoolsVtdoc && vitoolsVtdoc.phraseLabel) ? vitoolsVtdoc.phraseLabel(it.pb, it.pa)
    : (it.pb || '') + (it.pa && it.pa !== it.pb ? '〔音檔念：' + it.pa + '〕' : '');

  const CSS = `
#vph{border:1px solid #888;border-radius:10px;padding:0;width:min(640px,96vw);max-height:92vh;background:var(--bg,#fff);color:var(--fg,#222)}
#vph::backdrop{background:rgba(0,0,0,.35)}
#vph form{display:flex;flex-direction:column;gap:8px;padding:12px 14px;max-height:92vh;box-sizing:border-box;overflow:auto}
#vph h2{font-size:1.05rem;margin:0}
#vph p{margin:0;font-size:.85rem;color:#555}
#vph select{width:100%;font-size:1rem}
#vph .vph-row{display:flex;flex-wrap:wrap;gap:6px}
#vph .vph-row button{padding:3px 10px}
#vph fieldset{border:1px solid #bbb;border-radius:6px;display:flex;flex-direction:column;gap:6px}
#vph fieldset label{display:flex;flex-direction:column;font-size:.9rem;gap:2px}
#vph fieldset input{font-size:1rem;padding:3px 6px}
#vph .vph-acts{display:flex;gap:8px;justify-content:flex-end}
#vph .vph-st{min-height:1.2em;font-size:.85rem}
@media (prefers-color-scheme:dark){#vph p{color:#aaa}}
`;
  let dlg = null, sel = null, opts = null, ret = null, items = [], editing = -1;
  const $ = s => dlg.querySelector(s);

  function build() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    dlg = document.createElement('dialog');
    dlg.id = 'vph';
    dlg.setAttribute('aria-labelledby', 'vph-title');
    dlg.innerHTML = '<form method="dialog"><h2 id="vph-title">常用詞句</h2>' +
      '<p>選一句按 Enter（或「插入」）插進目前這一段。點字卷和音檔可以用不同的字：〔音檔念：…〕是音檔的說法，〔音檔不念〕只放點字卷，〔只在音檔：…〕只放音檔。</p>' +
      '<label for="vph-list">詞句</label><select id="vph-list" size="8"></select>' +
      '<div class="vph-row"><button type="button" class="btn pri" id="vph-ins">插入</button>' +
      '<button type="button" class="btn" id="vph-add">新增</button><button type="button" class="btn" id="vph-edit">修改</button>' +
      '<button type="button" class="btn" id="vph-del">刪除</button><button type="button" class="btn" id="vph-up">上移</button><button type="button" class="btn" id="vph-down">下移</button></div>' +
      '<fieldset id="vph-form" hidden><legend id="vph-form-t">新增詞句</legend>' +
      '<label>點字卷的字（空白＝點字卷不出現）<input id="vph-pb" type="text"></label>' +
      '<label>音檔念的字（空白＝音檔不念）<input id="vph-pa" type="text"></label>' +
      '<div class="vph-row"><button type="button" class="btn pri" id="vph-save">儲存</button><button type="button" class="btn" id="vph-cancel-edit">取消</button></div></fieldset>' +
      '<div class="vph-row"><button type="button" class="btn" id="vph-export">匯出詞句（給其他老師）</button><button type="button" class="btn" id="vph-import">匯入詞句</button>' +
      '<button type="button" class="btn" id="vph-reset">恢復預設</button><input type="file" id="vph-file" accept=".json,application/json" hidden></div>' +
      '<div class="vph-st" id="vph-st" role="status" aria-live="polite"></div>' +
      '<div class="vph-acts"><button type="button" class="btn" id="vph-close">關閉</button></div></form>';
    document.body.appendChild(dlg);
    sel = $('#vph-list');
    sel.addEventListener('dblclick', pick);
    sel.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pick(); } else if (e.key === 'Delete') { e.preventDefault(); del(); } });
    $('#vph-ins').addEventListener('click', pick);
    $('#vph-add').addEventListener('click', () => edit(-1));
    $('#vph-edit').addEventListener('click', () => { if (sel.selectedIndex >= 0) edit(sel.selectedIndex); });
    $('#vph-del').addEventListener('click', del);
    $('#vph-up').addEventListener('click', () => move(-1));
    $('#vph-down').addEventListener('click', () => move(1));
    $('#vph-save').addEventListener('click', saveEdit);
    $('#vph-cancel-edit').addEventListener('click', () => { $('#vph-form').hidden = true; sel.focus(); });
    ['#vph-pb', '#vph-pa'].forEach(s => $(s).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } }));
    $('#vph-export').addEventListener('click', exportFile);
    $('#vph-import').addEventListener('click', () => $('#vph-file').click());
    $('#vph-file').addEventListener('change', importFile);
    $('#vph-reset').addEventListener('click', () => {
      if (!confirm('恢復成預設的三句？自己加的詞句會不見（可以先匯出備份）')) return;
      items = DEFAULTS.map(x => ({ ...x })); commit(0); status('恢復成預設的詞句');
    });
    $('#vph-close').addEventListener('click', () => close());
    dlg.addEventListener('cancel', e => {
      if (!$('#vph-form').hidden) { e.preventDefault(); $('#vph-form').hidden = true; sel.focus(); return; }
      e.preventDefault(); close();
    });
  }
  function status(t) { $('#vph-st').textContent = t; }
  function fill(k) {
    sel.innerHTML = '';
    items.forEach(it => sel.add(new Option(label(it), '')));
    if (items.length) sel.selectedIndex = Math.max(0, Math.min(items.length - 1, k));
  }
  function commit(k) { save(items); fill(k); }
  function pick() {
    const k = sel.selectedIndex;
    if (k < 0 || !items[k]) { status('先選一句'); return; }
    const it = { ...items[k] };
    const cb = opts && opts.onPick;
    close(true);
    if (cb) cb(it);
  }
  function edit(k) {
    editing = k;
    $('#vph-form-t').textContent = k < 0 ? '新增詞句' : '修改詞句';
    $('#vph-pb').value = k < 0 ? '' : items[k].pb;
    $('#vph-pa').value = k < 0 ? '' : items[k].pa;
    $('#vph-form').hidden = false;
    $('#vph-pb').focus();
  }
  function saveEdit() {
    const it = clean({ pb: $('#vph-pb').value, pa: $('#vph-pa').value });
    if (!it.pb && !it.pa) { status('點字卷和音檔至少要填一個'); $('#vph-pb').focus(); return; }
    if (editing < 0) { items.push(it); commit(items.length - 1); status('加好了：' + label(it)); }
    else { items[editing] = it; commit(editing); status('改好了：' + label(it)); }
    $('#vph-form').hidden = true;
    sel.focus();
  }
  function del() {
    const k = sel.selectedIndex;
    if (k < 0) return;
    const it = items.splice(k, 1)[0];
    commit(k);
    status('刪掉了：' + label(it));
    sel.focus();
  }
  function move(d) {
    const k = sel.selectedIndex, t = k + d;
    if (k < 0 || t < 0 || t >= items.length) return;
    [items[k], items[t]] = [items[t], items[k]];
    commit(t);
    status((d < 0 ? '上移' : '下移') + '到第 ' + (t + 1) + ' 句');
    sel.focus();
  }
  function exportFile() {
    const blob = new Blob([JSON.stringify({ type: 'vi-tools-phrases', v: 1, items }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vi-tools-常用詞句.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    status('匯出了 ' + items.length + ' 句（vi-tools-常用詞句.json）');
  }
  async function importFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const arr = (Array.isArray(j) ? j : j && j.items || []).map(clean).filter(x => x.pb || x.pa);
      if (!arr.length) { status('這個檔案裡沒有詞句'); return; }
      const has = new Set(items.map(x => x.pb + '\u0000' + x.pa));
      const add = arr.filter(x => !has.has(x.pb + '\u0000' + x.pa));
      items.push(...add);
      commit(items.length - 1);
      status('匯入 ' + add.length + ' 句' + (arr.length > add.length ? '（' + (arr.length - add.length) + ' 句已經有了）' : ''));
    } catch (err) { status('讀不了這個檔案（要是匯出的 .json）'); }
    sel.focus();
  }
  function open(o) {
    if (!dlg) build();
    opts = o || {};
    ret = document.activeElement;
    items = list();
    $('#vph-form').hidden = true;
    status('');
    fill(0);
    dlg.showModal();
    sel.focus();
  }
  function close(picked) {
    if (!dlg || !dlg.open) return;
    dlg.close();
    const cb = !picked && opts && opts.onCancel;
    if (ret && ret.focus && !picked) ret.focus();
    if (cb) cb();
  }
  window.vitoolsPhrases = { open, isOpen: () => !!(dlg && dlg.open), list, defaults: DEFAULTS };
})();
