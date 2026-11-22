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
  // 從最高位開始沒有 5c；從個位開始沒有 5d
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
.abp-torder{margin-top:0}
.abp-kuku-desc{margin:8px 0 0}
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
  // 一行題目大小核取方塊（加減法、乘法或除法）；九九乘法那一行另外畫（tableRow）
  const sizeRow = ([title, ids], on, name = title) => ids === TABLE_IDS ? tableRow(on, name) : `<div class="abp-size-row" role="group" aria-label="${name}"><span class="abp-size-name" aria-hidden="true">${name}</span>` +
    ids.map(id => `<label><input type="checkbox" value="${id}"${on.has(id) ? ' checked' : ''}> ${formName(id)}</label>`).join('') +
    '<span class="abp-size-msg" role="status"></span></div>';
  // 家長版「更多設定」裡九九乘法練哪幾個數：全選（部分勾選時半選，取消就是全不選）、0～10；下面一行是題目的順序（選的數在前面／前後都有）。
  // 可以全部不選（之後再勾），這時 sizes 多一個 K_none，九九出不了題。出題練習不用這一行，九九那一組自己畫（mount 的 kukuHtml）
  let uid = 0;
  const tableRow = (on, name) => {
    const both = on.has('K_both'), n = ++uid;
    return `<div class="abp-size-row abp-tables" role="group" aria-label="${name}"><span class="abp-size-name" aria-hidden="true">${name}</span>` +
      `<label><input type="checkbox" class="t-all" aria-label="0～10 的乘法全選"> 全選</label>` +
      TABLE_IDS.map(id => `<label><input type="checkbox" value="${id}"${on.has(id) ? ' checked' : ''}> ${formName(id)}</label>`).join('') +
      '<span class="abp-size-msg" role="status"></span></div>' +
      `<div class="abp-size-row abp-torder" role="radiogroup" aria-label="九九乘法題目的順序"><span class="abp-size-name" aria-hidden="true">題目的順序</span>` +
      `<label><input type="radio" name="abp-torder-${n}" value="K_front"${both ? '' : ' checked'}> 選的數在前面（7 × 3）</label>` +
      `<label><input type="radio" name="abp-torder-${n}" value="K_both"${both ? ' checked' : ''}> 前後都有（7 × 3、3 × 7）</label></div>`;
  };
  // 讀畫面上的題目大小（含九九練哪幾個數、順序）
  function readSizes(el) {
    const out = [...el.querySelectorAll('.abp-size-row input:checked:not(.t-all)')].map(i => i.value).filter(v => v !== 'K_front');
    if (el.querySelector('.abp-tables') && !out.some(v => v[0] === 'T')) out.push('K_none');
    return out;
  }
  // 全選核取方塊照 0～10 勾了幾個：全勾、半選、沒勾；沒勾時提示
  function syncTables(el) {
    for (const row of el.querySelectorAll('.abp-tables')) {
      const all = row.querySelector('.t-all'), n = row.querySelectorAll('input[value^="T"]:checked').length;
      all.checked = n === TABLE_IDS.length;
      all.indeterminate = n > 0 && n < TABLE_IDS.length;
      row.querySelector('.abp-size-msg').textContent = n ? '' : '還沒選要練哪幾個數';
    }
  }
  // 九九那一行的全選（取消就是全不選）；回傳 true 表示是九九那一行（或順序）改的
  function tableChange(e) {
    const row = e.target.closest('.abp-tables, .abp-torder');
    if (!row) return false;
    if (e.target.classList.contains('t-all')) row.querySelectorAll('input[value^="T"]').forEach(i => { i.checked = e.target.checked; });
    return true;
  }
  // 每一行至少要勾一個：取消最後一個時勾回去並提示；回傳 false 表示擋下來了（九九那一行可以全部不選）
  function keepOne(e) {
    const row = e.target.closest('.abp-size-row');
    if (!row || row.matches('.abp-tables, .abp-torder')) return true;
    const msg = row.querySelector('.abp-size-msg');
    if (!row.querySelector('input:checked')) { e.target.checked = true; msg.textContent = '至少要選一種大小'; return false; }
    msg.textContent = '';
    return true;
  }
  // 題目大小：加減法、九九練哪幾個數、乘法、除法各一行核取方塊。回傳 { get, set }，改了會在 el 上發出 change 事件
  function sizeBox(el, initial) {
    addCss();
    const on = new Set(fillSizes(initial));
    el.innerHTML = '<fieldset class="abp-sizes"><legend>題目大小（可以複選，選的級數都用這個大小）</legend>' +
      SIZE_GROUPS.map(gr => sizeRow(gr, on)).join('') + '</fieldset>';
    el.addEventListener('change', e => { if (!tableChange(e)) keepOne(e); syncTables(el); });
    syncTables(el);
    return {
      get: () => readSizes(el),
      set: list => {
        const next = mergeSizes(readSizes(el), list);
        el.querySelectorAll('.abp-sizes input:not(.t-all)').forEach(i => { i.checked = i.value === 'K_front' ? !next.includes('K_both') : next.includes(i.value); });
        syncTables(el);
      },
    };
  }
  const poolFor = (op, lv, sizes) => poolOf(getBank(), op, lv, sizes, dirHigh());
  // 套用代號的題目大小：代號只記有選到的運算，沒記的那一行維持原本的勾選（每一行至少一個）
  // 九九的順序跟著 0～10 的勾選走：代號有記哪幾個數就照代號，沒記就照原本的
  const mergeSizes = (cur, list) => {
    const out = SIZE_GROUPS.flatMap(([, ids]) => { const got = ids.filter(id => list.includes(id)); return got.length ? got : ids.filter(id => cur.includes(id)); });
    const src = list.some(id => id[0] === 'T') ? list : cur;
    if (src.includes('K_both')) out.push('K_both');
    if (!out.some(id => id[0] === 'T')) out.push('K_none');
    return out;
  };

  function mount(root, opts = {}) {
    addCss();
    const initial = new Set(opts.initial || []);
    const box = root;
    // 題目大小的勾選，重畫表格時保留
    const sizeOn = new Set(fillSizes(opts.sizes));
    // 每段開頭的組（九九後面才是乘法的題目大小）
    const OP_AT = { 1: '加減法', 0: '乘法', 8: '除法' };
    const SIZE_AT = { 1: [0, '題目大小（第 1～5 級，可以複選）'], 6: [2, '題目大小（第 6、7 級，可以複選）'], 8: [3, '題目大小（第 8、9 級，可以複選）'] };
    const sizes = { get: () => [...sizeOn] };
    const pool = (op, lv) => poolFor(op, lv, sizes.get());
    // 九九乘法那一組（使用者 2026-11-22）：展開後一個數一列（0 的乘法～10 的乘法），跟其他級數一樣勾，
    // 組的「全選」就是全選、全不選；勾了任何一個數就是選了九九。上面一行是九九的說明和題目的順序。
    // 勾了哪幾個數、順序記在 sizeOn（T0～T10、K_both；一個都沒勾是 K_none），練習代號照 sizes 記
    function kukuHtml(lv, first) {
      const both = sizeOn.has('K_both'), n = ++uid;
      const order = `<div class="abp-size-row abp-torder" role="radiogroup" aria-label="九九乘法題目的順序"><span class="abp-size-name" aria-hidden="true">題目的順序</span>` +
        `<label><input type="radio" name="abp-torder-${n}" value="K_front"${both ? '' : ' checked'}> 選的數在前面（7 × 3）</label>` +
        `<label><input type="radio" name="abp-torder-${n}" value="K_both"${both ? ' checked' : ''}> 前後都有（7 × 3、3 × 7）</label></div>`;
      const rows = TABLE_IDS.map(id => {
        const on = sizeOn.has(id) && !(first && !initial.has('九九|×'));
        return `<tr><th scope="row"><b>${formName(id)}</b></th><td data-label="乘法"><label><input type="checkbox" class="t-pick" value="${id}"${on ? ' checked' : ''}> ` +
          `<span class="ex-t" data-t="${id}"></span> <span class="cnt" data-t="${id}"></span></label></td></tr>`;
      }).join('');
      return `<p class="abp-kuku-desc">${lv.name}。${lv.desc}。勾選要練哪幾個數的乘法。</p>${order}` +
        `<table class="lv-table"><caption class="cap-hidden">${AbacusLevels.groupTitle('0')}</caption><tr><th scope="col">練哪個數</th><th scope="col">乘法</th></tr>${rows}</table>`;
    }
    // 畫面上九九的勾選寫回 sizeOn
    function syncKuku() {
      for (const v of [...sizeOn]) if (v[0] === 'T' || v[0] === 'K') sizeOn.delete(v);
      const t = [...box.querySelectorAll('.t-pick:checked')].map(i => i.value);
      if (t.length) t.forEach(v => sizeOn.add(v)); else sizeOn.add('K_none');
      if (box.querySelector('.abp-torder input[value=K_both]:checked')) sizeOn.add('K_both');
    }

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
        if (g.levels[0].id === '九九') { html += kukuHtml(g.levels[0], first); continue; }
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
      if (first) syncKuku();
      updateCounts();
      countLv5();
    }
    // 每一格顯示目前題目大小下有幾題，例題也換成符合大小的
    function updateCounts() {
      const sz = sizes.get(), both = sizeOn.has('K_both');
      // 九九每一個數：題數、哪些題目（7×0～7×10；前後都有再加 0×7～10×7）
      for (const s of box.querySelectorAll('.cnt[data-t]')) {
        const id = s.dataset.t, n = id.slice(1);
        s.textContent = `（${poolFor('×', '九九', [id, ...(both ? ['K_both'] : [])]).length} 題）`;
        box.querySelector(`.ex-t[data-t="${id}"]`).textContent = `${n}×0～${n}×10` + (both ? `、0×${n}～10×${n}` : '');
      }
      for (const s of box.querySelectorAll('.cnt[data-v]')) {
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
      if (e.target.closest('.t-pick, .abp-torder, .grp-all[data-group="0"]')) {
        syncKuku();
        updateCounts();
      } else if (e.target.closest('.abp-size-row')) {
        if (!keepOne(e)) return;
        e.target.checked ? sizeOn.add(e.target.value) : sizeOn.delete(e.target.value);
        updateCounts();
      }
      countLv5();
    });
    function setAll(on) { box.querySelectorAll('.lv-table input').forEach(i => { i.checked = on; }); syncKuku(); updateCounts(); countLv5(); }
    // 勾選的「級別|運算」；九九的數勾了任何一個就是「九九|×」
    const picks = () => [...new Set([...box.querySelectorAll('.lv-table input:checked')].map(i => i.classList.contains('t-pick') ? '九九|×' : i.value))];
    window.addEventListener('abacusdirchange', renderLevels);
    renderLevels();
    // 練習代號套用：勾選照代號，有勾的組展開
    function setPicks(list) {
      const on = new Set(list), kuku = on.has('九九|×'), none = !TABLE_IDS.some(id => sizeOn.has(id));
      box.querySelectorAll('.lv-table input').forEach(i => {
        i.checked = i.classList.contains('t-pick') ? kuku && (none || sizeOn.has(i.value)) : on.has(i.value);
      });
      syncKuku();
      updateCounts();
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

  // 複製文字（練習代號、練習紀錄）：navigator.clipboard 只在 https 或本機才有，http（例如區域網路測試）和舊瀏覽器
  // 改用暫時的文字框加 execCommand('copy')。回傳有沒有複製成功；失敗時頁面要把文字顯示出來讓人自己複製
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* 改用下面的方法 */ }
    const back = document.activeElement, ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (back && back.focus) back.focus();
    return ok;
  }

  // 家長版不用表格，自己排按鈕，但題庫、題目大小跟這裡共用
  g.AbacusPicker = { mount, sizeBox, pool: poolFor, formName, fixedForm, dirHigh, bank: getBank, shownLevel, copyText };
})(window);
