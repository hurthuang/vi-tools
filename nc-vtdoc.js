// nc「整份算式校對」：開 vi-tools 中繼檔（.vtdoc.html），左邊原卷、右邊整份文字對照，一個一個算式校對，
// 改好存回中繼檔。規格：docs/notes/vtdoc.md 第 3.4、3.9、5 節。用到 nemeth_converter.html 的 latexToNemethAsc、
// asc2brl、esc、數學編輯器（_meTarget），shared.js 的 loadScript（pdf.js），以及 vtdoc.js。
(function () {
  'use strict';
  var V = null, name = '', items = [], warns = [], cur = -1, curW = -1, dirty = false;
  var SRC = null, pdf = null, page = 0, nPages = 0, zoom = 2, renderTok = 0, blkSel = null, aspect = {};
  var c2o = new WeakMap();   // 文字欄的元素 → 中繼檔裡的元素
  var blkEl = null;          // 文字欄點到的那一段（中繼檔裡的元素），「改這段文字」用
  var BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,td,th,caption,figcaption,dt,dd';
  var LOW = 0.9;   // 信心低於這個的標紅
  // 會改到整頁 MathJax 的指令（辨識錯出來的 \newcommand 之類）：不畫、不轉 MathML
  var UNSAFE = /\\(?:re)?newcommand|\\def(?![a-z])|\\let(?![a-z])|\\newenvironment|\\require/;
  // 算式以外的文字裡像算式的寫法（漏框）
  var SUSPECT = [
    [/(?<![A-Za-z])[a-z]\d(?![\d.])/, '字母後面直接接數字（可能是上標掉了，例如 x2）'],
    [/\d\s*[+\-×÷=<>≤≥≠]\s*[\d(]/, '數字的運算'],
    [/[√π∠△⊥∥≅∼°∞∑∫²³]/, '數學符號'],
    [/(?<![\d/])\d+\s*\/\s*\d+(?![\d/])/, '分數寫成 a/b'],
    [/(?<![A-Za-z])[a-zA-Z]\s*[=<>≤≥]\s*[-\d(a-zA-Z]/, '有字母的等式或不等式']
  ];
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  function $(id) { return document.getElementById(id); }
  function mathSrc(tex) { return UNSAFE.test(tex) ? '<code class="vtm-bad">' + esc(tex) + '</code>' : '\\(' + esc(tex) + '\\)'; }
  function live() { return items.filter(function (x) { return !x.gone; }); }
  function done(x) { return x.checked || x.tex !== x.tex0 || x.added; }

  // LaTeX 有錯（MathJax 畫不出來、轉不出點字）：信心再高也一定要看
  function texErr(tex) {
    if (UNSAFE.test(tex)) return '有 \\newcommand 之類的指令';
    var d = 0;
    for (var i = 0; i < tex.length; i++) {
      var c = tex[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') d++; else if (c === '}' && --d < 0) return '大括號沒配對';
    }
    if (d) return '大括號沒配對';
    var env = [], re = /\\(begin|end)\s*\{([^}]*)\}/g, m;
    while ((m = re.exec(tex))) {
      if (m[1] === 'begin') env.push(m[2]);
      else if (env.pop() !== m[2]) return '\\begin／\\end 沒配對';
    }
    if (env.length) return '\\begin／\\end 沒配對';
    if (window.MathJax && MathJax.tex2mml) {
      try {
        var mm = MathJax.tex2mml(tex);
        if (/<merror/.test(mm)) {
          var t = /<mtext[^>]*>([^<]*)<\/mtext>/.exec(mm);
          return 'MathJax 畫不出來' + (t ? '（' + t[1] + '）' : '');
        }
      } catch (e) { return 'MathJax 畫不出來（' + e.message + '）'; }
    }
    try { latexToNemethAsc(tex); } catch (e) { return '轉不出點字'; }
    return '';
  }
  function checkErr(it) { it.err = texErr(it.tex); return it.err; }

  function typeset(el) {
    if (window.MathJax && MathJax.typesetPromise) {
      if (MathJax.typesetClear) MathJax.typesetClear([el]);
      return MathJax.typesetPromise([el]).catch(function () {});
    }
    return Promise.resolve();
  }

  function hiddenUp(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) if (e.hasAttribute('hidden')) return true;
    return false;
  }

  // ---------- 開檔 ----------
  function newItem(el) {
    var tex = el.dataset.tex || el.textContent.replace(/^\\\(|\\\)$/g, '');
    var conf = el.dataset.conf != null && el.dataset.conf !== '' ? parseFloat(el.dataset.conf) : null;
    var q = el.closest('section.vt-q');
    return { el: el, tex0: tex, tex: tex, conf: conf, crop: el.dataset.crop || '', checked: el.dataset.checked === '1',
      brl: el.dataset.brl || null, brlsrc: el.dataset.brlsrc || '',
      hidden: hiddenUp(el), box: vitoolsVtdoc.box(el) || vitoolsVtdoc.box(el.closest('[data-box]')),
      own: !!vitoolsVtdoc.box(el), where: q && q.dataset.num ? '第 ' + q.dataset.num + ' 題' : '' };
  }

  function load(html, fname) {
    var v = vitoolsVtdoc.parse(html);
    if (!v) { alert('這個檔案不是 vi-tools 中繼檔（.vtdoc.html）'); return; }
    V = v; name = fname; dirty = false; blkSel = null; blkEl = null; aspect = {};
    items = [];
    var main = v.doc.querySelector('main') || v.doc.body;
    // 辨識的算式中間夾中文（2⅓ 是 4⅑）拆開、被原卷斷行切開的後半（<7）收回來；改了要存回才會留下
    var fx = vitoolsVtdoc.splitMathEls(main);
    main.querySelectorAll('.vt-math').forEach(function (el) {
      if (el.closest('template')) return;
      items.push(newItem(el));
    });
    items.forEach(function (it, i) { it.n = i + 1; checkErr(it); });
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
      var vv = V;
      MathJax.startup.promise.then(function () {
        if (V !== vv) return;
        items.forEach(checkErr);
        renderList();
        if (cur >= 0) select(cur);
      });
    }
    $('vtm-name').textContent = fname + '（' + (vitoolsVtdoc.title(v) || '') + '）';
    var fixMsg = '';
    if (fx.split || fx.joined) {
      dirty = true;
      fixMsg = ('開檔時自動整理了算式：' + (fx.split ? fx.split + ' 個中間夾中文的拆開（中文移到算式外）' : '') +
        (fx.split && fx.joined ? '、' : '') + (fx.joined ? fx.joined + ' 個被斷行切開的後半收回算式' : '') + '；請檢查，存回中繼檔才會留下');
    }
    $('vtm-save').disabled = false;
    cur = -1; curW = -1;
    renderDoc();
    findWarns();
    renderList();
    openSource().then(function () {
      if (fixMsg) status(fixMsg);
      if (warns.length) selectWarn(0);
      else {
        var first = order()[0];
        if (first != null) select(first); else { $('vtm-edit').hidden = true; if (nPages) showPage(1); }
      }
    });
    $('vtm-list').focus();
  }

  // ---------- 要檢查的地方 ----------
  function findWarns() {
    warns = [];
    var om = (V.meta && V.meta.omitted) || [];
    // 沒被收進任何區塊的字（手動刪框、縮框之後）：每頁一筆
    var byPage = {};
    om.forEach(function (o) { if (o.kind === 'uncovered') (byPage[o.page] = byPage[o.page] || []).push(o); });
    Object.keys(byPage).sort(function (a, b) { return a - b; }).forEach(function (p) {
      var os = byPage[p];
      warns.push({ kind: 'uncovered', page: +p, boxes: os.map(function (o) { return o.box; }),
        label: '第 ' + p + ' 頁有 ' + os.length + ' 處字沒被收進任何區塊（沒輸出）',
        text: os.map(function (o) { return o.text; }).join('　') });
    });
    // 略過的區塊：頁首頁尾（上下 8%）、很短的不提醒
    om.forEach(function (o) {
      if (o.kind !== 'skip') return;
      var t = (o.text || '').replace(/\s/g, '');
      if (o.box[3] < 0.08 || o.box[1] > 0.92 || t.length < 10) return;
      warns.push({ kind: 'skip', page: o.page, boxes: [o.box], label: '第 ' + o.page + ' 頁有一塊設成「略過」（沒輸出）：' + t.slice(0, 20) + (t.length > 20 ? '…' : ''),
        text: o.text });
    });
    // 算式後面緊接一個單獨的數字：常是原卷的次方被辨識成文字（(999+1) 2 → (999+1)^{2}）
    var main = V.doc.querySelector('main') || V.doc.body;
    main.querySelectorAll('.vt-math').forEach(function (s) {
      if (s.closest('template') || hiddenUp(s)) return;
      var nx = s.nextSibling, tex = (s.dataset.tex || '').trim();
      if (!nx || nx.nodeType !== 3 || !/[)\]}]$/.test(tex)) return;
      var m = /^ ?([1-9])(?![\d.,A-Za-z])/.exec(nx.nodeValue);
      if (!m) return;
      var el = s.closest(BLOCKS) || s.parentElement;
      var b = vitoolsVtdoc.box(s) || vitoolsVtdoc.box(s.closest('[data-box]'));
      warns.push({ kind: 'exp', el: el, page: b ? b.page : 0, boxes: b ? [[b.x0, b.y0, b.x1, b.y1]] : [],
        label: '可能漏掉的次方：' + (tex.length > 24 ? '…' + tex.slice(-24) : tex) + ' 後面的「' + m[1] + '」',
        text: '\\(' + tex + '\\) ' + m[1] });
    });
    // 文字裡像算式的寫法
    main.querySelectorAll('h1,h2,h3,p,td,th,caption').forEach(function (el) {
      if (el.closest('template') || hiddenUp(el)) return;
      var t = '';
      el.childNodes.forEach(function (n) {
        if (n.nodeType === 3) t += n.nodeValue;
        else if (n.nodeType === 1 && !n.classList.contains('vt-math')) t += n.textContent;
        else t += ' ';
      });
      t = t.replace(/^\s*\d+\.\s*/, '').replace(/[(（][A-EＡ-Ｅ][)）]/g, ' ');
      for (var k = 0; k < SUSPECT.length; k++) {
        var m = t.match(SUSPECT[k][0]);
        if (m) {
          var b = vitoolsVtdoc.box(el) || vitoolsVtdoc.box(el.closest('[data-box]'));
          var s = Math.max(0, m.index - 8);
          warns.push({ kind: 'suspect', el: el, page: b ? b.page : 0, boxes: b ? [[b.x0, b.y0, b.x1, b.y1]] : [],
            label: '可能漏掉的算式（' + SUSPECT[k][1] + '）：…' + t.slice(s, m.index + m[0].length + 8).trim() + '…',
            text: '「' + m[0] + '」' });
          break;
        }
      }
    });
  }

  // ---------- 原卷 ----------
  function openSource() {
    SRC = vitoolsVtdoc.source(V);
    pdf = null; page = 0; nPages = 0;
    $('vtm-page-box').hidden = !SRC;
    $('vtm-nosrc').hidden = !!SRC;
    $('vtm-page-tools').hidden = !SRC;
    if (!SRC) return Promise.resolve();
    if (SRC.kind === 'pages') { nPages = Math.max.apply(null, Object.keys(SRC.pages).map(Number)); return Promise.resolve(); }
    status('載入原卷中…');
    var ready = window.pdfjsLib ? Promise.resolve() : loadScript(PDFJS + 'pdf.min.js').then(function () {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    });
    return ready.then(function () { return pdfjsLib.getDocument({ data: SRC.data.slice() }).promise; }).then(function (d) {
      pdf = d;
      nPages = SRC.pageMap ? SRC.pageMap.length : d.numPages;
      status('');
    }).catch(function (e) {
      SRC = null;
      $('vtm-page-box').hidden = true; $('vtm-nosrc').hidden = false; $('vtm-page-tools').hidden = true;
      status('原卷打不開（' + e.message + '），只用算式的裁圖對照');
    });
  }

  // 顯示方式：整頁（整頁看得完）、合寬、放大
  function hostWidth(asp) {
    var sc = $('vtm-page-scroll'), mode = $('vtm-fit').value;
    var W = sc.clientWidth - 2, H = sc.clientHeight - 2;
    if (mode === 'page') return Math.min(W, H / (asp || 1.414));
    if (mode === 'zoom') return W * zoom;
    return W;
  }

  function pageAspect(p) {
    if (aspect[p]) return Promise.resolve(aspect[p]);
    if (SRC.kind === 'pages') {
      var im = new Image();
      im.src = SRC.pages[p] || '';
      return (im.decode ? im.decode() : Promise.resolve()).catch(function () {}).then(function () {
        return (aspect[p] = im.naturalWidth ? im.naturalHeight / im.naturalWidth : 1.414);
      });
    }
    return pdf.getPage(SRC.pageMap ? SRC.pageMap[p - 1] : p).then(function (pg) {
      var vp = pg.getViewport({ scale: 1 });
      return (aspect[p] = vp.height / vp.width);
    });
  }

  function showPage(p, force) {
    if (!SRC || p < 1 || p > nPages) return Promise.resolve();
    var host = $('vtm-page');
    return pageAspect(p).then(function (asp) {
      var w = Math.round(hostWidth(asp));
      var key = p + '/' + w;
      page = p;
      $('vtm-pg').textContent = '第 ' + p + ' 頁／共 ' + nPages + ' 頁';
      if (!force && host.dataset.key === key) { drawBoxes(); return; }
      host.dataset.key = key;
      host.style.width = w + 'px';
      var tok = ++renderTok;
      var made;
      if (SRC.kind === 'pages') {
        var img = document.createElement('img');
        img.alt = '原卷第 ' + p + ' 頁';
        img.src = SRC.pages[p] || '';
        made = Promise.resolve(img);
      } else {
        made = pdf.getPage(SRC.pageMap ? SRC.pageMap[p - 1] : p).then(function (pg) {
          var vp1 = pg.getViewport({ scale: 1 });
          var vp = pg.getViewport({ scale: Math.max(0.5, w * (window.devicePixelRatio || 1) / vp1.width) });
          var cv = document.createElement('canvas');
          cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
          cv.setAttribute('role', 'img');
          cv.setAttribute('aria-label', '原卷第 ' + p + ' 頁');
          return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(function () { return cv; });
        });
      }
      return made.then(function (el) {
        if (tok !== renderTok) return;
        el.className = 'vtm-sheet';
        var old = host.querySelector('.vtm-sheet');
        if (old) host.replaceChild(el, old); else host.insertBefore(el, host.firstChild);
        drawBoxes();
      });
    });
  }

  function boxDiv(b, cls, title) {
    var d = document.createElement('div');
    d.className = 'vtm-bx ' + cls;
    if (Array.isArray(b)) b = { x0: b[0], y0: b[1], x1: b[2], y1: b[3] };
    d.style.left = (b.x0 * 100) + '%';
    d.style.top = (b.y0 * 100) + '%';
    d.style.width = ((b.x1 - b.x0) * 100) + '%';
    d.style.height = ((b.y1 - b.y0) * 100) + '%';
    if (title) d.title = title;
    return d;
  }

  // 這一頁的框
  function drawBoxes() {
    var ov = $('vtm-ov');
    ov.innerHTML = '';
    if (!V) return;
    var om = (V.meta && V.meta.omitted) || [];
    if ($('vtm-all').checked) {
      // 全部區塊：淡灰框（不輸出的用虛線）、略過的灰斜線
      (V.doc.querySelector('main') || V.doc.body).querySelectorAll('[data-box]').forEach(function (e) {
        if (e.classList.contains('vt-math') || e.closest('template')) return;
        var b = vitoolsVtdoc.box(e);
        if (b && b.page === page) ov.appendChild(boxDiv(b, 'area' + (hiddenUp(e) ? ' hid' : ''), hiddenUp(e) ? '不輸出的區塊' : '區塊'));
      });
      om.forEach(function (o) { if (o.kind === 'skip' && o.page === page) ov.appendChild(boxDiv(o.box, 'skip', '略過（沒輸出）：' + o.text)); });
    }
    // 沒收進區塊的字：一律標紅斜線
    om.forEach(function (o) { if (o.kind === 'uncovered' && o.page === page) ov.appendChild(boxDiv(o.box, 'unc', '沒被收進任何區塊（沒輸出）：' + o.text)); });
    if (blkSel && blkSel.page === page) ov.appendChild(boxDiv(blkSel, 'blk', '選到的區塊'));
    items.forEach(function (it, i) {
      if (it.gone || !it.own || it.box.page !== page) return;
      var st = i === cur ? 'cur' : done(it) ? 'ok' : 'todo';
      var d = boxDiv(it.box, 'm ' + st, it.n + '. ' + it.tex);
      d.dataset.i = i;
      ov.appendChild(d);
    });
    var c = items[cur];
    if (c && !c.own && c.box && c.box.page === page) ov.appendChild(boxDiv(c.box, 'blk cur', '這個算式所在的區塊'));
    var w = warns[curW];
    if (w && w.page === page) w.boxes.forEach(function (b) { ov.appendChild(boxDiv(b, 'warn cur', w.label)); });
  }

  function scrollIntoBox(b) {
    var sc = $('vtm-page-scroll'), host = $('vtm-page');
    var H = host.clientHeight, Wd = host.clientWidth;
    var cy = (b.y0 + b.y1) / 2 * H, cx = (b.x0 + b.x1) / 2 * Wd;
    sc.scrollTo({ top: Math.max(0, cy - sc.clientHeight / 2), left: Math.max(0, cx - sc.clientWidth / 2), behavior: 'smooth' });
  }

  function focusBox(b) {
    if (!SRC || !b) return;
    if ($('vtm-follow').checked && $('vtm-fit').value !== 'zoom') $('vtm-fit').value = 'zoom';
    showPage(b.page).then(function () { scrollIntoBox(b); });
  }

  // ---------- 文字（整份） ----------
  function renderDoc() {
    var host = $('vtm-doc');
    var main = V.doc.querySelector('main') || V.doc.body;
    host.innerHTML = '';
    c2o = new WeakMap();
    var c = document.importNode(main, true);
    var oa = main.querySelectorAll('*'), ca = c.querySelectorAll('*');
    for (var j = 0; j < ca.length; j++) c2o.set(ca[j], oa[j]);
    c2o.set(c, main);
    c.querySelectorAll('template, script, img').forEach(function (e) { e.remove(); });
    var k = 0;
    c.querySelectorAll('.vt-math').forEach(function (s) {
      var it = items[k];
      s.dataset.i = k++;
      s.innerHTML = mathSrc(it ? it.tex : (s.dataset.tex || ''));
      s.removeAttribute('data-crop');
    });
    c.querySelectorAll('hr.vt-page').forEach(function (h) {
      var d = document.createElement('div');
      d.className = 'vtm-pgmark';
      d.textContent = '── 原卷第 ' + h.dataset.page + ' 頁 ──';
      h.replaceWith(d);
    });
    host.appendChild(c);
    typeset(host);
    markDoc();
  }

  function docSpan(i) { return $('vtm-doc').querySelector('.vt-math[data-i="' + i + '"]'); }

  function markDoc() {
    $('vtm-doc').querySelectorAll('.vt-math').forEach(function (s) {
      var i = +s.dataset.i, it = items[i];
      s.classList.toggle('cur', i === cur);
      s.classList.toggle('ok', !!it && done(it));
    });
    $('vtm-doc').querySelectorAll('.vtm-blk').forEach(function (e) { e.classList.remove('vtm-blk'); });
  }

  function scrollDoc(el) {
    var sc = $('vtm-doc-scroll');
    var r = el.getBoundingClientRect(), rs = sc.getBoundingClientRect();
    sc.scrollTo({ top: sc.scrollTop + (r.top - rs.top) - sc.clientHeight / 2 + r.height / 2, behavior: 'smooth' });
  }

  function cloneOf(orig) {
    var all = $('vtm-doc').querySelectorAll('*');
    for (var j = 0; j < all.length; j++) if (c2o.get(all[j]) === orig) return all[j];
    return null;
  }

  // ---------- 清單 ----------
  function order() {
    var idx = [];
    items.forEach(function (it, i) { if (!it.gone) idx.push(i); });
    if ($('vtm-only').checked) idx = idx.filter(function (i) { return !done(items[i]); });
    if ($('vtm-sort').value === 'conf') {
      idx.sort(function (a, b) {
        var ea = items[a].err && !done(items[a]) ? 0 : 1, eb = items[b].err && !done(items[b]) ? 0 : 1;
        var ca = items[a].conf == null ? 2 : items[a].conf, cb = items[b].conf == null ? 2 : items[b].conf;
        return ea - eb || ca - cb || a - b;
      });
    }
    return idx;
  }

  function label(it) {
    var s = (it.err ? '⚠有錯 ' : '') + (it.added ? '新' : it.n) + '.';
    if (it.where) s += ' ' + it.where;
    s += it.added ? '（自己加的）' : it.conf == null ? '（手打）' : '（信心 ' + Math.round(it.conf * 100) + '%）';
    if (it.tex !== it.tex0 && !it.added) s += ' ✎改過';
    else if (it.checked) s += ' ✓';
    if (it.brl) s += brlStale(it) ? ' ⚠手改點字是舊的' : ' ⠿手改點字';
    var t = it.tex.length > 40 ? it.tex.slice(0, 40) + '…' : it.tex;
    return s + '　' + t;
  }

  function renderList() {
    var sel = $('vtm-list');
    sel.innerHTML = '';
    if (warns.length) {
      var g = document.createElement('optgroup');
      g.label = '⚠ 要檢查（' + warns.length + '）';
      warns.forEach(function (w, k) {
        var o = document.createElement('option');
        o.value = 'w' + k;
        o.textContent = (w.done ? '✓ ' : '⚠ ') + w.label;
        o.className = w.done ? '' : 'warn';
        g.appendChild(o);
      });
      sel.appendChild(g);
    }
    var g2 = document.createElement('optgroup');
    g2.label = '算式（' + live().length + '）';
    order().forEach(function (i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = label(items[i]);
      if ((items[i].err || items[i].conf != null && items[i].conf < LOW) && !done(items[i])) o.className = 'low';
      g2.appendChild(o);
    });
    sel.appendChild(g2);
    if (cur >= 0) sel.value = cur; else if (curW >= 0) sel.value = 'w' + curW;
    stat();
  }

  function stat() {
    var L = live();
    var ch = L.filter(function (x) { return x.tex !== x.tex0 || x.added; }).length;
    var ok = L.filter(done).length;
    var low = L.filter(function (x) { return x.conf != null && x.conf < LOW; }).length;
    var bad = L.filter(function (x) { return x.err; }).length;
    var wl = warns.filter(function (w) { return !w.done; }).length;
    $('vtm-stat').textContent = (L.length
      ? '共 ' + L.length + ' 個算式（' + (bad ? 'LaTeX 有錯的 ' + bad + ' 個、' : '') + '信心低於 ' + Math.round(LOW * 100) + '% 的 ' + low + ' 個），已確認 ' + ok + ' 個，改過 ' + ch + ' 個'
      : '這份中繼檔沒有算式') + (warns.length ? '；要檢查的地方還有 ' + wl + ' 處' : '');
  }

  // ---------- 校對 ----------
  function nemeth(tex) {
    try { return { ok: true, s: asc2brl(latexToNemethAsc(tex)) }; } catch (e) { return { ok: false, s: e.message }; }
  }

  // 手改的點字（data-brl，規格 3.4）：記著是從哪一版 LaTeX 轉的（data-brlsrc），算式後來又改了就是舊的
  function brlStale(it) { return !!it.brl && it.brlsrc !== vitoolsVtdoc.hash(it.tex.trim()); }
  function toBrl(v) { return v.replace(/[\x20-\x7e]/g, function (c) { return asc2brl(c); }).replace(/\r/g, ''); }

  function showBrl(it, auto) {
    var nb = $('vtm-nem');
    if (it.brl) { nb.textContent = it.brl; nb.className = 'box mono font-unicode'; }
    $('vtm-brl-auto').hidden = !it.brl;
    $('vtm-brl-st').textContent = !it.brl ? '' : brlStale(it)
      ? '⚠ 算式改過了，這個手改的點字是舊的（文字轉點字會改用自動轉的）。請重改，或改回自動轉的。自動轉的是：' + (auto.ok ? auto.s : '轉不出來')
      : '手改過（文字轉點字會用這個）';
  }

  function refresh() {
    var it = items[cur];
    if (UNSAFE.test(it.tex)) $('vtm-prev').innerHTML = '<span class="vtm-bad">這個算式裡有 \\newcommand 之類的指令，多半是辨識錯了，請對照原卷重打</span>';
    else { $('vtm-prev').innerHTML = '\\(' + esc(it.tex) + '\\)'; typeset($('vtm-prev')); }
    var r = nemeth(it.tex);
    var nb = $('vtm-nem');
    nb.textContent = r.ok ? r.s : '轉不出點字：' + r.s;
    nb.className = 'box mono font-unicode' + (r.ok ? '' : ' err');
    showBrl(it, r);
    $('vtm-undo').disabled = it.tex === it.tex0 || it.added;
    var hadErr = !!it.err;
    checkErr(it);
    $('vtm-err').hidden = !it.err;
    $('vtm-err').textContent = it.err ? '⚠ 這個算式的 LaTeX 有錯：' + it.err + '。辨識信心只是模型自己的把握，信心高也可能整個辨識錯，請對照原卷改正。' : '';
    if (hadErr !== !!it.err) { var o = $('vtm-list').querySelector('option[value="' + cur + '"]'); if (o) o.textContent = label(it); stat(); }
    $('vtm-state').textContent = it.added ? '自己加的' : it.tex !== it.tex0 ? '改過（原本：' + it.tex0 + '）' : it.checked ? '已確認正確' : '還沒確認';
  }

  function showMathUI(on) {
    $('vtm-erow').hidden = !on;
    $('vtm-warn').hidden = on;
    if (!on) $('vtm-err').hidden = true;
  }

  function select(i, from) {
    cur = i; curW = -1;
    blkSel = null;
    var it = items[i];
    $('vtm-edit').hidden = false;
    showMathUI(true);
    $('vtm-head').textContent = (it.added ? '自己加的算式' : '第 ' + it.n + ' 個算式') + (it.where ? '，' + it.where : '') +
      (it.added ? '' : it.conf == null ? '，手打（沒有辨識信心）' : '，辨識信心 ' + Math.round(it.conf * 100) + '%') + (it.hidden ? '，在不輸出的內容裡' : '');
    // 沒帶原卷：用算式的裁圖對照
    var img = $('vtm-crop');
    var useCrop = !SRC && it.crop;
    if (useCrop) img.src = it.crop; else img.removeAttribute('src');
    img.hidden = !useCrop;
    $('vtm-nocrop').hidden = !!(SRC || it.crop);
    $('vtm-tex').value = it.tex;
    $('vtm-list').value = i;
    $('vtm-brl-w').hidden = true;
    refresh();
    markDoc();
    var s = docSpan(i);
    if (s && from !== 'doc') scrollDoc(s);
    if (SRC) { if (it.box) focusBox(it.box); else drawBoxes(); }
  }

  function selectWarn(k) {
    cur = -1; curW = k; blkSel = null;
    var w = warns[k];
    $('vtm-edit').hidden = false;
    showMathUI(false);
    $('vtm-head').textContent = w.label;
    var tip = {
      uncovered: '原卷上紅色斜線的地方沒被收進任何區塊，這些字沒有輸出。要補回來，請回辨識套件版面調整把框拉大或補一個框，再重新存中繼檔；本來就不要的（例如雜訊），按「看過了」。',
      skip: '這一塊在版面調整被設成「略過」，內容沒有輸出。如果是題目或選項，請回辨識套件版面調整改類型；本來就該略過的，按「看過了」。',
      suspect: '這段文字裡有像算式的寫法，但沒有當成算式。是算式的話，在右邊文字欄選取那幾個字，按「選取的文字變成算式」，或按「✎ 改這段文字」直接改；不是的話按「看過了」。',
      exp: '算式後面緊接一個單獨的數字，常是原卷的次方被辨識成文字。是的話按「✎ 改這段文字」，把數字併進算式（例如 (999+1)^{2}）、刪掉後面的數字；不是的話按「看過了」。'
    }[w.kind];
    $('vtm-tedit3').hidden = !w.el;
    $('vtm-warn-text').textContent = (w.text ? '內容：' + w.text + '\n' : '') + tip;
    $('vtm-list').value = 'w' + k;
    markDoc();
    if (w.el) {
      var c = cloneOf(w.el);
      if (c) { c.classList.add('vtm-blk'); scrollDoc(c); }
    }
    if (SRC && w.page && w.boxes.length) {
      var u = w.boxes.reduce(function (a, x) { return [Math.min(a[0], x[0]), Math.min(a[1], x[1]), Math.max(a[2], x[2]), Math.max(a[3], x[3])]; }, w.boxes[0]);
      focusBox({ page: w.page, x0: u[0], y0: u[1], x1: u[2], y1: u[3] });
    } else drawBoxes();
  }

  function setTex(tex) {
    var it = items[cur];
    if (it.tex === tex) return;
    it.tex = tex;
    dirty = true;
    var o = $('vtm-list').querySelector('option[value="' + cur + '"]');
    if (o) { o.textContent = label(it); o.className = ''; }
    var s = docSpan(cur);
    if (s) { s.innerHTML = mathSrc(tex); typeset(s); }
    stat();
    refresh();
    markDoc();
    drawBoxes();
  }

  function step(d) {
    var ord = order(), k = ord.indexOf(cur);
    if (k < 0) k = d > 0 ? -1 : ord.length;
    var j = k + d;
    if (j < 0 || j >= ord.length) { status(d > 0 ? '已經是最後一個' : '已經是第一個'); return false; }
    select(ord[j]);
    return true;
  }

  function confirmCur() {
    if (cur < 0) return;
    var it = items[cur];
    if (!nemeth(it.tex).ok && !window.confirm('這個算式轉不出點字，還是要標成正確嗎？')) return;
    it.checked = true;
    dirty = true;
    // 照目前的排序找下一個還沒確認的（「只列還沒確認的」時，剛確認的已經不在清單裡）
    var all = [];
    items.forEach(function (x, i) { if (!x.gone) all.push(i); });
    if ($('vtm-sort').value === 'conf') {
      all.sort(function (a, b) {
        var ea = items[a].err && !done(items[a]) ? 0 : 1, eb = items[b].err && !done(items[b]) ? 0 : 1;
        var ca = items[a].conf == null ? 2 : items[a].conf, cb = items[b].conf == null ? 2 : items[b].conf;
        return ea - eb || ca - cb || a - b;
      });
    }
    var next = null, base = all.indexOf(cur);
    for (var j = 1; j <= all.length; j++) {
      var c = all[(base + j) % all.length];
      if (!done(items[c])) { next = c; break; }
    }
    renderList();
    if (next == null) { select(cur); status('全部算式都確認過了，可以按「存回中繼檔」'); return; }
    select(next);
    status('已確認，跳到下一個還沒確認的算式');
    $('vtm-tex').focus();
  }

  // 文字欄選取的文字 → 算式（中繼檔與文字欄一起改）
  function makeMath() {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { status('先在右邊的文字欄選取要變成算式的文字'); return; }
    var r = sel.getRangeAt(0);
    var tn = r.startContainer;
    if (tn !== r.endContainer || tn.nodeType !== 3 || !$('vtm-doc').contains(tn) || tn.parentElement.closest('.vt-math')) {
      status('請在同一段一般文字裡選取（不要跨到算式或別段）'); return;
    }
    var cp = tn.parentElement, op = c2o.get(cp);
    var idx = Array.prototype.indexOf.call(cp.childNodes, tn);
    var on = op && op.childNodes[idx];
    if (!on || on.nodeType !== 3 || on.nodeValue !== tn.nodeValue) { status('這段文字對不回中繼檔，請改用文件整理修改'); return; }
    var a = r.startOffset, b = r.endOffset;
    var tex = tn.nodeValue.slice(a, b).trim();
    if (!tex) return;
    // 中繼檔：拆開文字，中間放 vt-math
    var os = on.ownerDocument.createElement('span');
    os.className = 'vt-math';
    os.dataset.tex = tex;
    os.textContent = '\\(' + tex + '\\)';
    var mid = on.splitText(a);
    mid.splitText(b - a);
    mid.parentNode.replaceChild(os, mid);
    var it = newItem(os);
    it.tex0 = tex; it.added = true; it.n = items.length + 1;
    items.push(it);
    var i = items.length - 1;
    // 文字欄
    var cm = tn.splitText(a);
    cm.splitText(b - a);
    var cs = document.createElement('span');
    cs.className = 'vt-math';
    cs.dataset.i = i;
    cs.innerHTML = mathSrc(tex);
    cm.parentNode.replaceChild(cs, cm);
    c2o.set(cs, os);
    typeset(cs);
    sel.removeAllRanges();
    dirty = true;
    if (curW >= 0 && warns[curW].kind === 'suspect') warns[curW].done = true;
    renderList();
    select(i);
    $('vtm-tex').focus();
    status('已變成算式：照原卷把 LaTeX 改對（例如 90° 打成 90^\\circ），再按「✓ 正確，下一個」');
  }

  // 不是算式 → 改回一般文字
  function unMath() {
    if (cur < 0) return;
    var it = items[cur];
    var plain = it.tex.replace(/\\text\{([^}]*)\}/g, '$1').replace(/\\[,;: ]/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    var t = window.prompt('改回一般文字。要放進文字裡的內容（可以修改）：', plain);
    if (t == null) return;
    it.el.parentNode.replaceChild(it.el.ownerDocument.createTextNode(t), it.el);
    var s = docSpan(cur);
    if (s) s.parentNode.replaceChild(document.createTextNode(t), s);
    it.gone = true;
    dirty = true;
    renderList();
    status('已改回文字：' + t);
    var ord = order();
    if (ord.length) select(ord[0]); else $('vtm-edit').hidden = true;
  }

  // ---------- 改這段文字（文字和算式一起改）----------
  // 開一個文字框，內容是這一段的純文字（算式寫成 \( LaTeX \)，同文字轉點字的輸入框），確定後用 vtdoc.js 的 setInline 寫回：
  // 沒改的算式沿用原本的元素（信心、原卷位置、裁圖），算式清單照文件順序重建，沒改的算式保留辨識結果、確認、手改點字。
  var editEl = null, editOrig = '', editBack = null;
  function editTarget(from) {
    if (from === 'vtm-tedit3' && curW >= 0) return warns[curW].el || null;
    if (from === 'vtm-tedit2' && cur >= 0) return items[cur].el.closest(BLOCKS) || items[cur].el.parentElement;
    if (blkEl && blkEl.isConnected) return blkEl;
    if (cur >= 0 && !items[cur].gone) return items[cur].el.closest(BLOCKS) || items[cur].el.parentElement;
    if (curW >= 0 && warns[curW].el) return warns[curW].el;
    return null;
  }
  function editText(from) {
    if (!V) return;
    var el = editTarget(from);
    if (!el) { status('先在右邊文字欄點要改的那一段，或在清單選一個算式'); return; }
    // 這一段裡的算式先換成目前（可能還沒存）的 LaTeX
    items.forEach(function (it) {
      if (!it.gone && el.contains(it.el) && it.el.dataset.tex !== it.tex) { it.el.dataset.tex = it.tex; it.mathDirty = true; }
    });
    editEl = el;
    editOrig = vitoolsVtdoc.inlineText(el);
    editBack = document.activeElement;
    var fmt = Array.prototype.some.call(el.querySelectorAll('*'), function (n) {
      return !n.closest('.vt-math') && !/^(BR|SPAN)$/.test(n.tagName) && n !== el;
    });
    $('vtm-tdlg-note').textContent = (fmt ? '這段有粗體、底線之類的格式，改了之後格式會拿掉（文字、算式都留著）。' : '') +
      '改字、刪掉多出來的字，或把漏掉的部分補進算式。';
    $('vtm-tdlg-ta').value = editOrig;
    $('vtm-tdlg').showModal();
    $('vtm-tdlg-ta').focus();
  }
  function editTextOk() {
    var el = editEl, nt = $('vtm-tdlg-ta').value.replace(/\r/g, '');
    $('vtm-tdlg').close();
    if (!el || nt === editOrig) return;
    // 原本的算式狀態，照 LaTeX 對回
    var state = new Map();
    items.forEach(function (it) { if (!it.gone && el.contains(it.el) && !state.has(it.tex)) state.set(it.tex, it); });
    var curIt = cur >= 0 ? items[cur] : null;
    var lines = nt.split('\n');
    vitoolsVtdoc.setInline(el, lines[0]);
    for (var k = 1; k < lines.length; k++) {
      var tmp = el.ownerDocument.createElement('span');
      vitoolsVtdoc.setInline(tmp, lines[k]);
      el.appendChild(el.ownerDocument.createElement('br'));
      while (tmp.firstChild) el.appendChild(tmp.firstChild);
    }
    var news = rebuildItems(state, el);
    warns.forEach(function (w) { if (w.el === el) w.done = true; });
    dirty = true;
    renderDoc();
    renderList();
    var i = curIt ? items.indexOf(curIt) : -1;
    if (i < 0 && curIt) i = items.findIndex(function (x) { return x.el.isConnected && el.contains(x.el) && x.tex === curIt.tex; });
    if (i >= 0) select(i);
    else { var c = cloneOf(el); markDoc(); if (c) { c.classList.add('vtm-blk'); scrollDoc(c); } }
    blkEl = el;
    status('已改好這段文字' + (news ? '；新的算式 ' + news + ' 個，請檢查' : '') + '。存回中繼檔才會留下');
  }
  // 算式清單照文件順序重建：同一個元素沿用；setInline 換掉的照 LaTeX 對回原本的狀態；
  // 還對不回的，跟這一段裡沒用到的原本算式照順序配對（LaTeX 改過：留辨識結果、信心、原卷位置）；剩下的是新的算式 → 回傳新的個數
  function rebuildItems(state, el) {
    var main = V.doc.querySelector('main') || V.doc.body;
    var byEl = new Map(), maxN = 0, news = 0, live = [], fresh = [];
    items.forEach(function (it) { if (!it.gone) byEl.set(it.el, it); maxN = Math.max(maxN, it.n || 0); });
    main.querySelectorAll('.vt-math').forEach(function (span) {
      if (span.closest('template')) return;
      var it = byEl.get(span);
      if (!it) {
        it = newItem(span);
        var old = state && state.get(it.tex);
        if (old) {
          state.delete(it.tex);
          ['tex0', 'conf', 'checked', 'brl', 'brlsrc', 'added', 'n', 'crop'].forEach(function (k) { it[k] = old[k]; });
          it.mathDirty = true;
          if (old === items[cur]) items[cur] = it;
        } else fresh.push(it);
      }
      live.push(it);
    });
    var left = [];
    if (state) state.forEach(function (o) { if (left.indexOf(o) < 0) left.push(o); });
    left.sort(function (a, b) { return items.indexOf(a) - items.indexOf(b); });
    fresh.forEach(function (it) {
      var old = el && el.contains(it.el) ? left.shift() : null;
      if (old) {
        ['tex0', 'conf', 'brl', 'brlsrc', 'added', 'n', 'crop', 'box', 'own'].forEach(function (k) { it[k] = old[k]; });
        ['data-conf', 'data-box', 'data-crop', 'data-blk'].forEach(function (a) {
          if (old.el.hasAttribute(a) && !it.el.hasAttribute(a)) it.el.setAttribute(a, old.el.getAttribute(a));
        });
        if (old === items[cur]) items[cur] = it;
      } else { it.added = true; it.n = ++maxN; news++; }
      it.mathDirty = true;
      checkErr(it);
    });
    live.forEach(function (it) { if (it.err === undefined) checkErr(it); });
    var curIt = cur >= 0 ? items[cur] : null;
    items = live.concat(items.filter(function (it) { return it.gone; }));
    cur = curIt ? items.indexOf(curIt) : -1;
    return news;
  }

  function status(s) { $('vtm-st').textContent = s; }

  function save() {
    if (!V) return;
    var changed = 0, checked = 0, bad = 0, added = 0, gone = 0, brl = 0;
    items.forEach(function (it) {
      if (it.gone) { if (!it.added) gone++; return; }
      var el = it.el;
      var edit = it.tex !== el.dataset.tex || it.mathDirty;
      it.mathDirty = false;
      if (it.added && !el.dataset.checked) added++; else if (edit) changed++;
      if (edit) el.dataset.tex = it.tex;
      if (done(it)) { if (el.dataset.checked !== '1') checked++; el.dataset.checked = '1'; }
      // 手改的點字：有就寫（連同來源雜湊）；改回自動轉的就拿掉
      if (it.brl) { if (el.dataset.brl !== it.brl) brl++; el.dataset.brl = it.brl; el.dataset.brlsrc = it.brlsrc; }
      else if (el.hasAttribute('data-brl')) { el.removeAttribute('data-brl'); el.removeAttribute('data-brlsrc'); }
      // MathML 由 data-tex 產生：改過的、還沒有 MathML 的都重轉
      if (edit || !el.querySelector('math')) {
        try {
          if (!(window.MathJax && MathJax.tex2mml) || UNSAFE.test(it.tex)) throw new Error('no MathJax');
          el.innerHTML = MathJax.tex2mml(it.tex, { display: el.classList.contains('vt-display') });
        } catch (e) { el.textContent = '\\(' + it.tex + '\\)'; bad++; }
      }
    });
    var note = '算式 ' + changed + ' 個修改、' + checked + ' 個確認' + (added ? '、' + added + ' 個新增' : '') + (gone ? '、' + gone + ' 個改回文字' : '') + (brl ? '；點字手改 ' + brl + ' 個' : '');
    var html = vitoolsVtdoc.serialize(V, 'nc 算式校對', note);
    items.forEach(function (it) { it.tex0 = it.tex; });
    var fn = /\.vtdoc\.html?$/i.test(name) ? name : name.replace(/\.html?$/i, '') + '.vtdoc.html';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    a.download = fn;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    dirty = false;
    renderList();
    if (cur >= 0) select(cur);
    status('已存回中繼檔 ' + fn + '：' + note + (bad ? '；' + bad + ' 個算式 MathJax 轉不成 MathML，留 LaTeX 原碼' : ''));
  }

  function init() {
    $('vtm-file').addEventListener('change', function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (dirty && !window.confirm('目前的校對還沒存回中繼檔，確定要開別的檔案？')) return;
      f.text().then(function (h) { load(h, f.name); });
    });
    $('vtm-list').addEventListener('change', function () {
      if (this.value.charAt(0) === 'w') selectWarn(+this.value.slice(1)); else select(+this.value);
    });
    $('vtm-list').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (cur >= 0) $('vtm-tex').focus(); else $('vtm-warn-ok').focus(); }
    });
    $('vtm-tex').addEventListener('input', function () { setTex(this.value.trim()); });
    $('vtm-tex').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); confirmCur(); }
      else if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();  // 算式是一行
      else if (e.key === 'PageDown' && e.altKey) { e.preventDefault(); if (step(1)) $('vtm-tex').focus(); }
      else if (e.key === 'PageUp' && e.altKey) { e.preventDefault(); if (step(-1)) $('vtm-tex').focus(); }
    });
    $('vtm-sort').addEventListener('change', function () { renderList(); });
    $('vtm-only').addEventListener('change', function () { renderList(); });
    $('vtm-ok').addEventListener('click', confirmCur);
    $('vtm-next').addEventListener('click', function () { step(1); });
    $('vtm-back').addEventListener('click', function () { step(-1); });
    $('vtm-undo').addEventListener('click', function () {
      var it = items[cur];
      $('vtm-tex').value = it.tex0;
      setTex(it.tex0);
      status('已還原成原本的辨識結果');
    });
    $('vtm-unmath').addEventListener('click', unMath);
    ['vtm-tedit', 'vtm-tedit2', 'vtm-tedit3'].forEach(function (id) {
      var b = $(id);
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { editText(id); });
    });
    $('vtm-tdlg-ok').addEventListener('click', editTextOk);
    $('vtm-tdlg-no').addEventListener('click', function () { $('vtm-tdlg').close(); });
    $('vtm-tdlg-ta').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); editTextOk(); }
    });
    $('vtm-tdlg').addEventListener('close', function () { if (editBack) editBack.focus(); });
    $('vtm-brl-edit').addEventListener('click', function () {
      if (cur < 0) return;
      var it = items[cur], r = nemeth(it.tex);
      $('vtm-brl').value = it.brl || (r.ok ? r.s : '');
      $('vtm-brl-w').hidden = false;
      $('vtm-brl').focus();
    });
    $('vtm-brl').addEventListener('input', function () {
      var it = items[cur], ta = this, pos = ta.selectionStart;
      var v = toBrl(ta.value);
      if (v !== ta.value) { ta.value = v; ta.setSelectionRange(pos, pos); }
      var r = nemeth(it.tex), was = !!it.brl;
      // 跟自動轉的一樣就不算手改
      if (!v.trim() || (r.ok && v === r.s)) it.brl = null;
      else { it.brl = v; it.brlsrc = vitoolsVtdoc.hash(it.tex.trim()); }
      dirty = true;
      $('vtm-nem').textContent = it.brl || (r.ok ? r.s : '轉不出點字：' + r.s);
      showBrl(it, r);
      if (was !== !!it.brl) { var o = $('vtm-list').querySelector('option[value="' + cur + '"]'); if (o) o.textContent = label(it); }
    });
    $('vtm-brl').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); $('vtm-brl-w').hidden = true; $('vtm-brl-edit').focus(); }
    });
    $('vtm-brl-auto').addEventListener('click', function () {
      if (cur < 0) return;
      var it = items[cur];
      it.brl = null; it.brlsrc = '';
      dirty = true;
      $('vtm-brl-w').hidden = true;
      var o = $('vtm-list').querySelector('option[value="' + cur + '"]'); if (o) o.textContent = label(it);
      refresh();
      status('已改回自動轉的點字');
    });
    $('vtm-mk').addEventListener('mousedown', function (e) { e.preventDefault(); });  // 按鈕不要搶走選取
    $('vtm-mk').addEventListener('click', makeMath);
    $('vtm-warn-ok').addEventListener('click', function () {
      if (curW < 0) return;
      warns[curW].done = true;
      var k = warns.findIndex(function (w) { return !w.done; });
      renderList();
      if (k >= 0) selectWarn(k);
      else { var f = order()[0]; if (f != null) select(f); }
    });
    $('vtm-me').addEventListener('click', function () {
      _meTarget = {
        get: function () { return '\\(' + items[cur].tex + '\\)'; },
        set: function (v) {
          var m = v.match(/^\s*\\\(([\s\S]*)\\\)\s*$/) || v.match(/^\s*\$([\s\S]*)\$\s*$/);
          var t = (m ? m[1] : v).replace(/\s*\n\s*/g, ' ').trim();
          $('vtm-tex').value = t;
          setTex(t);
        }
      };
      openMathEditor();
    });
    $('vtm-save').addEventListener('click', save);
    // 原卷：點算式的框 → 選那個算式
    $('vtm-ov').addEventListener('click', function (e) {
      var d = e.target.closest('.vtm-bx.m');
      if (d) select(+d.dataset.i);
    });
    // 文字：點算式 → 選那個算式；點其他文字 → 原卷上框出那一塊（有選取文字時不動，讓人按「變成算式」）
    $('vtm-doc').addEventListener('click', function (e) {
      var s = e.target.closest('.vt-math[data-i]');
      if (s && items[+s.dataset.i]) { select(+s.dataset.i, 'doc'); return; }
      if (!window.getSelection().isCollapsed) return;
      var pb = e.target.closest(BLOCKS);
      blkEl = pb && $('vtm-doc').contains(pb) ? c2o.get(pb) || null : null;
      var b = e.target.closest('[data-box]');
      if (!b) { markDoc(); if (pb) pb.classList.add('vtm-blk'); return; }
      markDoc();
      b.classList.add('vtm-blk');
      blkSel = vitoolsVtdoc.box(b);
      if (SRC && blkSel) focusBox(blkSel);
    });
    $('vtm-pprev').addEventListener('click', function () { blkSel = null; showPage(page - 1); });
    $('vtm-pnext').addEventListener('click', function () { blkSel = null; showPage(page + 1); });
    $('vtm-zin').addEventListener('click', function () {
      if ($('vtm-fit').value !== 'zoom') { $('vtm-fit').value = 'zoom'; zoom = 1.25; } else zoom = Math.min(5, zoom * 1.25);
      showPage(page);
    });
    $('vtm-zout').addEventListener('click', function () {
      if ($('vtm-fit').value !== 'zoom') { $('vtm-fit').value = 'page'; showPage(page); return; }
      zoom /= 1.25;
      if (zoom <= 1.01) { zoom = 1; $('vtm-fit').value = 'width'; }
      showPage(page);
    });
    $('vtm-fit').addEventListener('change', function () { if (this.value === 'zoom' && zoom < 1.25) zoom = 2; showPage(page); });
    $('vtm-all').addEventListener('change', drawBoxes);
    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (SRC && page && $('vtm-fit').value !== 'zoom') showPage(page); }, 300);
    });
    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  window.ncVtdoc = { load: load, isDirty: function () { return dirty; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
