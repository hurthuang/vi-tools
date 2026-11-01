/*
 * 級數勾選表和題目大小：出題練習（index.html）和家長版（parent.html）共用，兩頁的級數、題目大小、題數完全一樣。
 * 要在 abacus-dir.js、abacus-levels.js、abacus-core.js 之後載入。
 * AbacusPicker.mount(el, { initial: ['1|+', '2|+'] }) 回傳 { render, picks, setAll, pool }。
 * 勾選框的值是「級別|運算」，例如 2|+；改了勾選或題目大小會在 el 上發出 change 事件。
 * 題目大小不分級數，所有選的級數共用：加減法、乘法、除法各一行，可以複選。
 * 出題練習分成加減法、乘法、除法三段，題目大小放在每段的標題下面、級數上面（乘法放在九九乘法後面，九九不分大小）；
 * 家長版用 sizeBox 放在「更多設定」。每一行至少要勾一個。
 * 窄螢幕（手機）每一級排成一張卡片，格子前面寫出「加法」等欄名。
 * 家長版（parent.html）不用 mount，用 sizeBox、pool 和自己排的級數按鈕。
 */
(function (g) {
  'use strict';
  const banks = {};
  const dirHigh = () => AbacusDir.get() === 'high';
  const getBank = () => { const k = dirHigh() ? 'high' : 'low'; return banks[k] || (banks[k] = buildBank(k === 'high')); };

  const formName = id => (FORMS.find(f => f.id === id) || {}).name || '';
  const fixedForm = id => (LEVELS.find(l => l.id === id) || {}).form || '';
  // 從最高位開始沒有 5c；從個位開始不列 5d（這種題大多歸 5c，剩下的很少）
  const shownLevel = id => dirHigh() ? !id.startsWith('5c') : id !== '5d';

  // ---- 設定畫面 ----
  // 每一列是一個級別，欄是加法、減法（第 6、7 級是乘法，第 8、9 級是除法）。勾選框的值是「級別|運算」，例如 2|+。
  const OPS = [['+', '加法', 'add'], ['-', '減法', 'sub'], ['×', '乘法', 'mul'], ['÷', '除法', 'div']];

  const CSS = `
.lv-table{border-collapse:collapse;width:100%;margin:8px 0;background:var(--card)}
.lv-table th,.lv-table td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
.lv-table caption{text-align:left;font-weight:700;color:var(--muted);padding:4px 0}
.lv-table th[scope=row]{font-weight:400;min-width:11em}
.lv-table td{min-width:7em}
.lv-table td label{margin:0}
.abp-sizes{border:1px solid var(--line);border-radius:8px;padding:4px 12px 8px;margin:8px 0}
.abp-sizes legend{font-weight:700;padding:0 4px}
.abp-size-row{display:flex;flex-wrap:wrap;align-items:center;gap:2px 16px;margin:4px 0}
.abp-size-row .abp-size-name{font-weight:700;min-width:4em}
.abp-size-row label{margin:2px 0}
.abp-size-row .abp-size-msg{color:var(--bad,#c62828);font-size:.9rem}
.abp-op{font-size:1.15rem;margin:18px 0 4px;padding-top:8px;border-top:2px solid var(--line)}
.abp-op:first-child{margin-top:4px;border-top:0}
.lv-table .cnt{color:var(--muted);font-size:.9rem;white-space:nowrap}
/* 每一組的標題列：組名（第 5～9 級是展開按鈕）後面接這一組的全選核取方塊，收合時也能勾 */
.grp-head{display:flex;flex-wrap:wrap;align-items:center;gap:0 16px;margin:12px 0 0;border-top:1px solid var(--line);padding-top:6px}
.grp-head .grp-title{font-weight:700}
.grp-head button.fold{background:none;border:0;color:var(--fg);font-weight:700;padding:4px 0;margin:0;text-align:left}
.grp-head button.fold::before{content:'▶ ';display:inline-block;width:1.4em;color:var(--muted)}
.grp-head button.fold[aria-expanded=true]::before{content:'▼ '}
.grp-head label{margin:4px 0}
.grp-head .grp-count{color:var(--muted);font-size:.9rem}
.cap-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:600px){
  .lv-table,.lv-table tbody,.lv-table tr,.lv-table th,.lv-table td{display:block;min-width:0}
  .lv-table th[scope=row]{min-width:0}
  .lv-table tr:first-child{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .lv-table tr{border:1px solid var(--line);border-radius:8px;margin:0 0 8px;padding:4px 0}
  .lv-table th,.lv-table td{border:0;padding:4px 10px}
  .lv-table td[data-label]::before{content:attr(data-label) '：';color:var(--muted)}
  .lv-table input[type=checkbox],.grp-head input[type=checkbox],.abp-sizes input[type=checkbox]{width:1.3em;height:1.3em}
  .abp-size-row .abp-size-name{width:100%}
}`;

  function addCss() {
    if (document.getElementById('abp-css')) return;
    const st = document.createElement('style'); st.id = 'abp-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  // 一行題目大小核取方塊（加減法、乘法或除法）
  const sizeRow = ([title, ids], on, name = title) => `<div class="abp-size-row" role="group" aria-label="${name}"><span class="abp-size-name" aria-hidden="true">${name}</span>` +
    ids.map(id => `<label><input type="checkbox" value="${id}"${on.has(id) ? ' checked' : ''}> ${formName(id)}</label>`).join('') +
    '<span class="abp-size-msg" role="status"></span></div>';
  // 每一行至少要勾一個：取消最後一個時勾回去並提示；回傳 false 表示擋下來了
  function keepOne(e) {
    const row = e.target.closest('.abp-size-row');
    if (!row) return true;
    const msg = row.querySelector('.abp-size-msg');
    if (!row.querySelector('input:checked')) { e.target.checked = true; msg.textContent = '至少要選一種大小'; return false; }
    msg.textContent = '';
    return true;
  }
  // 題目大小：加減法、乘法、除法各一行核取方塊。回傳 { get, set }，改了會在 el 上發出 change 事件
  function sizeBox(el, initial) {
    addCss();
    const on = new Set(initial && initial.length ? initial : DEFAULT_SIZES);
    el.innerHTML = '<fieldset class="abp-sizes"><legend>題目大小（可以複選，選的級數都用這個大小）</legend>' +
      SIZE_GROUPS.map(gr => sizeRow(gr, on)).join('') + '</fieldset>';
    el.addEventListener('change', keepOne);
    return {
      get: () => [...el.querySelectorAll('.abp-sizes input:checked')].map(i => i.value),
      set: list => { const next = mergeSizes([...el.querySelectorAll('.abp-sizes input:checked')].map(i => i.value), list); el.querySelectorAll('.abp-sizes input').forEach(i => { i.checked = next.includes(i.value); }); },
    };
  }
  const poolFor = (op, lv, sizes) => poolOf(getBank(), op, lv, sizes, dirHigh());
  // 套用代號的題目大小：代號只記有選到的運算，沒記的那一行維持原本的勾選（每一行至少一個）
  const mergeSizes = (cur, list) => SIZE_GROUPS.flatMap(([, ids]) => { const got = ids.filter(id => list.includes(id)); return got.length ? got : ids.filter(id => cur.includes(id)); });

  function mount(root, opts = {}) {
    addCss();
    const initial = new Set(opts.initial || []);
    const box = root;
    // 題目大小的勾選，重畫表格時保留
    const sizeOn = new Set(opts.sizes && opts.sizes.length ? opts.sizes : DEFAULT_SIZES);
    // 每段開頭的組（九九後面才是乘法的題目大小）
    const OP_AT = { 1: '加減法', 0: '乘法', 8: '除法' };
    const SIZE_AT = { 1: [0, '題目大小（第 1～5 級，可以複選）'], 6: [1, '題目大小（第 6、7 級，可以複選）'], 8: [2, '題目大小（第 8、9 級，可以複選）'] };
    const sizes = { get: () => [...sizeOn] };
    const pool = (op, lv) => poolFor(op, lv, sizes.get());

    function renderLevels() {
      const prev = new Set([...box.querySelectorAll('.lv-table input:checked')].map(i => i.value));
      const first = !box.querySelector('.lv-table input');
      // 每一組都可以收合；第一次打開時第 1～4 級展開，其他收合
      const open = first ? new Set(['1']) : new Set([...box.querySelectorAll('button.fold[aria-expanded=true]')].map(b => b.dataset.group));
      // 組名和表格標題跟另外兩頁一樣（abacus-levels.js）
      const FOLD = Object.fromEntries(AbacusLevels.GROUPS.map(gr => [gr.key, gr.title]));
      const groups = [];
      for (const lv of LEVELS) {
        if (!shownLevel(lv.id)) continue;
        const g = groups[groups.length - 1];
        const cap = lv.part || AbacusLevels.groupTitle(AbacusLevels.groupOf(lv.id));
        if (g && g.name === cap) g.levels.push(lv);
        else groups.push({ name: cap, fold: FOLD[lv.id[0]] ? lv.id[0] : '', levels: [lv] });
      }
      let html = '', gkey = '';
      for (const g of groups) {
        // 每一組（第 1～4 級、第 5 級……）一個標題列：組名後面是全選核取方塊（部分勾選時呈現半選）和已選幾項
        const key = AbacusLevels.groupOf(g.levels[0].id);
        if (key !== gkey) {
          if (gkey) html += '</div>';
          const title = AbacusLevels.groupTitle(key), t = title.split('：')[0], fold = !!FOLD[key];
          if (OP_AT[key]) html += `<h2 class="abp-op">${OP_AT[key]}</h2>`;
          if (SIZE_AT[key]) html += sizeRow(SIZE_GROUPS[SIZE_AT[key][0]], sizeOn, SIZE_AT[key][1]);
          html += `<div class="grp-head">` +
            (fold ? `<button type="button" class="fold" data-group="${key}" aria-expanded="${open.has(key)}" aria-controls="grp-${key}">${title}</button>`
                  : `<span class="grp-title">${title}</span>`) +
            `<label><input type="checkbox" class="grp-all" data-group="${key}" aria-label="${t}全選"> 全選</label>` +
            `<span class="grp-count" data-group="${key}"></span></div>` +
            `<div class="grp-body" id="grp-${key}"${fold && !open.has(key) ? ' hidden' : ''}>`;
          gkey = key;
        }
        const ops = OPS.filter(([, , key]) => g.levels.some(lv => lv[key]));
        html += `<table class="lv-table"><caption${g.name === AbacusLevels.groupTitle(gkey) ? ' class="cap-hidden"' : ''}>${g.name}</caption>
          <tr><th scope="col">級別</th>${ops.map(([, name]) => `<th scope="col">${name}</th>`).join('')}</tr>`;
        for (const lv of g.levels) {
          html += `<tr><th scope="row"><b>${AbacusLevels.lvTag(lv.id)}</b> ${lv.name}。${lv.desc}。</th>`;
          for (const [op, name, key] of ops) {
            if (!lv[key]) { html += `<td data-label="${name}">—</td>`; continue; }
            const v = `${lv.id}|${op}`;
            const checked = first ? initial.has(v) : prev.has(v);
            html += `<td data-label="${name}"><label><input type="checkbox" value="${v}"${checked ? ' checked' : ''}> <span class="ex" data-v="${v}">${lv[key]}</span>
              <span class="cnt" data-v="${v}"></span></label></td>`;
          }
          html += '</tr>';
        }
        html += '</table>';
      }
      if (gkey) html += '</div>';
      box.innerHTML = html;
      updateCounts();
      countLv5();
    }
    // 每一格顯示目前題目大小下有幾題，例題也換成符合大小的
    function updateCounts() {
      const sz = sizes.get();
      for (const s of box.querySelectorAll('.cnt')) {
        const [lv, op] = s.dataset.v.split('|');
        const list = pool(op, lv);
        s.textContent = list.length ? `（${list.length} 題）` : '（這個題目大小沒有題目）';
        const key = { '+': 'add', '-': 'sub', '×': 'mul', '÷': 'div' }[op];
        // 先用 LEVELS 裡寫好的例題，每種大小一題；沒有寫好的從題庫取第一題補上
        const mine = LEVELS.find(l => l.id === lv)[key].split('、');
        const ex = sz.map(id => mine.find(e => { const [x, y] = e.split(/[+−×÷]/).map(Number); return sizeOf(x, y, op) === id; })
          || (list.find(it => it[2] === id) || []).slice(0, 2).join(sym(op))).filter(Boolean);
        box.querySelector(`.ex[data-v="${s.dataset.v}"]`).textContent = (ex.length ? [...new Set(ex)] : mine).join('、');
      }
    }
    // 收合時也看得出第 5～9 級各勾了幾項
    function countLv5() {
      for (const grp of box.querySelectorAll('.grp-all')) {
        const all = [...box.querySelectorAll(`#grp-${grp.dataset.group} input[type=checkbox]`)], n = all.filter(i => i.checked).length;
        grp.checked = n === all.length;
        grp.indeterminate = n > 0 && n < all.length;
        box.querySelector(`.grp-count[data-group="${grp.dataset.group}"]`).textContent = `已選 ${n} 項，共 ${all.length} 項`;
      }
    }
    root.addEventListener('click', e => {
      const b = e.target.closest('button.fold');
      if (!b) return;
      const on = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', on);
      box.querySelector('#grp-' + b.dataset.group).hidden = !on;
    });
    root.addEventListener('change', e => {
      if (e.target.classList.contains('grp-all')) {
        box.querySelectorAll(`#grp-${e.target.dataset.group} input[type=checkbox]`).forEach(i => i.checked = e.target.checked);
      }
      if (e.target.closest('.abp-size-row')) {
        if (!keepOne(e)) return;
        e.target.checked ? sizeOn.add(e.target.value) : sizeOn.delete(e.target.value);
        updateCounts();
      }
      countLv5();
    });
    function setAll(on) { box.querySelectorAll('.lv-table input').forEach(i => { i.checked = on; }); countLv5(); }
    const picks = () => [...box.querySelectorAll('.lv-table input:checked')].map(i => i.value);
    window.addEventListener('abacusdirchange', renderLevels);
    renderLevels();
    // 練習代號套用：勾選照代號，有勾的組展開
    function setPicks(list) {
      const on = new Set(list);
      box.querySelectorAll('.lv-table input').forEach(i => { i.checked = on.has(i.value); });
      for (const b of box.querySelectorAll('button.fold')) {
        if (!box.querySelector(`#grp-${b.dataset.group} .lv-table input:checked`)) continue;
        b.setAttribute('aria-expanded', true);
        box.querySelector('#grp-' + b.dataset.group).hidden = false;
      }
      countLv5();
    }
    function setSizes(list) {
      const next = mergeSizes([...sizeOn], list);
      sizeOn.clear(); next.forEach(v => sizeOn.add(v));
      renderLevels();
    }
    return { render: renderLevels, picks, setAll, pool, setPicks, setSizes, sizes: sizes.get };
  }

  // 家長版不用表格，自己排按鈕，但題庫、題目大小跟這裡共用
  g.AbacusPicker = { mount, sizeBox, pool: poolFor, formName, fixedForm, dirHigh, bank: getBank, shownLevel };
})(window);
