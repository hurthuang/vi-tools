/*
 * 級數與題型的勾選表：出題練習（index.html）和家長版（parent.html）共用，兩頁的級數、題型、題數完全一樣。
 * 要在 abacus-dir.js、abacus-levels.js、abacus-core.js 之後載入。
 * AbacusPicker.mount(el, { initial: ['1|+', '2|+'] }) 回傳 { render, picks, setAll, pool }。
 * 勾選框的值是「級別|運算」，例如 2|+；改了勾選或題型會在 el 上發出 change 事件。
 * 窄螢幕（手機）每一級排成一張卡片，格子前面寫出「題型」「加法」等欄名。
 * 家長版（parent.html）不用 mount，用 bank、hasForm、CHOICES 自己排級數按鈕。
 */
(function (g) {
  'use strict';
  const banks = {};
  const dirHigh = () => AbacusDir.get() === 'high';
  const getBank = () => { const k = dirHigh() ? 'high' : 'low'; return banks[k] || (banks[k] = buildBank(k === 'high')); };

  // 1～4 級每一列的題型選單
  const FORM_CHOICES = [
    ['F1', '20 以內'],
    ['F2', '兩位數 ± 一位數'],
    ['F1 F2', '20 以內＋兩位數 ± 一位數'],
    ['F3', '兩位數 ± 兩位數'],
    ['F1 F2 F3', '全部'],
  ];
  // 從最高位開始時 5a、5b 的題型選單：加數幾位（從個位開始時只有一位數加數，不用選）
  const LV5_CHOICES = [
    ['G1', '加減一位數'],
    ['G2', '加減兩位數'],
    ['G1 G2', '全部'],
  ];
  // 第 8 級（除法）的題型選單：被除數幾位
  const DIV_CHOICES = [
    ['D2', '兩位數以內 ÷ 一位數'],
    ['D3', '三位數 ÷ 一位數'],
    ['D2 D3', '全部'],
  ];
  // 第 9 級（除數兩位數）的題型選單，照難度排
  const DIV2_CHOICES = [
    ['E2', '兩位數 ÷ 兩位數'],
    ['E3', '三位數 ÷ 兩位數，商一位'],
    ['E2 E3', '兩位數 ÷ 兩位數＋三位數 ÷ 兩位數，商一位'],
    ['E4', '三位數 ÷ 兩位數，商兩位'],
    ['E2 E3 E4', '全部'],
  ];
  const hasForm = id => !!RANK[id] || id.startsWith('8') || id.startsWith('9') || (dirHigh() && /^5[ab]-[12]$/.test(id));
  const formName = id => (FORMS.find(f => f.id === id) || {}).name || '';
  // 第 5、6、7 級的題型是固定的，表格上直接寫出來
  function fixedForm(id) {
    if (dirHigh() && /^5[ab]-/.test(id) && id !== '5b-3') return '兩位數 ± 一位數、兩位數';
    return (LEVELS.find(l => l.id === id) || {}).form || '';
  }

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
.lv-table select{font:inherit;padding:4px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);max-width:100%}
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
  .lv-table input[type=checkbox],.grp-head input[type=checkbox]{width:1.3em;height:1.3em}
}`;

  function mount(root, opts = {}) {
    if (!document.getElementById('abp-css')) {
      const st = document.createElement('style'); st.id = 'abp-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    const initial = new Set(opts.initial || []);
    // 這一級選的題型；沒有選單（第 5、6、7 級）時回傳 null，表示不篩選
    function formsFor(lv) {
      const sel = root.querySelector(`select[data-lv="${lv}"]`);
      return sel ? sel.value.split(' ') : null;
    }
    const pool = (op, lv) => { const f = formsFor(lv); return getBank()[op][lv].filter(it => !f || f.includes(it[2])); };

    function renderLevels() {
      const prev = new Set([...root.querySelectorAll('.lv-table input:checked')].map(i => i.value));
      const prevForm = Object.fromEntries([...root.querySelectorAll('select')].map(s => [s.dataset.lv, s.value]));
      const first = !root.querySelector('.lv-table input');
      const open = new Set([...root.querySelectorAll('button.fold[aria-expanded=true]')].map(b => b.dataset.group));
      // 第 5～9 級各收在一個可以展開的標題下，預設收合；組名和表格標題跟另外兩頁一樣（abacus-levels.js）
      const FOLD = Object.fromEntries(AbacusLevels.GROUPS.filter(gr => gr.key !== '1').map(gr => [gr.key, gr.title]));
      const groups = [];
      for (const lv of LEVELS) {
        if (dirHigh() && lv.id.startsWith('5c')) continue;    // 從最高位開始沒有 5c
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
          <tr><th scope="col">級別</th><th scope="col">題型</th>${ops.map(([, name]) => `<th scope="col">${name}</th>`).join('')}</tr>`;
        for (const lv of g.levels) {
          html += `<tr><th scope="row"><b>${lv.id} 級</b> ${lv.name}。${lv.desc}。</th>`;
          if (hasForm(lv.id)) {
            const g5 = lv.id[0] === '5', g8 = lv.id[0] === '8', g9 = lv.id[0] === '9', cur = prevForm[lv.id] || (g9 ? 'E2' : g8 ? 'D2' : g5 ? 'G1' : 'F1');
            html += `<td data-label="題型"><select data-lv="${lv.id}" aria-label="${lv.id} 級題型">${(g9 ? DIV2_CHOICES : g8 ? DIV_CHOICES : g5 ? LV5_CHOICES : FORM_CHOICES).map(([v, t]) =>
              `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select></td>`;
          } else html += `<td data-label="題型">${fixedForm(lv.id)}</td>`;
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
      root.innerHTML = html;
      updateCounts();
      countLv5();
    }
    // 每一格顯示目前題型下有幾題；1～4 級的例題也換成符合題型的
    function updateCounts() {
      for (const s of root.querySelectorAll('.cnt')) {
        const [lv, op] = s.dataset.v.split('|');
        const list = pool(op, lv);
        s.textContent = `（${list.length} 題）`;
        const f = formsFor(lv);
        if (!f) continue;
        const key = { '+': 'add', '-': 'sub', '÷': 'div' }[op];
        const lvObj = LEVELS.find(l => l.id === lv);
        // 先用 LEVELS 裡寫好的例題，不夠的題型從題庫取第一題補上
        const ex = f.map(id => lvObj[key].split('、').find(e => { const [x, y] = e.split(/[+−÷]/).map(Number); return (op === '÷' ? divForm(x, y) : lvForm(lv, x, y, op)) === id; })
          || (list.find(it => it[2] === id) || []).slice(0, 2).join(sym(op)));
        root.querySelector(`.ex[data-v="${s.dataset.v}"]`).textContent = ex.filter(Boolean).join('、');
      }
    }
    // 收合時也看得出第 5～9 級各勾了幾項
    function countLv5() {
      for (const box of root.querySelectorAll('.grp-all')) {
        const all = [...root.querySelectorAll(`#grp-${box.dataset.group} input[type=checkbox]`)], n = all.filter(i => i.checked).length;
        box.checked = n === all.length;
        box.indeterminate = n > 0 && n < all.length;
        root.querySelector(`.grp-count[data-group="${box.dataset.group}"]`).textContent = `已選 ${n} 項，共 ${all.length} 項`;
      }
    }
    root.addEventListener('click', e => {
      const b = e.target.closest('button.fold');
      if (!b) return;
      const on = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', on);
      root.querySelector('#grp-' + b.dataset.group).hidden = !on;
    });
    root.addEventListener('change', e => {
      if (e.target.classList.contains('grp-all')) {
        root.querySelectorAll(`#grp-${e.target.dataset.group} input[type=checkbox]`).forEach(i => i.checked = e.target.checked);
      }
      if (e.target.tagName === 'SELECT') updateCounts();
      countLv5();
    });
    function setAll(on) { root.querySelectorAll('.lv-table input').forEach(i => { i.checked = on; }); countLv5(); }
    const picks = () => [...root.querySelectorAll('.lv-table input:checked')].map(i => i.value);
    window.addEventListener('abacusdirchange', renderLevels);
    renderLevels();
    return { render: renderLevels, picks, setAll, pool };
  }

  // 家長版不用表格，自己排按鈕，但題庫、題型選單跟這裡共用
  const CHOICES = { F: FORM_CHOICES, G: LV5_CHOICES, D: DIV_CHOICES, E: DIV2_CHOICES };
  g.AbacusPicker = { mount, formName, fixedForm, dirHigh, bank: getBank, hasForm, CHOICES };
})(window);
