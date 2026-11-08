// 版面整理（測試版）：開中繼檔（.vtdoc.html），左邊原卷、右邊排好的內容，調區塊的類型、順序、分段合併、
// 刪題、表格與附圖的輸出方式，把沒輸出的地方加回來，存回中繼檔。規格：docs/notes/vtdoc.md 第 3、5 節。
// 用到 vtdoc.js、vtdoc-view.js、html-table.js。
//
// 做法：中繼檔的 <main> 就是正本。每次操作先把 main 攤平成「區塊」清單（flatten），改清單，再照清單重排 main（build）。
// 元素本身（含 data-blk、data-box、算式的 data-tex／MathML、讀音）原樣搬動，不重新產生，nc、文字轉點字改過的都保得住。
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const TY = {
    q: { name: '題目', key: '1', tag: 'h3' },
    opt: { name: '選項', key: '2', tag: 'p', cls: 'vt-opt' },
    p: { name: '文字', key: '3', tag: 'p' },
    h2: { name: '大題', key: '8', tag: 'h2', cls: 'vt-section' },
    h1: { name: '標題', key: '9', tag: 'h1' },
    item: { name: '小項', tag: 'p', cls: 'vt-item' },
    passage: { name: '文章', tag: 'p', cls: 'vt-passage' },
    optfig: { name: '選項是圖', tag: 'p', cls: 'vt-optfig' },
    skip: { name: '略過', key: '0', tag: 'p', cls: 'vt-skip' },
    tbltext: { name: '表格文字' }, figtext: { name: '圖中文字' }, figdesc: { name: '圖的敘述' },
    table: { name: '表格' }, fig: { name: '附圖' }, score: { name: '譜例' }, page: { name: '換頁' }, other: { name: '其他' }
  };
  const TEXT = new Set(['q', 'opt', 'p', 'h2', 'h1', 'item', 'passage', 'optfig', 'skip']);
  const DERIVED = new Set(['tbltext', 'figtext', 'figdesc']);
  const CLS = { 'vt-opt': 'opt', 'vt-item': 'item', 'vt-passage': 'passage', 'vt-optfig': 'optfig', 'vt-skip': 'skip',
    'vt-tbltext': 'tbltext', 'vt-figtext': 'figtext', 'vt-figdesc': 'figdesc' };
  const TBL_HOW = [['table', '保留表格'], ['rows', '以列為軸的文字'], ['cols', '以欄為軸的文字'], ['mark', '只標(請參閱附表)'], ['none', '不輸出']];
  const FIG_HOW = [['mark', '標(請參閱附圖)'], ['figtext', '標記＋圖中文字'], ['text', '改成文字敘述'], ['none', '不輸出']];

  let V = null, fname = '', main = null, blocks = [], cur = -1, anchor = -1, dirty = false, ops = 0;
  let editing = -1, editMaths = null, undoStack = [], omSel = null;
  let rowOf = new WeakMap();   // 元素 → 清單上的那一列（沒改的不重畫，算式不用重排）
  let sv = null;

  function status(s) { $('ly-st').textContent = s || ''; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function typeset(el) {
    if (window.MathJax && MathJax.typesetPromise) return MathJax.typesetPromise([el]).catch(() => {});
    return Promise.resolve();
  }

  // ---------- 攤平／重排 ----------
  function typeOf(el) {
    const tag = el.tagName;
    if (tag === 'H1') return 'h1';
    if (tag === 'H2') return 'h2';
    if (tag === 'H3') return 'q';
    if (tag === 'P') {
      for (const c of el.classList) if (CLS[c]) return CLS[c];
      return 'p';
    }
    if (tag === 'TABLE') return 'table';
    if (tag === 'FIGURE') return el.classList.contains('vt-score') ? 'score' : 'fig';
    if (tag === 'HR' && el.classList.contains('vt-page')) return 'page';
    return 'other';
  }

  // 題組（section.vt-group，閱讀測驗的文章＋它的題目）：每個區塊記著 grp（所在的題組元素），build 時連續同一個 grp 的放進去
  function flatten() {
    const out = [];
    const walk = (parent, grp) => {
      for (const c of [...parent.children]) {
        if (c.tagName === 'SECTION' && c.classList.contains('vt-q') && c.querySelector(':scope > h3')) {
          let first = true;
          for (const k of [...c.children]) {
            if (k.tagName === 'TEMPLATE') continue;
            if (first && k.tagName === 'H3') { out.push({ el: k, type: 'q', sec: c, grp }); first = false; }
            else out.push({ el: k, type: typeOf(k), grp });
          }
        } else if (c.tagName === 'SECTION' && c.classList.contains('vt-group')) {
          walk(c, c);
        } else out.push({ el: c, type: typeOf(c), grp });
      }
    };
    walk(main, null);
    blocks = out;
  }

  function qnum(el) {
    const m = /^\s*(\d+)\s*[.．、]/.exec(el.textContent);
    return m ? m[1] : '';
  }

  function build() {
    normGroups();
    const frag = document.createDocumentFragment();
    let sec = null, grp = null;
    for (const b of blocks) {
      if ((b.grp || null) !== grp) {   // 進出題組：題目不跨題組
        grp = b.grp || null;
        sec = null;
        if (grp) { grp.replaceChildren(); frag.appendChild(grp); }
      }
      const box = grp || frag;
      if (b.type === 'h1' || b.type === 'h2') { sec = null; box.appendChild(b.el); }
      else if (b.type === 'q') {
        sec = b.sec;
        for (const k of [...sec.children]) if (k.tagName !== 'TEMPLATE') k.remove();
        sec.insertBefore(b.el, sec.firstChild);
        const n = qnum(b.el) || (sec.hasAttribute('data-drop') ? sec.dataset.num : '');
        if (n) sec.dataset.num = n; else delete sec.dataset.num;
        box.appendChild(sec);
      } else (sec || box).appendChild(b.el);
    }
    main.replaceChildren(frag);
  }

  // 題組整理（build 前）：標題、大題、換頁不放進題組；夾在同一個題組中間的區塊（新拉的框、搬進來的）併進去；
  // 一個題組要連續，被搬到別處、跟前面斷開的就離開題組；題組裡要有題目，沒有就拆掉
  function normGroups() {
    blocks.forEach(b => { if (b.type === 'h1' || b.type === 'h2') b.grp = null; });
    for (let i = 1; i < blocks.length - 1; i++) {
      const b = blocks[i];
      if (b.grp || b.type === 'h1' || b.type === 'h2') continue;
      const p = blocks[i - 1].grp, n = blocks.slice(i + 1).find(x => x.type !== 'page');
      if (p && n && n.grp === p) b.grp = p;
    }
    const done = new Set();
    let last = null;
    for (const b of blocks) {
      const g = b.grp || null;
      if (g && g !== last && done.has(g)) b.grp = null;
      if (b.grp) done.add(b.grp);
      last = b.grp || null;
    }
    for (const g of done) if (!blocks.some(b => b.grp === g && b.type === 'q')) blocks.forEach(b => { if (b.grp === g) b.grp = null; });
  }

  // T：選好的範圍設成題組；只選一塊（例如「閱讀下文，回答第 11～13 題」）照文字裡的題號範圍自動選到最後一題；
  // 選到的在題組裡、只選一塊 → 取消那個題組
  function toggleGroup() {
    if (cur < 0) return;
    const S = selRange();
    const b = blocks[cur];
    if (S.length === 1 && b.grp) {
      snap();
      const g = b.grp, n = blocks.filter(x => x.grp === g).length;
      blocks.forEach(x => { if (x.grp === g) x.grp = null; });
      build(); flatten(); changed(); render();
      status('已取消題組（' + n + ' 個區塊）');
      return;
    }
    let a = S[0], z = S[S.length - 1];
    if (S.length === 1) {
      const m = /第?\s*(\d+)\s*(?:[～~〜至到－—–\-及和與、]|題?\s*[～~〜至到－—–\-及和與、])\s*第?\s*(\d+)\s*題/.exec(b.el.textContent);
      const last = m && blocks.findIndex((x, i) => i > a && x.type === 'q' && qnum(x.el) === m[2]);
      if (!m || last < 0) { status('先選好題組的範圍（文章到最後一題，Shift＋上下鍵），再按 T；或選題組說明那一段（寫著「回答第 11～13 題」）'); return; }
      z = last;
    }
    z = Math.max(z, qEnd(z));
    if (!blocks.slice(a, z + 1).some(x => x.type === 'q')) { status('題組裡要有題目：範圍選到文章和它的題目'); return; }
    snap();
    const g = main.ownerDocument.createElement('section');
    g.className = 'vt-group';
    for (let i = a; i <= z; i++) if (blocks[i].type !== 'h1' && blocks[i].type !== 'h2') blocks[i].grp = g;
    build(); flatten(); changed();
    const qs = blocks.filter(x => x.grp === g && x.type === 'q').map(x => qnum(x.el)).filter(Boolean);
    cur = anchor = a;
    render();
    status('已設成題組：' + (z - a + 1) + ' 個區塊' + (qs.length ? '，第 ' + qs[0] + (qs.length > 1 ? '～' + qs[qs.length - 1] : '') + ' 題' : '') + '（再按 T 取消）');
  }

  function boxOf(b) {
    return vitoolsVtdoc.box(b.el) || (b.sec && vitoolsVtdoc.box(b.sec)) || null;
  }

  // 元素換類型：內容、data-blk、data-box、lang 搬過去
  function retype(b, t) {
    if (b.type === t || !TEXT.has(b.type) || !TEXT.has(t)) return false;
    const d = TY[t], old = b.el;
    const el = main.ownerDocument.createElement(d.tag);
    for (const a of old.attributes) {
      if (['class', 'hidden', 'data-label', 'data-points', 'data-num'].includes(a.name)) continue;
      el.setAttribute(a.name, a.value);
    }
    if (b.type === 'q' && b.sec) {
      ['data-blk', 'data-box'].forEach(a => { if (b.sec.hasAttribute(a) && !el.hasAttribute(a)) el.setAttribute(a, b.sec.getAttribute(a)); });
    }
    while (old.firstChild) el.appendChild(old.firstChild);
    if (d.cls) el.className = d.cls;
    if (t === 'skip') el.hidden = true;
    if (t === 'opt') {
      const m = /^\s*[(（]\s*([A-Za-zＡ-Ｚ甲乙丙丁戊])\s*[)）]|^\s*([①-⑳])/.exec(el.textContent);
      if (m) el.dataset.label = m[1] || m[2];
    }
    if (t === 'h2') {
      const m = /每題\s*(\d+(?:\.\d+)?)\s*分/.exec(el.textContent);
      if (m) el.dataset.points = m[1];
    }
    b.el = el;
    if (t === 'q') {
      const sec = main.ownerDocument.createElement('section');
      sec.className = 'vt-q';
      ['data-blk', 'data-box'].forEach(a => { if (el.hasAttribute(a)) { sec.setAttribute(a, el.getAttribute(a)); el.removeAttribute(a); } });
      b.sec = sec;
    } else delete b.sec;
    b.type = t;
    return true;
  }

  // ---------- 復原 ----------
  function snap() {
    undoStack.push({ html: main.innerHTML, om: JSON.stringify((V.meta && V.meta.omitted) || []), cur });
    if (undoStack.length > 40) undoStack.shift();
    $('ly-undo').disabled = false;
  }
  function undo() {
    endEdit();
    const s = undoStack.pop();
    if (!s) return;
    main.innerHTML = s.html;
    if (V.meta) V.meta.omitted = JSON.parse(s.om);
    rowOf = new WeakMap();
    flatten();
    cur = anchor = Math.min(s.cur, blocks.length - 1);
    render();
    $('ly-undo').disabled = !undoStack.length;
    status('已復原');
  }
  function changed() { dirty = true; ops++; }

  // ---------- 開檔 ----------
  // note：從原始文件剛做出來的（還沒存成中繼檔），狀態列先說怎麼來的
  function load(html, name, note) {
    const v = vitoolsVtdoc.parse(html);
    if (!v) { alert('這個檔案不是 vi-tools 中繼檔（.vtdoc.html）'); return; }
    V = v; fname = name; dirty = !!note; ops = 0; undoStack = []; omSel = null;
    main = V.doc.querySelector('main') || V.doc.body;
    rowOf = new WeakMap();
    flatten();
    cur = anchor = blocks.length ? 0 : -1;
    $('ly-name').textContent = name + '（' + (vitoolsVtdoc.title(V) || '') + '）';
    $('ly-save').disabled = false;
    $('ly-undo').disabled = true;
    $('ly-om').hidden = true;
    render();
    sv.open(V).then(ok => {
      $('ly-nosrc').hidden = ok;
      $('ly-nosrc').textContent = !V.meta.source || V.meta.source.kind === 'text' ?
        '這份是從 Word 或純文字做的，沒有原卷，直接在右邊整理。' :
        '這個中繼檔沒有帶原卷。請在 vi-tools 辨識套件存中繼檔時勾「中繼檔包含原卷」，再存一次。';
      $('ly-page').hidden = !ok;
      if (ok) { const b = cur >= 0 && boxOf(blocks[cur]); sv.show(b ? b.page : 1); }
      showHd();
      const om = (V.meta.omitted || []).filter(o => o.kind === 'uncovered').length;
      const ng = new Set(blocks.map(b => b.grp).filter(Boolean)).size;
      status((note ? note + '。' : '') + '共 ' + blocks.length + ' 個區塊' + (ng ? '、' + ng + ' 個題組' : '') + (om ?'；原卷上有 ' + om + ' 處字沒被收進任何區塊（紅斜線），點它可以加回來' : ''));
    });
    $('ly-list').focus();
  }

  // ---------- 右邊：排好的內容 ----------
  function rowContent(b, tx) {
    const el = b.el;
    if (b.type === 'page') { tx.textContent = '── 原卷第 ' + (el.dataset.page || '') + ' 頁 ──'; return; }
    if (b.type === 'fig' || b.type === 'score') {
      const img = el.querySelector('img');
      if (img) { const i = document.createElement('img'); i.src = img.src; i.alt = img.alt || ''; tx.appendChild(i); }
      const cap = el.querySelector('figcaption');
      const how = el.dataset.how || 'mark';
      const p = document.createElement('div');
      p.textContent = (cap ? cap.textContent + '　' : '') + '輸出：' + ((FIG_HOW.find(x => x[0] === how) || [0, how])[1]) +
        (el.dataset.tactile === '1' ? '，做觸圖' : '') + (img && img.alt ? '　' + img.alt : '');
      p.style.fontSize = '.8rem'; p.style.color = '#555';
      tx.appendChild(p);
      return;
    }
    const c = document.importNode(el, true);
    c.querySelectorAll('template, script').forEach(e => e.remove());
    c.querySelectorAll('.vt-math').forEach(s => {
      s.innerHTML = '\\(' + esc(s.dataset.tex || s.textContent.replace(/^\\\(|\\\)$/g, '')) + '\\)';
      s.removeAttribute('data-crop');
    });
    if (b.type === 'table') {
      const how = el.dataset.how || 'table';
      const p = document.createElement('div');
      p.textContent = '輸出：' + ((TBL_HOW.find(x => x[0] === how) || [0, how])[1]);
      p.style.fontSize = '.8rem'; p.style.color = '#555';
      c.removeAttribute('hidden');
      tx.appendChild(c); tx.appendChild(p);
      return;
    }
    while (c.firstChild) tx.appendChild(c.firstChild);
  }

  function makeRow(b) {
    const r = document.createElement('div');
    r.className = 'row';
    r.setAttribute('role', 'option');
    r.innerHTML = '<span class="no"></span><span class="ty"></span><div class="tx"></div>';
    if (b.type !== 'page') r.draggable = true;
    rowContent(b, r.querySelector('.tx'));
    rowOf.set(b.el, r);
    r._new = true;
    return r;
  }

  function hiddenUp(el) {
    for (let e = el; e && e !== main; e = e.parentElement) if (e.hasAttribute('hidden')) return true;
    return false;
  }

  function render() {
    const list = $('ly-list');
    const frag = document.createDocumentFragment();
    const fresh = [];
    let qn = 0;
    blocks.forEach((b, i) => {
      let r = rowOf.get(b.el);
      if (!r) { r = makeRow(b); fresh.push(r); }
      r.id = 'ly-r' + i;
      r.dataset.i = i;
      const gs = b.grp && (!blocks[i - 1] || blocks[i - 1].grp !== b.grp), ge = b.grp && (!blocks[i + 1] || blocks[i + 1].grp !== b.grp);
      r.className = 'row t-' + b.type + (hiddenUp(b.el) && b.type !== 'skip' ? ' hid' : '') +
        (b.sec && b.sec.hasAttribute('data-drop') ? ' drop' : '') + (b.grp ? ' grp' : '') + (gs ? ' gs' : '') + (ge ? ' ge' : '');
      r.querySelector('.no').textContent = i + 1;
      const ty = r.querySelector('.ty');
      ty.className = 'ty ty-' + b.type;
      ty.textContent = TY[b.type].name + (b.type === 'q' && b.sec && b.sec.hasAttribute('data-drop') ? '（刪）' : '');
      // 題組開頭、結尾：螢幕報讀念得到（畫面上是左邊紫色線）
      let gl = r.querySelector('.gl');
      if (gs || ge) {
        if (!gl) { gl = document.createElement('span'); gl.className = 'gl'; r.querySelector('.tx').before(gl); }
        gl.textContent = gs && ge ? '題組' : gs ? '題組開始' : '題組結束';
      } else if (gl) gl.remove();
      if (b.type === 'q') qn++;
      frag.appendChild(r);
    });
    list.replaceChildren(frag);
    if (fresh.length) {
      // 新的列一起排算式
      Promise.all(fresh.map(r => r.querySelector('.vt-math') ? typeset(r) : null));
    }
    mark();
  }

  function selRange() {
    if (cur < 0) return [];
    const a = Math.min(anchor < 0 ? cur : anchor, cur), z = Math.max(anchor < 0 ? cur : anchor, cur);
    const out = [];
    for (let i = a; i <= z; i++) out.push(i);
    return out;
  }

  function mark(scroll) {
    const list = $('ly-list');
    const S = new Set(selRange());
    list.querySelectorAll('.row').forEach(r => {
      const i = +r.dataset.i;
      r.classList.toggle('sel', S.has(i) && i !== cur);
      r.classList.toggle('cur', i === cur);
      r.setAttribute('aria-selected', S.has(i) ? 'true' : 'false');
    });
    if (cur >= 0) list.setAttribute('aria-activedescendant', 'ly-r' + cur); else list.removeAttribute('aria-activedescendant');
    const r = $('ly-r' + cur);
    if (r && scroll !== false) {
      const lr = list.getBoundingClientRect(), rr = r.getBoundingClientRect();
      if (rr.top < lr.top || rr.bottom > lr.bottom) list.scrollTop += rr.top - lr.top - list.clientHeight / 3;
    }
    tools();
    if (sv && sv.has()) {
      const b = blocks[cur] && boxOf(blocks[cur]);
      if (b && scroll !== false) {
        if ($('ly-follow').checked && $('ly-fit').value !== 'zoom') $('ly-fit').value = 'zoom';
        sv.focus(b);
      } else sv.redraw();
    }
  }

  function tools() {
    const b = blocks[cur];
    const S = selRange().map(i => blocks[i]);
    const anyText = S.some(x => TEXT.has(x.type));
    $('ly-type').disabled = !anyText;
    if (b && TEXT.has(b.type)) $('ly-type').value = b.type;
    ['ly-up', 'ly-down'].forEach(id => { $(id).disabled = !b; });
    $('ly-edit').disabled = !b || !(TEXT.has(b.type) || DERIVED.has(b.type));
    $('ly-split').disabled = editing < 0;
    $('ly-merge').disabled = !b || cur === 0 || !(TEXT.has(b.type) || DERIVED.has(b.type));
    $('ly-new').disabled = !V;
    $('ly-del').disabled = !b || b.type === 'page';
    $('ly-drop').disabled = !b || b.type !== 'q';
    $('ly-grp').disabled = !b;
    $('ly-grp').textContent = b && b.grp && selRange().length === 1 ? '取消題組' : '設成題組';
    $('ly-reocr').hidden = !hdOn();
    $('ly-reocr').disabled = !S.some(x => TEXT.has(x.type) && boxOf(x));
    $('ly-drop').textContent = b && b.sec && b.sec.hasAttribute('data-drop') ? '恢復這一題' : '刪題';
    const how = $('ly-how');
    const isT = b && b.type === 'table', isF = b && b.type === 'fig';
    $('ly-how-w').hidden = !(isT || isF);
    $('ly-tac-w').hidden = !isF;
    if (isT || isF) {
      const L = isT ? TBL_HOW : FIG_HOW;
      if (how.dataset.kind !== (isT ? 't' : 'f')) {
        how.innerHTML = L.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('');
        how.dataset.kind = isT ? 't' : 'f';
      }
      how.value = b.el.dataset.how || L[0][0];
      $('ly-tac').checked = b.el.dataset.tactile === '1';
    }
    const txt = isT && /^(rows|cols)$/.test(b.el.dataset.how || '');
    $('ly-hd-w').hidden = !txt;
    if (txt) {
      $('ly-hrow').value = b.el.dataset.hrow || '';
      $('ly-hcol').value = b.el.dataset.hcol || '';
    }
  }

  function select(i, ext, scroll) {
    if (i < 0 || i >= blocks.length) return;
    endEdit();
    omSel = null; $('ly-om').hidden = true;
    cur = i;
    if (!ext) anchor = i;
    mark(scroll);
  }

  // ---------- 左邊：原卷上的框 ----------
  function drawBoxes(ov, page) {
    if (!V) return;
    const S = new Set(selRange());
    const num = $('ly-onum').checked;
    blocks.forEach((b, i) => {
      if (b.type === 'page') return;
      const bx = boxOf(b);
      if (!bx || bx.page !== page) return;
      // 同一個框（例：一個區塊拆出的幾個選項）只畫第一次，選到的另外畫
      const st = orderSeq ? (orderSeq.includes(b.el) ? ' sel' : '') : (i === cur ? ' cur' : S.has(i) ? ' sel' : '');
      const d = sv.boxDiv(bx, 'ty-' + b.type + (hiddenUp(b.el) ? ' hid' : '') + st,
        (i + 1) + '. ' + TY[b.type].name + '：' + b.el.textContent.slice(0, 40));
      d.dataset.i = i;
      if (num) { const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1; d.appendChild(n); }
      // 選到的框：四邊四角的控制點拖曳改大小，拖框的中間搬位置
      if (i === cur && !orderSeq) ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(h => {
        const k = document.createElement('span'); k.className = 'hd hd-' + h; k.dataset.h = h; d.appendChild(k);
      });
      if (i === cur && !orderSeq) {
        const x = document.createElement('span');
        x.className = 'del'; x.textContent = '✕'; x.title = '刪除這一塊（Delete）';
        d.appendChild(x);
      }
      ov.appendChild(d);
    });
    ((V.meta && V.meta.omitted) || []).forEach((o, k) => {
      if (o.page !== page || o.done) return;
      const d = sv.boxDiv(o.box, o.kind === 'uncovered' ? 'om-unc' : 'om-skip',
        (o.kind === 'uncovered' ? '沒被收進任何區塊：' : '略過（沒輸出）：') + o.text);
      d.dataset.om = k;
      if (omSel === k) d.classList.add('cur');
      ov.appendChild(d);
    });
  }

  function showOmitted(k) {
    const o = V.meta.omitted[k];
    endEdit();
    omSel = k;
    $('ly-om').hidden = false;
    $('ly-om-text').textContent = (o.kind === 'uncovered' ? '這裡的字沒被收進任何區塊，沒有輸出：\n' : '這一塊在辨識套件被設成「略過」，沒有輸出：\n') + (o.text || '（沒有文字）');
    sv.redraw();
  }

  // 沒輸出的字加回來：放在原卷上位置在它前面的最後一塊後面
  function addOmitted(all) {
    const o0 = V.meta.omitted[omSel];
    if (!o0) return;
    snap();
    // 「這一頁同樣的都加回來」：同一頁、同一種的，同一行的接成一段（左到右），一行有好幾個選項記號就拆成選項
    const list = all ? V.meta.omitted.filter(x => x.page === o0.page && x.kind === o0.kind) : [o0];
    let last = -1, n = 0;
    toLines(list).forEach(ln => {
      const parts = splitOpts(ln.text);
      parts.forEach((t, k) => {
        const o = { page: ln.page, box: ln.box, text: t };
        last = k === 0 ? addOne(o, parts.length > 1 ? 'opt' : 'p') : addOne(o, 'opt', last + 1);
        n++;
      });
    });
    list.forEach(o => V.meta.omitted.splice(V.meta.omitted.indexOf(o), 1));
    omSel = null;
    $('ly-om').hidden = true;
    build(); changed();
    render();
    select(last);
    status('加回來 ' + n + ' 塊（類型先設好了，不對的用數字鍵改；位置不對用 Alt＋↑↓ 搬）');
  }

  // 同一行（上下重疊超過一半）的接起來，左到右
  function toLines(list) {
    const it = list.map(o => ({ o, y0: o.box[1], y1: o.box[3] })).sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    const L = [];
    it.forEach(x => {
      const ln = L.find(l => {
        const ov = Math.min(l.y1, x.y1) - Math.max(l.y0, x.y0);
        return ov > 0.5 * Math.min(l.y1 - l.y0, x.y1 - x.y0);
      });
      if (ln) { ln.items.push(x.o); ln.y0 = Math.min(ln.y0, x.y0); ln.y1 = Math.max(ln.y1, x.y1); }
      else L.push({ items: [x.o], y0: x.y0, y1: x.y1 });
    });
    return L.sort((a, b) => a.y0 - b.y0).map(l => {
      const its = l.items.sort((a, b) => a.box[0] - b.box[0]);
      return {
        page: its[0].page,
        box: [Math.min(...its.map(o => o.box[0])), l.y0, Math.max(...its.map(o => o.box[2])), l.y1],
        text: its.map(o => (o.text || '').trim()).filter(Boolean).join(' ')
      };
    });
  }

  function splitOpts(t) {
    const re = /[(（]\s*[A-EＡ-Ｅ]\s*[)）]/g, at = [];
    let m;
    while ((m = re.exec(t))) at.push(m.index);
    if (at.length < 2) return [t];
    const out = [];
    if (at[0] > 0 && t.slice(0, at[0]).trim()) out.push(t.slice(0, at[0]).trim());
    at.forEach((a, k) => out.push(t.slice(a, k + 1 < at.length ? at[k + 1] : t.length).trim()));
    return out;
  }

  // 新拉的框放在哪裡：目前選到的區塊（表格、附圖連同後面的文字）後面；沒選到 → null（照原卷位置）
  function afterCur() { return cur >= 0 && blocks[cur] ? unitEnd(cur) + 1 : null; }
  function addOne(o, type, pos) {
    const el = main.ownerDocument.createElement('p');
    el.dataset.box = o.page + ' ' + o.box.map(x => (+x).toFixed(4)).join(' ');
    setInline(el, o.text || '');
    if (type === 'opt') { el.className = 'vt-opt'; retypeLabel(el); }
    if (pos != null) { blocks.splice(pos, 0, { el, type }); return pos; }
    let at = -1;
    blocks.forEach((b, i) => {
      const bx = boxOf(b);
      if (bx && (bx.page < o.page || (bx.page === o.page && bx.y0 <= o.box[1] + 0.002))) at = i;
    });
    // 加在題目／選項的後面時，別插在表格、附圖和它的文字中間
    while (at + 1 < blocks.length && DERIVED.has(blocks[at + 1].type)) at++;
    blocks.splice(at + 1, 0, { el, type: type || 'p' });
    return at + 1;
  }

  // 文字（算式寫成 \( \)）→ 元素內容
  function setInline(el, text) {
    el.textContent = '';
    const re = /\\\((.+?)\\\)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) el.appendChild(el.ownerDocument.createTextNode(text.slice(last, m.index)));
      const s = el.ownerDocument.createElement('span');
      s.className = 'vt-math';
      s.dataset.tex = m[1];
      s.textContent = '\\(' + m[1] + '\\)';
      el.appendChild(s);
      last = re.lastIndex;
    }
    if (last < text.length) el.appendChild(el.ownerDocument.createTextNode(text.slice(last)));
  }

  // ---------- 操作 ----------
  function setType(t) {
    const S = selRange().filter(i => TEXT.has(blocks[i].type) && blocks[i].type !== t);
    if (!S.length) return;
    // 刪掉的題目不能直接改類型
    if (S.some(i => blocks[i].sec && blocks[i].sec.hasAttribute('data-drop'))) { status('刪掉的題目先「恢復這一題」再改類型'); return; }
    snap();
    S.forEach(i => retype(blocks[i], t));
    build(); changed();
    render();
    status(S.length + ' 塊改成「' + TY[t].name + '」');
  }

  // 一個單位：表格／附圖連同後面的表格文字、圖中文字、圖的敘述
  function unitEnd(i) {
    let e = i;
    if (blocks[i] && (blocks[i].type === 'table' || blocks[i].type === 'fig')) while (e + 1 < blocks.length && DERIVED.has(blocks[e + 1].type)) e++;
    return e;
  }
  function unitStart(i) {
    let s = i;
    while (s > 0 && DERIVED.has(blocks[s].type) && (blocks[s - 1].type === 'table' || blocks[s - 1].type === 'fig' || DERIVED.has(blocks[s - 1].type))) s--;
    return s;
  }

  function move(d) {
    let S = selRange();
    if (!S.length) return;
    let a = S[0], z = unitEnd(S[S.length - 1]);
    if (DERIVED.has(blocks[a].type)) a = unitStart(a);
    if (d < 0 && a === 0 || d > 0 && z === blocks.length - 1) return;
    snap();
    const seg = blocks.splice(a, z - a + 1);
    let to;
    if (d < 0) to = unitStart(a - 1);
    else { to = unitEnd(a) + 1; }
    blocks.splice(to, 0, ...seg);
    const off = to - a;
    cur += off; anchor = (anchor < 0 ? cur : anchor + off);
    build(); changed();
    render();
  }

  function startEdit() {
    const b = blocks[cur];
    if (!b || !(TEXT.has(b.type) || DERIVED.has(b.type))) return;
    if (editing === cur) return;
    endEdit();
    const tx = $('ly-r' + cur).querySelector('.tx');
    editing = cur;
    editMaths = [...b.el.querySelectorAll('.vt-math')];
    tx.querySelectorAll('.vt-math').forEach((s, k) => { s.dataset.mi = k; s.contentEditable = 'false'; });
    tx.contentEditable = 'true';
    tx.focus();
    const sel = getSelection(), r = document.createRange();
    r.selectNodeContents(tx); r.collapse(false);
    sel.removeAllRanges(); sel.addRange(r);
    tools();
    status('改字中：Enter 或 Esc 改完，Shift＋Enter 換行，Ctrl＋Enter 從游標處分段；點兩下算式改 LaTeX');
  }

  // 編輯區 → 真正的元素內容（算式換回原本的元素，MathML、信心、裁圖都還在）
  function realNodes(container, maths) {
    const c = container.cloneNode(true);
    c.querySelectorAll('[data-mi]').forEach(s => {
      const m = maths[+s.dataset.mi];
      if (m) s.replaceWith(m.cloneNode(true)); else s.remove();
    });
    c.querySelectorAll('mjx-container, mjx-assistive-mml').forEach(e => e.remove());
    c.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
    c.querySelectorAll('div').forEach(dv => { dv.before(main.ownerDocument.createElement('br')); dv.replaceWith(...dv.childNodes); });
    return [...c.childNodes].map(n => main.ownerDocument.importNode(n, true));
  }

  function endEdit(cancel) {
    if (editing < 0) return;
    const b = blocks[editing];
    const r = $('ly-r' + editing);
    const tx = r && r.querySelector('.tx');
    const i = editing;
    editing = -1;
    if (!b || !tx) return;
    tx.contentEditable = 'false';
    const before = vitoolsVtdoc.inlineText(b.el);
    if (!cancel) {
      const nodes = realNodes(tx, editMaths);
      const probe = main.ownerDocument.createElement('p');
      probe.append(...nodes.map(n => n.cloneNode(true)));
      if (vitoolsVtdoc.inlineText(probe) !== before) {
        snap();
        b.el.replaceChildren(...nodes);
        changed();
      }
    }
    rowOf.delete(b.el);
    render();
    cur = i; mark(false);
    $('ly-list').focus();
    tools();
  }

  function editMath(span) {
    const b = blocks[cur];
    if (!b) return;
    const k = +span.dataset.mi;
    const real = editing >= 0 ? editMaths[k] : b.el.querySelectorAll('.vt-math')[[...$('ly-r' + cur).querySelectorAll('.vt-math')].indexOf(span)];
    if (!real) return;
    const tex = prompt('算式的 LaTeX（細修請到 nc 整份算式校對）：', real.dataset.tex || '');
    if (tex == null || tex === real.dataset.tex) return;
    if (editing >= 0) endEdit();
    snap();
    real.dataset.tex = tex;
    real.textContent = '\\(' + tex + '\\)';   // MathML 由 nc 或存檔時重轉
    real.removeAttribute('data-checked');
    changed();
    rowOf.delete(b.el);
    render();
  }

  function split() {
    if (editing < 0) return;
    const b = blocks[editing], tx = $('ly-r' + editing).querySelector('.tx');
    const s = getSelection();
    if (!s.rangeCount || !tx.contains(s.anchorNode)) return;
    const r = s.getRangeAt(0).cloneRange();
    r.collapse(true);
    r.setEnd(tx, tx.childNodes.length);
    const tail = r.extractContents();
    const holder = document.createElement('div');
    holder.appendChild(tail);
    const maths = editMaths;
    const i = editing;
    editing = -1;
    snap();
    b.el.replaceChildren(...realNodes(tx, maths));
    const nt = b.type === 'q' ? 'p' : b.type;
    const el = main.ownerDocument.createElement(TY[nt] && TY[nt].tag || 'p');
    if (TY[nt] && TY[nt].cls) el.className = TY[nt].cls;
    if (DERIVED.has(nt)) el.className = 'vt-' + nt;
    const src = b.type === 'q' && b.sec ? b.sec : b.el;
    ['data-blk', 'data-box', 'lang'].forEach(a => { if (src.hasAttribute(a)) el.setAttribute(a, src.getAttribute(a)); });
    if (b.el.hidden) el.hidden = true;
    const nodes = realNodes(holder, maths);
    el.append(...nodes);
    if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.nodeValue = el.firstChild.nodeValue.replace(/^\s+/, '');
    blocks.splice(i + 1, 0, { el, type: nt });
    if (nt === 'opt') retypeLabel(el);
    build(); changed();
    rowOf.delete(b.el);
    render();
    select(i + 1);
    status('分成兩段了');
  }

  function retypeLabel(el) {
    const m = /^\s*[(（]\s*([A-Za-zＡ-Ｚ甲乙丙丁戊])\s*[)）]/.exec(el.textContent);
    if (m) el.dataset.label = m[1];
  }

  const isText = b => b && (TEXT.has(b.type) || DERIVED.has(b.type));

  // b 的內容接到 p 後面（英數字之間補空白），位置取兩塊的聯集
  function joinInto(p, b) {
    const a = p.el.textContent, z = b.el.textContent;
    if (/[A-Za-z0-9,.;:?!]$/.test(a.trim()) && /^[A-Za-z0-9(]/.test(z.trim())) p.el.appendChild(main.ownerDocument.createTextNode(' '));
    while (b.el.firstChild) p.el.appendChild(b.el.firstChild);
    const pa = boxOf(p), ba = boxOf(b);
    const tgt = p.type === 'q' && p.sec ? p.sec : p.el;
    if (ba && (!pa || pa.page === ba.page)) {
      const u = pa ? [Math.min(pa.x0, ba.x0), Math.min(pa.y0, ba.y0), Math.max(pa.x1, ba.x1), Math.max(pa.y1, ba.y1)] : [ba.x0, ba.y0, ba.x1, ba.y1];
      tgt.dataset.box = ba.page + ' ' + u.map(x => x.toFixed(4)).join(' ');
    }
  }

  // 選了好幾塊：全部併成第一塊；只選一塊：併到上一段
  function merge() {
    const S = selRange();
    endEdit();
    if (S.length > 1) {
      const T = S.filter(i => isText(blocks[i]));
      if (T.length < 2) { status('選到的文字區塊不到兩塊，不能合併'); return; }
      snap();
      const p = blocks[T[0]];
      T.slice(1).forEach(i => joinInto(p, blocks[i]));
      const rm = new Set(T.slice(1));
      blocks = blocks.filter((x, i) => !rm.has(i));
      build(); changed();
      rowOf.delete(p.el);
      render();
      select(T[0]);
      status(T.length + ' 塊併成一段了');
      return;
    }
    const b = blocks[cur];
    if (!isText(b) || cur === 0) return;
    let j = cur - 1;
    while (j >= 0 && blocks[j].type === 'page') j--;
    const p = blocks[j];
    if (!isText(p)) { status('前一塊不是文字，不能合併'); return; }
    snap();
    joinInto(p, b);
    blocks.splice(cur, 1);
    build(); changed();
    rowOf.delete(p.el);
    render();
    select(j);
    status('併到上一段了');
  }

  // ---------- 排順序：在原卷上依閱讀順序點框 ----------
  // 單位：連續、同一個框的幾塊（辨識套件一個區塊拆出的選項）＋表格／附圖後面的文字
  let orderSeq = null;
  function unitAt(i) {
    let a = unitStart(i), z = unitEnd(i);
    const key = x => (blocks[x].type === 'q' && blocks[x].sec ? blocks[x].sec : blocks[x].el).dataset.box || '';
    const k = key(a);
    if (k) {
      while (a > 0 && key(a - 1) === k) a = unitStart(a - 1);
      while (z + 1 < blocks.length && key(z + 1) === k) z = unitEnd(z + 1);
    }
    return [a, z];
  }
  function toggleOrder() {
    endEdit();
    if (orderSeq) {
      orderSeq = null;
      $('ly-order').classList.remove('pri');
      status('排順序結束');
    } else {
      if (!sv.has()) { status('沒有原卷，不能在原卷上排順序；請用 Alt＋↑↓ 搬'); return; }
      orderSeq = [];
      $('ly-order').classList.add('pri');
      snap();
      status('排順序：照閱讀順序在原卷上點這一頁的框；沒點到的排在後面。再按「排順序」或 Esc 結束');
    }
    sv.redraw();
  }
  function orderClick(i) {
    const page = sv.page;
    const head = x => boxOf(blocks[x]);
    const [ua] = unitAt(i);
    const el0 = blocks[ua].el;
    if (orderSeq.includes(el0)) return;
    orderSeq.push(el0);
    // 這一頁的單位（照目前順序）
    const units = [];
    for (let x = 0; x < blocks.length;) {
      const [a, z] = unitAt(x);
      const bx = head(a);
      if (bx && bx.page === page) units.push(blocks.slice(a, z + 1));
      x = z + 1;
    }
    const first = blocks.indexOf(units[0][0]);
    const all = new Set(units.flat());
    const picked = orderSeq.map(e => units.find(u => u[0].el === e)).filter(Boolean);
    const rest = units.filter(u => !picked.includes(u));
    const rem = blocks.filter(b => !all.has(b));
    const before = blocks.slice(0, first).filter(b => !all.has(b)).length;
    rem.splice(before, 0, ...picked.flat(), ...rest.flat());
    blocks = rem;
    build(); changed();
    render();
    cur = anchor = blocks.indexOf(picked[picked.length - 1][0]);
    mark(false);
    status('排順序：已點 ' + orderSeq.length + ' 塊（再按「排順序」或 Esc 結束）');
  }

  // ---------- 套用到所有頁：這一塊的位置，每頁同樣位置的都改成同樣類型（例：頁首都略過） ----------
  function applyAllPages() {
    const b = blocks[cur], src = b && boxOf(b);
    if (!src || !TEXT.has(b.type)) { status('選一塊有位置的文字區塊（例如頁首）再套用到所有頁'); return; }
    const area = x => Math.max(1e-6, (x.x1 - x.x0) * (x.y1 - x.y0));
    const ov = (x, y) => Math.max(0, Math.min(x.x1, y.x1) - Math.max(x.x0, y.x0)) * Math.max(0, Math.min(x.y1, y.y1) - Math.max(x.y0, y.y0));
    const hit = blocks.map((x, i) => i).filter(i => {
      const x = blocks[i], bx = boxOf(x);
      return i !== cur && bx && bx.page !== src.page && TEXT.has(x.type) && x.type !== b.type && ov(bx, src) > 0.5 * area(bx);
    });
    if (!hit.length) { status('其他頁同樣位置沒有要改的區塊'); return; }
    snap();
    hit.forEach(i => retype(blocks[i], b.type));
    build(); changed();
    render();
    status('其他頁同樣位置的 ' + hit.length + ' 塊都改成「' + TY[b.type].name + '」');
  }

  // ---------- 拉框新增區塊 ----------
  let drag = null, bxEdit = null;   // bxEdit：拖曳改既有區塊的框
  function ovPoint(e) {
    const r = $('ly-ov').getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
  }
  // ---------- 本機辨識套件（偵測到才有） ----------
  function hdOn() { return !!(window.vitoolsHaodian && vitoolsHaodian.found); }
  function showHd() {
    const f = hdOn() && vitoolsHaodian.found;
    $('ly-hd').hidden = !f;
    $('ly-hd-find').hidden = !!f;
    if (f) $('ly-hd-name').textContent = '已連上辨識套件 ' + (f.version || '') + '（' + f.base.replace(/^http:\/\//, '').replace(/\/$/, '') + '）';
    // 拉框方式：「文字＋算式」只有連上辨識套件才有；「一個算式」沒辨識套件時用網頁版辨識（mfr-web.js）
    const dm = $('ly-dragmode'), au = dm.querySelector('option[value="auto"]'), tx = dm.querySelector('option[value="text"]');
    const was = au.hidden;
    au.hidden = au.disabled = !f;
    tx.hidden = tx.disabled = !f;
    if (!f && dm.value === 'text') dm.value = 'layer';
    if (f && was) dm.value = 'auto';
    if (!f && dm.value === 'auto') dm.value = 'layer';
    dm.querySelector('option[value="math"]').textContent = '拉框：辨識成一個算式' + (f ? '（辨識套件）' : '（網頁辨識）');
    dm.querySelector('option[value="math"]').hidden = !f && !window.vitoolsMfr;
    dm.hidden = !(sv && sv.has());
    tools();
  }
  // 網頁版辨識一個算式（沒有辨識套件時）：模型第一次用才下載
  async function webMath(page, box) {
    hdBusy = true;
    try {
      const pct = m => Math.round(m.loaded / m.total * 100);
      vitoolsMfr.onprogress = m => {
        if (m.stage === 'download' && !m.local) status('下載算式辨識模型（只有第一次，約 33 MB）… ' + pct(m) + '%');
        else if (m.stage === 'init' || m.stage === 'download') status('載入算式辨識模型…');
      };
      if (!vitoolsMfr.loaded()) status((await vitoolsMfr.cached()) ? '載入算式辨識模型…' : '下載算式辨識模型（只有第一次，約 33 MB）…');
      else status('辨識中…');
      const cv = await sv.cropCanvas(page, box, 2);
      await vitoolsMfr.load();
      status('辨識中…');
      const t0 = performance.now();
      const r = await vitoolsMfr.recognize(cv);
      r.sec = (performance.now() - t0) / 1000;
      return r;
    } finally { hdBusy = false; }
  }
  function findHd() {
    if (!window.vitoolsHaodian) return;
    $('ly-hd-find').disabled = true;
    vitoolsHaodian.detect().then(f => {
      $('ly-hd-find').disabled = false;
      showHd();
      status(f ? '找到本機的 vi-tools 辨識套件，可以重新辨識（R）、拉框辨識' : '沒找到本機的 vi-tools 辨識套件（要先打開辨識套件）');
    });
  }
  let hdBusy = false;
  function hd(page, box, opt) {
    hdBusy = true;
    status('辨識中…（辨識套件第一次辨識要載入模型，大約 20 秒）');
    return sv.regionSource(page, box).then(src => vitoolsHaodian.recognize(src, box, opt))
      .finally(() => { hdBusy = false; });
  }
  // 辨識出來的一行 → 類型：題號開頭＝題目、(A) 開頭＝選項，其他照 dflt
  function lineType(t, dflt) {
    if (/^\s*\d+\s*[.．、]\s*\S/.test(t)) return 'q';
    if (/^\s*[(（]\s*[A-EＡ-Ｅ]\s*[)）]/.test(t)) return 'opt';
    return dflt;
  }
  function mathBlock(page, box, r) {
    const el = main.ownerDocument.createElement('p');
    el.dataset.box = page + ' ' + box.map(x => (+x).toFixed(4)).join(' ');
    const s = main.ownerDocument.createElement('span');
    s.className = 'vt-math';
    s.dataset.tex = r.tex;
    if (r.score != null) s.dataset.conf = r.score.toFixed(2);
    s.textContent = '\\(' + r.tex + '\\)';
    el.appendChild(s);
    return el;
  }
  // 新的元素（類型 t）；題目要包 section
  function newBlock(t, text, boxAttr) {
    const d = TY[t] || TY.p;
    const el = main.ownerDocument.createElement(d.tag);
    if (d.cls) el.className = d.cls;
    setInline(el, text);
    if (t === 'opt') retypeLabel(el);
    const b = { el, type: t };
    if (t === 'q') {
      const sec = main.ownerDocument.createElement('section');
      sec.className = 'vt-q';
      if (boxAttr) sec.dataset.box = boxAttr;
      b.sec = sec;
    } else if (boxAttr) el.dataset.box = boxAttr;
    return b;
  }

  // 重新辨識選到的區塊（R）：內容換成辨識結果；多出來的行（題目拆出來的選項…）加在後面
  async function reocr() {
    if (!hdOn() || hdBusy) return;
    const S = selRange().filter(i => TEXT.has(blocks[i].type) && boxOf(blocks[i]));
    if (!S.length) { status('選有原卷位置的文字區塊，再按重新辨識'); return; }
    const els = S.map(i => blocks[i]);
    if (els.some(b => b.el.querySelector('.vt-math[data-checked="1"]')) &&
        !confirm('選到的區塊裡有 nc 校對過的算式，重新辨識會換掉。確定要重新辨識？')) return;
    endEdit();
    snap();
    let n = 0;
    try {
      const done = new Set();
      for (const b of els) {
        if (done.has(b) || blocks.indexOf(b) < 0) continue;
        const bx = boxOf(b);
        const boxAttr = (b.type === 'q' && b.sec ? b.sec : b.el).dataset.box;
        // 辨識套件的一個區塊在中繼檔裡可能拆成好幾個元素（題目行＋題幹、幾個選項），框一樣：一起換掉
        const blkOf = x => (x.type === 'q' && x.sec ? x.sec : x.el).dataset.blk || '';
        const boxAttrOf = x => (x.type === 'q' && x.sec ? x.sec : x.el).dataset.box || '';
        const grp = blocks.filter(x => TEXT.has(x.type) && boxAttrOf(x) === boxAttr && blkOf(x) === blkOf(b));
        grp.forEach(x => done.add(x));
        const head = grp[0];
        const r = await hd(bx.page, [bx.x0, bx.y0, bx.x1, bx.y1], { type: head.type });
        const lines = r.lines || [];
        if (!lines.length) continue;
        setInline(head.el, lines[0]);
        if (head.type === 'opt') retypeLabel(head.el);
        rowOf.delete(head.el);
        const i = blocks.indexOf(head);
        blocks = blocks.filter(x => x === head || !grp.includes(x));
        const add = lines.slice(1).map(t => newBlock(lineType(t, head.type === 'q' ? 'p' : head.type), t, boxAttr));
        blocks.splice(blocks.indexOf(head) + 1, 0, ...add);
        if (blocks.indexOf(head) !== i) cur = anchor = blocks.indexOf(head);
        n++;
      }
    } catch (e) {
      status('辨識失敗：' + e.message);
      if (!n) { undoStack.pop(); $('ly-undo').disabled = !undoStack.length; return; }
    }
    build(); changed();
    render();
    mark(false);
    status('重新辨識了 ' + n + ' 塊（辨識套件；算式記得到 nc 校對）');
  }

  // 拉框「框成附圖」：裁原卷那一塊當附圖（輸出方式＝標附圖、做觸圖），框裡的字當圖中文字（標籤，觸圖製作放原位）；
  // 框裡原本的短文字區塊（地圖上的地名、甲乙丙…）收進附圖，不再當文字輸出
  async function figFromBox(page, box) {
    if (!sv.has()) { status('沒有原卷，不能框附圖'); return; }
    let cv;
    try { cv = await sv.cropCanvas(page, box, 4, true); } catch (e) { status('裁不出圖：' + e.message); return; }
    const s = Math.min(1, 1400 / Math.max(cv.width, cv.height));
    let out = cv;
    if (s < 1) {
      out = document.createElement('canvas');
      out.width = Math.round(cv.width * s); out.height = Math.round(cv.height * s);
      out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
    }
    const W = box[2] - box[0], H = box[3] - box[1];
    const within = (x0, y0, x1, y1) => x0 >= box[0] - 0.01 && x1 <= box[2] + 0.01 && y0 >= box[1] - 0.01 && y1 <= box[3] + 0.01;
    const px = b => [Math.round(((b[0] + b[2]) / 2 - box[0]) / W * out.width), Math.round(((b[1] + b[3]) / 2 - box[1]) / H * out.height)];
    const labels = (await sv.textIn(page, box)).map(l => ({ text: l.text, xy: px(l.box) }));
    const absorb = blocks.filter(b => {
      if (!['p', 'opt', 'item', 'skip'].includes(b.type) || b.el.querySelector('.vt-math[data-checked="1"]')) return false;
      const x = boxOf(b);
      return x && x.page === page && within(x.x0, x.y0, x.x1, x.y1) && b.el.textContent.trim().length <= 30;
    });
    const has = t => labels.some(l => l.text === t);
    absorb.forEach(b => { const x = boxOf(b), t = b.el.textContent.trim(); if (t && !has(t)) labels.push({ text: t, xy: px([x.x0, x.y0, x.x1, x.y1]) }); });
    const om = ((V.meta && V.meta.omitted) || []).filter(o => o.page === page && within(...o.box));
    om.forEach(o => { const t = (o.text || '').trim(); if (t && !has(t)) labels.push({ text: t, xy: px(o.box) }); });

    snap();
    const D = main.ownerDocument;
    const fig = D.createElement('figure');
    fig.className = 'vt-fig';
    fig.dataset.how = 'mark';
    fig.dataset.tactile = '1';
    const img = D.createElement('img');
    img.src = out.toDataURL('image/jpeg', 0.85);
    img.alt = labels.length ? '圖中文字：' + labels.map(l => l.text).join('、') : '附圖';
    fig.appendChild(img);
    if (labels.length) {
      const ul = D.createElement('ul');
      ul.className = 'vt-labels';
      ul.hidden = true;
      labels.forEach(l => { const li = D.createElement('li'); li.dataset.x = l.xy[0]; li.dataset.y = l.xy[1]; li.textContent = l.text; ul.appendChild(li); });
      fig.appendChild(ul);
    }
    const curB = blocks[cur];
    blocks = blocks.filter(b => !absorb.includes(b));
    om.forEach(o => V.meta.omitted.splice(V.meta.omitted.indexOf(o), 1));
    const ci = curB && !absorb.includes(curB) ? blocks.indexOf(curB) : -1;
    const at = addOne({ page, box, text: '' }, 'p', ci >= 0 ? unitEnd(ci) + 1 : null);
    fig.dataset.box = blocks[at].el.dataset.box;
    blocks[at] = { el: fig, type: 'fig' };
    build(); changed();
    render();
    select(at);
    status('框成附圖（輸出：標(請參閱附圖)、做觸圖）' + (labels.length ? '；圖裡的字 ' + labels.length + ' 個當標籤' : '') +
      (absorb.length ? '；原本 ' + absorb.length + ' 塊文字收進附圖' : '') + '。題幹裡要有「(請參閱附圖)」，沒有的話在題目那行按 E 補上');
  }

  // ---------- 改既有區塊的框、刪除區塊、拖曳排順序 ----------
  const boxAttrOf = x => (x.type === 'q' && x.sec ? x.sec : x.el).dataset.box || '';
  const blkOf = x => (x.type === 'q' && x.sec ? x.sec : x.el).dataset.blk || '';
  // 同一個框的幾個元素（辨識套件一個區塊拆出的題目行＋題幹、幾個選項；表格、附圖後面的文字）
  function boxGroup(b) {
    const a = boxAttrOf(b), k = blkOf(b);
    return a ? blocks.filter(x => x.type !== 'page' && boxAttrOf(x) === a && blkOf(x) === k) : [b];
  }
  let bxPending = null;
  async function applyBox(i, page, nb) {
    const b = blocks[i];
    if (!b) return;
    const ob = boxOf(b);
    const grp = boxGroup(b);
    const attr = page + ' ' + nb.map(x => (+x).toFixed(4)).join(' ');
    snap();
    grp.forEach(x => { (x.type === 'q' && x.sec ? x.sec : x.el).dataset.box = attr; rowOf.delete(x.el); });
    if (b.type === 'fig' && ob) {
      try { await recropFig(b.el, page, [ob.x0, ob.y0, ob.x1, ob.y1], nb); } catch (e) { status('附圖重新裁切失敗：' + e.message); }
    }
    changed();
    render();
    if (TEXT.has(b.type)) {
      bxPending = b;
      $('ly-bx-text').textContent = '框改好了。要照新的框重新讀這一塊的字嗎？（' + (hdOn() ? '用辨識套件' : '讀 PDF 文字層') + '）';
      $('ly-bx').hidden = false;
    } else status(b.type === 'fig' ? '附圖照新的框重新裁切了（框外的圖中文字拿掉）' : '框改好了');
  }
  // 附圖改框：照新框重裁圖，圖中文字（標籤）換算到新圖的座標，框外的拿掉
  async function recropFig(el, page, ob, nb) {
    const img = el.querySelector('img');
    if (!img) return;
    const old = new Image();
    old.src = img.src;
    await (old.decode ? old.decode() : Promise.resolve()).catch(() => {});
    const cv = await sv.cropCanvas(page, nb, 4, true);
    const s = Math.min(1, 1400 / Math.max(cv.width, cv.height));
    let out = cv;
    if (s < 1) {
      out = document.createElement('canvas');
      out.width = Math.round(cv.width * s); out.height = Math.round(cv.height * s);
      out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
    }
    el.querySelectorAll('ul.vt-labels li').forEach(li => {
      if (!old.naturalWidth) return;
      const X = ob[0] + (+li.dataset.x / old.naturalWidth) * (ob[2] - ob[0]), Y = ob[1] + (+li.dataset.y / old.naturalHeight) * (ob[3] - ob[1]);
      if (X < nb[0] || X > nb[2] || Y < nb[1] || Y > nb[3]) { li.remove(); return; }
      li.dataset.x = Math.round((X - nb[0]) / (nb[2] - nb[0]) * out.width);
      li.dataset.y = Math.round((Y - nb[1]) / (nb[3] - nb[1]) * out.height);
    });
    img.src = out.toDataURL('image/jpeg', 0.85);
  }
  // 照框重新讀字：有辨識套件用辨識套件（文字＋算式），沒有就讀 PDF 文字層（一行一行接成段落，題號、選項開頭的另起一段）
  async function rereadBlock(b) {
    const bx = boxOf(b);
    if (!bx || blocks.indexOf(b) < 0) return;
    const grp = boxGroup(b).filter(x => TEXT.has(x.type));
    const head = grp[0] || b;
    const box = [bx.x0, bx.y0, bx.x1, bx.y1];
    let lines;
    try {
      if (hdOn()) lines = (await hd(bx.page, box, { type: head.type })).lines || [];
      else {
        lines = [];
        (await sv.textIn(bx.page, box)).forEach(l => {
          const k = vitoolsVtdocBuild.kindOf(l.text);
          if (lines.length && k === 'p') {
            const last = lines[lines.length - 1];
            lines[lines.length - 1] = last + (/[A-Za-z0-9,.]$/.test(last) && /^[A-Za-z0-9]/.test(l.text) ? ' ' : '') + l.text;
          } else lines.push(...splitOpts(l.text));
        });
      }
    } catch (e) { status('讀字失敗：' + e.message); return; }
    if (!lines.length) { status('新的框裡讀不到字' + (hdOn() ? '' : '（PDF 文字層沒有字；掃描頁要用辨識套件）')); return; }
    snap();
    setInline(head.el, lines[0]);
    if (head.type === 'opt') retypeLabel(head.el);
    rowOf.delete(head.el);
    blocks = blocks.filter(x => x === head || !grp.includes(x));
    const attr = boxAttrOf(head);
    blocks.splice(blocks.indexOf(head) + 1, 0, ...lines.slice(1).map(t => newBlock(lineType(t, head.type === 'q' ? 'p' : head.type), t, attr)));
    cur = anchor = blocks.indexOf(head);
    build(); changed();
    render();
    status('照新的框重新讀了字（' + lines.length + ' 段）' + (hdOn() ? '；算式記得到 nc 校對' : ''));
  }
  // 刪除選到的區塊（真的拿掉；只是不要輸出請用 0 略過）
  function delBlocks() {
    let S = selRange().filter(i => blocks[i].type !== 'page');
    if (!S.length) return;
    endEdit();
    const kill = new Set();
    S.forEach(i => { for (let k = unitStart(i), e = unitEnd(unitStart(i)); k <= e; k++) kill.add(blocks[k]); kill.add(blocks[i]); });
    snap();
    const first = Math.min(...S);
    blocks = blocks.filter(b => !kill.has(b));
    cur = anchor = Math.min(first, blocks.length - 1);
    build(); changed();
    render();
    status('刪除了 ' + kill.size + ' 塊（Ctrl＋Z 復原；只是不要輸出的話用 0 略過）');
  }
  // 題目連同它的選項、題幹、附圖（到下一題、大題、標題、換頁為止）；不是題目就是它自己（表格、附圖連同後面的文字）
  function qEnd(i) {
    if (!blocks[i] || blocks[i].type !== 'q') return unitEnd(i);
    let e = i;
    while (e + 1 < blocks.length && !['q', 'h1', 'h2', 'page'].includes(blocks[e + 1].type)) e++;
    return e;
  }
  // 清單上拖曳一列（或選到的幾列）放到另一列的前面／後面；拖題目會連同它的選項一起搬
  function moveTo(from, to, after) {
    const S = selRange();
    let a, z;
    if (S.includes(from) && S.length > 1) { a = unitStart(S[0]); z = unitEnd(S[S.length - 1]); }
    else { a = unitStart(from); z = qEnd(a); }
    // 放到題目「後面」＝放到那一題（含選項）的後面
    let t = after ? qEnd(unitStart(to)) + 1 : unitStart(to);
    if (t >= a && t <= z + 1) return;
    snap();
    const seg = blocks.splice(a, z - a + 1);
    if (t > z) t -= seg.length;
    blocks.splice(t, 0, ...seg);
    cur = t + Math.max(0, Math.min(seg.length - 1, (S.includes(from) ? cur : from) - a));
    anchor = S.includes(from) && seg.length > 1 ? t : cur;
    if (S.includes(from) && seg.length > 1) cur = t + seg.length - 1;
    build(); changed();
    render();
    status('搬好了（' + seg.length + ' 塊）');
  }

  async function newFromBox(page, box) {
    if ($('ly-dragmode').value === 'fig') return figFromBox(page, box);
    const inside =o => { const cx = (o.box[0] + o.box[2]) / 2, cy = (o.box[1] + o.box[3]) / 2; return cx >= box[0] && cx <= box[2] && cy >= box[1] && cy <= box[3]; };
    let how0 = $('ly-dragmode').value;
    const web = how0 === 'math' && !hdOn();
    if (web && !window.vitoolsMfr) how0 = 'layer';
    if ((how0 === 'auto' || how0 === 'text') && !hdOn()) how0 = 'layer';
    if (how0 === 'math' || how0 === 'auto' || how0 === 'text') {
      // 辨識套件（一個算式，或文字＋算式）；沒有辨識套件時一個算式用網頁版辨識
      if (hdBusy) { status('還在辨識上一塊，請稍等'); return; }
      let r;
      try { r = web ? await webMath(page, box) : await hd(page, box, { mode: how0, type: 'q' }); } catch (e) { status('辨識失敗：' + e.message); return; }
      snap();
      const boxAttr = page + ' ' + box.map(x => (+x).toFixed(4)).join(' ');
      let at = addOne({ page, box, text: '' }, 'p', afterCur());
      if (how0 === 'math') {
        blocks[at] = { el: mathBlock(page, box, r), type: 'p' };
      } else {
        const lines = r.lines && r.lines.length ? r.lines : [''];
        blocks.splice(at, 1, ...lines.map(t => newBlock(lineType(t, 'p'), t, boxAttr)));
        at += lines.length - 1;
      }
      build(); changed();
      render();
      select(at);
      if (how0 === 'text') { status('用辨識套件辨識純文字，新增 ' + (r.lines || []).length + ' 塊' + (r.text_layer ? '（讀 PDF 文字層）' : '') + '；類型不對用數字鍵改'); return; }
      status(how0 === 'math' ? '辨識成一個算式' + (web ? '（網頁辨識 ' + r.sec.toFixed(1) + ' 秒）' : '') + '：' + r.tex +
        (r.score != null ? '（信心 ' + Math.round(r.score * 100) + '%）' : '') + '；記得到 nc 校對' :
        '用辨識套件新增 ' + (r.lines || []).length + ' 塊' + (r.text_layer ? '（中文讀 PDF 文字層、算式用辨識）' : '') + '；類型不對用數字鍵改');
      return;
    }
    const om = ((V.meta && V.meta.omitted) || []).filter(o => o.page === page && inside(o));
    let lines, how;
    if (om.length) { lines = toLines(om); how = '用辨識套件沒輸出的字'; }
    else {
      const t = await sv.textIn(page, box);
      if (t && t.length) { lines = t.map(x => ({ page, box: x.box, text: x.text })); how = '用 PDF 的文字層（算式要再檢查）'; }
      else { lines = [{ page, box, text: '' }]; how = '這裡讀不到字，請按 E 打字'; }
    }
    snap();
    const pos0 = afterCur();
    let last = -1, n = 0;
    lines.forEach(ln => {
      const parts = splitOpts(ln.text);
      parts.forEach((t, k) => {
        last = k === 0 && last < 0 ? addOne({ page, box: ln.box, text: t }, parts.length > 1 ? 'opt' : 'p', pos0)
          : addOne({ page, box: ln.box, text: t }, parts.length > 1 ? 'opt' : 'p', last + 1);
        n++;
      });
    });
    om.forEach(o => V.meta.omitted.splice(V.meta.omitted.indexOf(o), 1));
    build(); changed();
    render();
    select(last);
    status('新增 ' + n + ' 塊（' + how + '）；類型用數字鍵改');
    if (!lines[0].text) startEdit();
  }

  // ---------- 輸出 ----------
  function plainText() { endEdit(); return vitoolsVtdoc.toText(V).text; }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function baseName() { return fname.replace(/\.vtdoc\.html?$/i, '').replace(/\.html?$/i, ''); }
  function saveTxt() { if (V) { download(baseName() + '.txt', plainText(), 'text/plain;charset=utf-8'); status('已存成 ' + baseName() + '.txt'); } }
  function copyText() {
    if (!V) return;
    navigator.clipboard.writeText(plainText()).then(() => status('全部文字已複製到剪貼簿'), () => status('複製失敗，請改用「存成 .txt」'));
  }
  // 跟辨識套件的「送到朗讀與音檔」一樣：開新分頁，等它回 vitools-ready 再送文字與中繼檔
  function sendP2a() {
    if (!V) return;
    const text = plainText();
    const w = window.open('pdf-to-accessible.html#from=layout', '_blank');
    if (!w) { status('瀏覽器擋住了新分頁，請改用「複製全部文字」'); return; }
    const html = serializeNow();
    const t = setTimeout(() => { window.removeEventListener('message', on); status('朗讀與音檔沒有回應，請改用「複製全部文字」'); }, 20000);
    function on(e) {
      if (e.source !== w || !e.data || e.data.type !== 'vitools-ready') return;
      clearTimeout(t);
      window.removeEventListener('message', on);
      w.postMessage({ type: 'haodian-text', name: baseName(), text, formatted: true, vtdoc: html }, location.origin);
      status('已送到朗讀與音檔（新分頁，標成已排版）');
    }
    window.addEventListener('message', on);
    status('打開朗讀與音檔中…');
  }

  function addNew() {
    endEdit();
    snap();
    const el = main.ownerDocument.createElement('p');
    const b = blocks[cur];
    if (b) { const src = b.type === 'q' && b.sec ? b.sec : b.el; if (src.dataset.box) el.dataset.box = src.dataset.box; }
    const at = cur >= 0 ? unitEnd(cur) + 1 : blocks.length;
    blocks.splice(at, 0, { el, type: 'p' });
    build(); changed();
    render();
    select(at);
    startEdit();
  }

  // 刪題：題目內容收進 <template class="vt-dropped">，題目那行改成「N. 「此題型盲生不適合作答」」
  function toggleDrop() {
    const b = blocks[cur];
    if (!b || b.type !== 'q') return;
    endEdit();
    snap();
    const D = main.ownerDocument;
    if (b.sec.hasAttribute('data-drop')) {
      const tpl = b.sec.querySelector(':scope > template.vt-dropped');
      const kids = tpl ? [...tpl.content.children].map(n => D.importNode(n, true)) : [];
      if (tpl) tpl.remove();
      b.sec.removeAttribute('data-drop');
      let first = kids.shift();
      if (first) {
        const h = D.createElement('h3');
        while (first.firstChild) h.appendChild(first.firstChild);
        b.el = h;
      }
      const add = kids.map(k => {
        if (k.tagName === 'P' && !k.className && /^\s*[(（][A-Ea-eＡ-Ｅ][)）]/.test(k.textContent)) { k.className = 'vt-opt'; retypeLabel(k); }
        return { el: k, type: typeOf(k) };
      });
      blocks.splice(cur + 1, 0, ...add);
      status('恢復了這一題');
    } else {
      let e = cur + 1;
      while (e < blocks.length && !['q', 'h1', 'h2'].includes(blocks[e].type)) e++;
      const mem = blocks.splice(cur + 1, e - cur - 1);
      const tpl = D.createElement('template');
      tpl.className = 'vt-dropped';
      tpl.content.appendChild(b.el);
      mem.forEach(m => tpl.content.appendChild(m.el));
      const n = qnum(b.el) || b.sec.dataset.num || '';
      const h = D.createElement('h3');
      h.textContent = (n ? n + '. ' : '') + '「此題型盲生不適合作答」';
      b.el = h;
      b.sec.setAttribute('data-drop', '');
      b.sec.appendChild(tpl);
      status('刪掉這一題了（' + mem.length + ' 塊收進去，按「恢復這一題」可以拿回來）；要改說明文字請按 E');
    }
    build(); changed();
    render();
    mark();
  }

  function setHow(how, force) {
    const b = blocks[cur];
    if (!b || !(b.type === 'table' || b.type === 'fig')) return;
    if ((b.el.dataset.how || '') === how && !force) return;
    endEdit();
    snap();
    const D = main.ownerDocument;
    let e = cur + 1;
    while (e < blocks.length && DERIVED.has(blocks[e].type)) e++;
    const old = blocks.splice(cur + 1, e - cur - 1);
    b.el.dataset.how = how;
    const add = [];
    const mk = (cls, text) => {
      const p = D.createElement('p');
      p.className = cls;
      ['data-blk', 'data-box'].forEach(a => { if (b.el.hasAttribute(a)) p.setAttribute(a, b.el.getAttribute(a)); });
      setInline(p, text);
      add.push({ el: p, type: cls.slice(3) });
    };
    if (b.type === 'table') {
      b.el.hidden = how !== 'table';
      if (how === 'rows' || how === 'cols') {
        const T = window.vitoolsHtmlTable;
        const rs = T.rows(b.el.outerHTML);
        const opts = {};
        if (b.el.dataset.hrow) opts.hrow = b.el.dataset.hrow === '1';
        if (b.el.dataset.hcol) opts.hcol = b.el.dataset.hcol === '1';
        T.toText(rs, how, opts).forEach(l => mk('vt-tbltext', l));
      }
      if (how === 'mark') status('題幹裡要有「(請參閱附表)」，沒有的話請在題目那行按 E 補上');
    } else {
      b.el.hidden = how === 'text' || how === 'none';
      if (how === 'figtext') {
        const li = [...b.el.querySelectorAll('ul.vt-labels li')].map(x => x.textContent.trim()).filter(Boolean);
        const img = b.el.querySelector('img');
        const t = li.length ? '圖中文字：' + li.join(' ') : (img && img.alt) || '圖中文字：';
        mk('vt-figtext', t);
      }
      if (how === 'text') {
        const keep = old.find(x => x.type === 'figdesc');
        if (keep) add.push(keep); else mk('vt-figdesc', '（請輸入文字敘述）');
      }
    }
    blocks.splice(cur + 1, 0, ...add);
    build(); changed();
    rowOf.delete(b.el);
    render();
    if (how === 'text') { select(cur + 1); startEdit(); }
  }

  // ---------- 存檔 ----------
  function save() {
    if (!V) return;
    const html = serializeNow();
    const fn = /\.vtdoc\.html?$/i.test(fname) ? fname : fname.replace(/\.html?$/i, '') + '.vtdoc.html';
    download(fn, html, 'text/html;charset=utf-8');
    dirty = false;
    rowOf = new WeakMap();
    render();
    status('已存回中繼檔 ' + fn + '（' + ops + ' 處修改）');
  }

  function serializeNow() {
    endEdit();
    // 刪題說明：每個大題刪了哪幾題、幾分
    const drops = [];
    let h2 = null, pts = null;
    blocks.forEach(b => {
      if (b.type === 'h2') { h2 = b.el.textContent.trim(); pts = b.el.dataset.points ? +b.el.dataset.points : null; }
      if (b.type === 'q' && b.sec && b.sec.hasAttribute('data-drop')) {
        let d = drops.find(x => x.section === (h2 || ''));
        if (!d) { d = { section: h2 || '', questions: [], points: 0 }; drops.push(d); }
        d.questions.push(+b.sec.dataset.num || b.sec.dataset.num);
        if (pts != null) d.points += pts;
      }
    });
    if (drops.length || V.meta.drops) V.meta.drops = drops;
    // 算式：LaTeX 改過、還沒有 MathML 的用 MathJax 轉
    main.querySelectorAll('.vt-math').forEach(s => {
      if (s.querySelector('math') || !(window.MathJax && MathJax.tex2mml)) return;
      try { s.innerHTML = MathJax.tex2mml(s.dataset.tex || '', { display: s.classList.contains('vt-display') }); } catch (e) { /* 留 \( \) */ }
    });
    // MathML 換掉了 \( \)：清單上的列要重畫
    rowOf = new WeakMap();
    return vitoolsVtdoc.serialize(V, '版面整理', '版面整理 ' + ops + ' 處');
  }

  // ---------- 開原始文件（PDF、圖檔、Word、.txt）→ 中繼檔 ----------
  // PDF、圖檔：連上辨識套件時問要不要整份辨識（文字＋算式）；沒有就在網頁裡讀 PDF 文字層／只放原卷（vtdoc-build.js）
  let dlgAbort = null, dlgFiles = null;
  function openFiles(fl) {
    const files = [...fl];
    const k = vitoolsVtdocBuild.kind(files[0]);
    if (k === 'vtdoc') { files[0].text().then(t => load(t, files[0].name)); return; }
    const ocrable = (k === 'pdf' && files.length === 1) || (k === 'image' && files.length === 1);
    if (ocrable && hdOn() && vitoolsHaodian.found.doc) { askOpen(files, k); return; }
    buildLocal(files);
  }
  function askOpen(files, k) {
    dlgFiles = files;
    $('ly-dlg-name').textContent = files[0].name;
    $('ly-dlg-ask').hidden = false; $('ly-dlg-run').hidden = true;
    $('ly-dlg-local').textContent = k === 'pdf' ? '只讀 PDF 文字層（很快，不辨識算式，掃描頁沒有字）' : '只放原卷（不辨識，自己在原卷上拉框）';
    $('ly-dlg-pages-w').hidden = k !== 'pdf';
    $('ly-dlg').showModal();
    $('ly-dlg-hd').focus();
  }
  async function buildLocal(files) {
    status('讀檔中…');
    try {
      const r = await vitoolsVtdocBuild.fromFiles(files, { onProgress: status });
      let note = '已開啟「' + files[0].name + '」：' + r.note;
      if ((r.scanned && r.scanned.length) || r.images) note += hdOn() ? '' : '（打開 vi-tools 辨識套件可以辨識文字與算式）';
      load(r.html, r.name, note);
    } catch (e) { status('開不了：' + e.message); alert('開不了「' + files[0].name + '」：' + e.message); }
  }
  async function runHd() {
    const files = dlgFiles, pages = $('ly-dlg-pages').value.trim();
    $('ly-dlg-ask').hidden = true; $('ly-dlg-run').hidden = false;
    $('ly-dlg-stop').disabled = false;
    $('ly-dlg-stop').focus();
    dlgAbort = new AbortController();
    let lastDone = -1;
    const prog = $('ly-dlg-prog'), bar = $('ly-dlg-bar');
    prog.textContent = '送到辨識套件…（第一次辨識要載入模型，大約 20 秒）';
    try {
      const html = await vitoolsHaodian.doc(files[0], { pages, signal: dlgAbort.signal, onProgress: st => {
        if (st.total) { bar.max = st.total; bar.value = st.done; }
        if (st.done === lastDone) return;   // 換頁時才更新文字，報讀軟體不會一直念
        lastDone = st.done;
        prog.textContent = st.total ? '辨識中：做完 ' + st.done + '／' + st.total + ' 頁' + (st.eta ? '，大約還要 ' + Math.ceil(st.eta / 60) + ' 分鐘' : '') +
          (st.stopping ? '（停止中，做完這頁就停）' : '') : '辨識中…';
      } });
      const stopped = dlgAbort.signal.aborted;
      dlgAbort = null;
      $('ly-dlg').close();
      load(html, files[0].name.replace(/\.[^.]+$/, '') + '.vtdoc.html',
        '已用辨識套件辨識「' + files[0].name + '」' + (stopped ? '（停止了，只有做完的頁）' : '') + '，算式記得到 nc 整份算式校對檢查');
    } catch (e) {
      dlgAbort = null;
      $('ly-dlg').close();
      status('辨識失敗：' + e.message);
      alert('辨識失敗：' + e.message);
    }
  }
  function initOpenDialog() {
    const d = $('ly-dlg');
    $('ly-dlg-hd').addEventListener('click', runHd);
    $('ly-dlg-local').addEventListener('click', () => { d.close(); buildLocal(dlgFiles); });
    $('ly-dlg-cancel').addEventListener('click', () => d.close());
    $('ly-dlg-stop').addEventListener('click', () => {
      if (!dlgAbort) return;
      dlgAbort.abort();
      $('ly-dlg-stop').disabled = true;
      $('ly-dlg-prog').textContent += '（停止中，做完這頁就停）';
    });
    d.addEventListener('cancel', e => { if (dlgAbort) e.preventDefault(); });   // 辨識中按 Esc 不關
  }

  // ---------- 事件 ----------
  function init() {
    sv = vitoolsVtdocView.create({ scroll: $('ly-scroll'), host: $('ly-page'), overlay: $('ly-ov'), fit: $('ly-fit'), label: $('ly-pg') });
    sv.draw = drawBoxes;
    $('ly-open').addEventListener('click', () => {
      if (dirty && !confirm('還沒存回中繼檔，確定要開別的檔？')) return;
      $('ly-file').value = ''; $('ly-file').click();
    });
    $('ly-file').addEventListener('change', e => { if (e.target.files.length) openFiles(e.target.files); });
    initOpenDialog();
    $('ly-save').addEventListener('click', save);
    $('ly-undo').addEventListener('click', undo);
    $('ly-type').addEventListener('change', e => setType(e.target.value));
    $('ly-up').addEventListener('click', () => move(-1));
    $('ly-down').addEventListener('click', () => move(1));
    $('ly-edit').addEventListener('click', startEdit);
    $('ly-split').addEventListener('mousedown', e => e.preventDefault());   // 不要讓編輯區失去游標
    $('ly-split').addEventListener('click', split);
    $('ly-merge').addEventListener('click', merge);
    $('ly-new').addEventListener('click', addNew);
    $('ly-drop').addEventListener('click', toggleDrop);
    $('ly-grp').addEventListener('click', toggleGroup);
    $('ly-how').addEventListener('change', e => setHow(e.target.value));
    $('ly-tac').addEventListener('change', e => {
      const b = blocks[cur]; if (!b) return;
      snap();
      if (e.target.checked) b.el.dataset.tactile = '1'; else delete b.el.dataset.tactile;
      changed(); rowOf.delete(b.el); render();
    });
    $('ly-del').addEventListener('click', delBlocks);
    $('ly-bx-read').addEventListener('click', () => { const b = bxPending; bxPending = null; $('ly-bx').hidden = true; if (b) rereadBlock(b); });
    $('ly-bx-close').addEventListener('click', () => { bxPending = null; $('ly-bx').hidden = true; });
    // 右邊清單拖曳排順序
    const lst = $('ly-list');
    let dragFrom = -1;
    const clearDrop = () => lst.querySelectorAll('.dropb,.dropa').forEach(r => r.classList.remove('dropb', 'dropa'));
    lst.addEventListener('dragstart', e => {
      const r = e.target.closest && e.target.closest('.row');
      if (!r || editing >= 0) { e.preventDefault(); return; }
      dragFrom = +r.dataset.i;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
    });
    lst.addEventListener('dragover', e => {
      const r = e.target.closest && e.target.closest('.row');
      if (dragFrom < 0 || !r) return;
      e.preventDefault();
      const after = e.clientY > r.getBoundingClientRect().top + r.offsetHeight / 2;
      clearDrop();
      r.classList.add(after ? 'dropa' : 'dropb');
    });
    lst.addEventListener('dragleave', e => { if (!lst.contains(e.relatedTarget)) clearDrop(); });
    lst.addEventListener('drop', e => {
      const r = e.target.closest && e.target.closest('.row');
      clearDrop();
      if (dragFrom < 0 || !r) return;
      e.preventDefault();
      const after = e.clientY > r.getBoundingClientRect().top + r.offsetHeight / 2;
      const f = dragFrom;
      dragFrom = -1;
      moveTo(f, +r.dataset.i, after);
    });
    lst.addEventListener('dragend', () => { dragFrom = -1; clearDrop(); });
    $('ly-om-add').addEventListener('click', () => addOmitted(false));
    $('ly-om-all').addEventListener('click', () => addOmitted(true));
    $('ly-om-close').addEventListener('click', () => { omSel = null; $('ly-om').hidden = true; sv.redraw(); });
    $('ly-pprev').addEventListener('click', () => sv.show(sv.page - 1));
    $('ly-pnext').addEventListener('click', () => sv.show(sv.page + 1));
    $('ly-zin').addEventListener('click', () => sv.zoom(1));
    $('ly-zout').addEventListener('click', () => sv.zoom(-1));
    $('ly-onum').addEventListener('change', () => sv.redraw());

    $('ly-order').addEventListener('click', toggleOrder);
    $('ly-reocr').addEventListener('click', reocr);
    $('ly-hd-find').addEventListener('click', findHd);
    if (window.vitoolsHaodian) vitoolsHaodian.detect().then(showHd);
    $('ly-allpages').addEventListener('click', applyAllPages);
    $('ly-txt').addEventListener('click', saveTxt);
    $('ly-copy').addEventListener('click', copyText);
    $('ly-send').addEventListener('click', sendP2a);
    ['ly-hrow', 'ly-hcol'].forEach(id => $(id).addEventListener('change', e => {
      const b = blocks[cur]; if (!b || b.type !== 'table') return;
      const k = id === 'ly-hrow' ? 'hrow' : 'hcol';
      snap();
      if (e.target.value === '') delete b.el.dataset[k]; else b.el.dataset[k] = e.target.value;
      undoStack.pop();   // setHow 會自己存一步
      setHow(b.el.dataset.how || 'table', true);
    }));

    // 原卷空白處拖曳＝新增區塊
    const ov = $('ly-ov');
    ov.addEventListener('mousedown', e => {
      if (e.button === 0 && e.target.classList && e.target.classList.contains('del')) { e.preventDefault(); e.stopPropagation(); delBlocks(); $('ly-list').focus({ preventScroll: true }); return; }
      const cb = e.button === 0 && !orderSeq && e.target.closest && e.target.closest('.vtv-bx.cur');
      if (cb && cb.dataset.i != null) {   // 選到的框：拖控制點改大小、拖中間搬位置
        const bx = boxOf(blocks[+cb.dataset.i]);
        if (bx) {
          e.preventDefault();
          bxEdit = { i: +cb.dataset.i, h: e.target.dataset.h || 'move', p: ovPoint(e), b0: [bx.x0, bx.y0, bx.x1, bx.y1], nb: null, d: cb, page: bx.page };
          return;
        }
      }
      if (e.button !== 0 || e.target !== ov || !V || orderSeq) return;
      e.preventDefault();
      const p = ovPoint(e);
      const d = sv.boxDiv([p[0], p[1], p[0], p[1]], 'drag');
      ov.appendChild(d);
      drag = { p, d, q: p };
    });
    window.addEventListener('mousemove', e => {
      if (bxEdit) {
        const q = ovPoint(e), dx = q[0] - bxEdit.p[0], dy = q[1] - bxEdit.p[1], h = bxEdit.h;
        if (!bxEdit.nb && Math.abs(dx) + Math.abs(dy) < 0.004) return;
        const b = bxEdit.b0.slice();
        if (h === 'move') { b[0] += dx; b[2] += dx; b[1] += dy; b[3] += dy; }
        else {
          if (h.includes('w')) b[0] += dx;
          if (h.includes('e')) b[2] += dx;
          if (h.includes('n')) b[1] += dy;
          if (h.includes('s')) b[3] += dy;
        }
        const nb = [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])].map(v => Math.max(0, Math.min(1, v)));
        bxEdit.nb = nb;
        Object.assign(bxEdit.d.style, { left: nb[0] * 100 + '%', top: nb[1] * 100 + '%', width: (nb[2] - nb[0]) * 100 + '%', height: (nb[3] - nb[1]) * 100 + '%' });
        return;
      }
      if (!drag) return;
      drag.q = ovPoint(e);
      const [a, b] = [drag.p, drag.q];
      Object.assign(drag.d.style, { left: Math.min(a[0], b[0]) * 100 + '%', top: Math.min(a[1], b[1]) * 100 + '%',
        width: Math.abs(a[0] - b[0]) * 100 + '%', height: Math.abs(a[1] - b[1]) * 100 + '%' });
    });
    window.addEventListener('mouseup', () => {
      if (bxEdit) {
        const x = bxEdit;
        bxEdit = null;
        if (x.nb && x.nb[2] - x.nb[0] > 0.005 && x.nb[3] - x.nb[1] > 0.004) applyBox(x.i, x.page, x.nb);
        else if (x.nb) sv.redraw();
        return;
      }
      if (!drag) return;
      const [a, b] = [drag.p, drag.q];
      drag.d.remove();
      drag = null;
      const box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
      if (box[2] - box[0] < 0.01 || box[3] - box[1] < 0.005) return;
      newFromBox(sv.page, box);
    });

    ov.addEventListener('click', e => {
      if (!ov.contains(e.target) || e.target.classList.contains('del')) return;   // 剛按了 ✕（框已經重畫）
      const d = e.target.closest('.vtv-bx');
      if (!d) return;
      if (orderSeq) { if (d.dataset.i != null) orderClick(+d.dataset.i); return; }
      if (d.dataset.om != null) showOmitted(+d.dataset.om);
      else if (d.dataset.i != null) { select(+d.dataset.i, e.shiftKey, false); $('ly-list').focus({ preventScroll: true }); const r = $('ly-r' + cur); if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    });

    const list = $('ly-list');
    list.addEventListener('click', e => {
      const m = e.target.closest('.vt-math');
      const r = e.target.closest('.row');
      if (!r) return;
      const i = +r.dataset.i;
      if (editing === i) return;
      select(i, e.shiftKey);
      list.focus();
    });
    list.addEventListener('dblclick', e => {
      const m = e.target.closest('.vt-math');
      const r = e.target.closest('.row');
      if (!r) return;
      if (m) { cur = +r.dataset.i; editMath(m); return; }
      if (editing < 0) { select(+r.dataset.i); startEdit(); }
    });
    list.addEventListener('keydown', e => {
      if (editing >= 0) {
        if (e.key === 'Escape') { e.preventDefault(); endEdit(); }
        else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); split(); }
        else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); }
        else if (e.key === 'Enter') { e.preventDefault(); endEdit(); }
        return;
      }
      if (!V) return;
      const k = e.key;
      if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); move(k === 'ArrowUp' ? -1 : 1); return; }
      if (e.ctrlKey && (k === 'z' || k === 'Z')) { e.preventDefault(); undo(); return; }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); select(Math.max(0, Math.min(blocks.length - 1, cur + (k === 'ArrowDown' ? 1 : -1))), e.shiftKey); return; }
      if (k === 'Home' || k === 'End') { e.preventDefault(); select(k === 'Home' ? 0 : blocks.length - 1, e.shiftKey); return; }
      if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); sv.show(sv.page + (k === 'PageDown' ? 1 : -1)); return; }
      const ty = Object.keys(TY).find(t => TY[t].key === k);
      if (ty) { e.preventDefault(); setType(ty); return; }
      if (k === 'Delete') { e.preventDefault(); delBlocks(); return; }
      if (k === 'e' || k === 'E' || k === 'Enter') { e.preventDefault(); startEdit(); return; }
      if (k === 'g' || k === 'G') { e.preventDefault(); merge(); return; }
      if (k === 'n' || k === 'N') { e.preventDefault(); addNew(); return; }
      if (k === 'd' || k === 'D') { e.preventDefault(); toggleDrop(); return; }
      if (k === 't' || k === 'T') { e.preventDefault(); toggleGroup(); return; }
      if (k === 'o' || k === 'O') { e.preventDefault(); toggleOrder(); return; }
      if ((k === 'r' || k === 'R') && hdOn()) { e.preventDefault(); reocr(); return; }
      if (k === 'Escape' && orderSeq) { e.preventDefault(); toggleOrder(); return; }
    });
    // 編輯中的算式點兩下
    list.addEventListener('focusout', e => {
      if (editing < 0) return;
      const tx = $('ly-r' + editing) && $('ly-r' + editing).querySelector('.tx');
      setTimeout(() => {
        if (editing >= 0 && tx && !tx.contains(document.activeElement) && document.activeElement !== $('ly-split')) endEdit();
      }, 0);
    });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
      // 焦點不在清單（例：剛點了原卷上的框）也可以按 Delete 刪選到的區塊
      const t = e.target;
      if (e.key === 'Delete' && V && editing < 0 && !$('ly-list').contains(t) && !(t.closest && t.closest('input,textarea,select,[contenteditable="true"],dialog'))) { e.preventDefault(); delBlocks(); }
    });
    window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  init();
  window.vtLayout = { load, isDirty: () => dirty, blocks: () => blocks, meta: () => V && V.meta };
})();
