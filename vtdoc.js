// vi-tools 中繼檔（.vtdoc.html）：讀、轉成純文字、改過的文字與讀音存回去。
// 規格：docs/notes/vtdoc.md。文字轉點字、文件整理共用。
//   const v = vitoolsVtdoc.parse(html)            → { doc, meta } 或 null（不是中繼檔）
//   const t = vitoolsVtdoc.toText(v)              → { text, lines:[{text, el}] }（規格第 4 節的純文字）
//   vitoolsVtdoc.applyText(v, t, newText)         → 改過的行寫回元素，回傳 { changed, added, removed }
//   vitoolsVtdoc.applyReadings(v, fn)             → fn(行文字, 字的位置) 回傳注音或 null；讀音包成 data-reading
//   vitoolsVtdoc.serialize(v, tool, note)         → HTML 字串（history 加一筆）
//   vitoolsVtdoc.source(v) / box(el)              → 內嵌的原卷、元素在原卷上的位置（data-box）
(function () {
  'use strict';
  const MATH_RE = /\\\((.+?)\\\)/g;
  const ALLOWED = new Set(['html', 'head', 'meta', 'title', 'style', 'body', 'main', 'h1', 'h2', 'h3', 'p', 'br', 'span',
    'div', 'section', 'template', 'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'img',
    'ul', 'li', 'hr', 'script']);
  const MATHML = new Set(['math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mspace', 'mrow', 'mfrac', 'msqrt', 'mroot', 'mstyle',
    'merror', 'mpadded', 'mphantom', 'mfenced', 'menclose', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover',
    'mmultiscripts', 'mprescripts', 'none', 'mtable', 'mtr', 'mtd', 'mlabeledtr', 'semantics', 'annotation',
    'annotation-xml', 'maligngroup', 'malignmark']);
  const ATTRS = new Set(['class', 'id', 'lang', 'hidden', 'aria-hidden', 'alt', 'src', 'colspan', 'rowspan', 'charset',
    'name', 'content', 'type']);
  // 原卷（application/pdf、image/*）是 base64 資料，瀏覽器不會執行
  // text/vnd.abc：音樂點字存回譜例時一起存的 ABC 原文（試題方框等 MusicXML 存不下的寫法）
  const SCRIPT_TYPES = new Set(['application/json', 'application/vnd.recordare.musicxml+xml', 'text/vnd.abc', 'application/pdf',
    'image/jpeg', 'image/png']);

  // 原卷：{ kind:'pdf', data:Uint8Array, pageMap:[原始檔頁碼…] } 或 { kind:'pages', pages:{頁:dataURL} }；沒帶原卷 → null
  function source(v) {
    const pdf = v.doc.getElementById('vtdoc-source');
    const map = (v.meta.source && v.meta.source.page_map) || null;
    if (pdf && pdf.getAttribute('type') === 'application/pdf') {
      const bin = atob(pdf.textContent.replace(/\s/g, ''));
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      return { kind: 'pdf', data, pageMap: map };
    }
    const ps = v.doc.querySelectorAll('script.vtdoc-page');
    if (!ps.length) return null;
    const pages = {};
    ps.forEach(s => { pages[+s.dataset.page] = 'data:' + s.getAttribute('type') + ';base64,' + s.textContent.replace(/\s/g, ''); });
    return { kind: 'pages', pages };
  }

  // data-box="頁 x0 y0 x1 y1"（頁碼從 1 起，座標是頁面寬高的比例）→ { page, x0, y0, x1, y1 } 或 null
  function box(el) {
    const a = el && el.dataset && el.dataset.box;
    if (!a) return null;
    const n = a.trim().split(/\s+/).map(Number);
    return n.length === 5 && n.every(isFinite) ? { page: n[0], x0: n[1], y0: n[2], x1: n[3], y1: n[4] } : null;
  }

  function isVtdoc(html) {
    return /<meta[^>]+name=["']generator["'][^>]+content=["']vtdoc/i.test(html) || /id=["']vtdoc-meta["']/.test(html);
  }

  // 只留規格允許的標籤與屬性（事件屬性、外部圖片、會執行的 script 都拿掉）
  function sanitize(root) {
    const walk = el => {
      for (const c of [...el.children]) {
        const tag = c.tagName.toLowerCase();
        const ok = ALLOWED.has(tag) || MATHML.has(tag) || (c.namespaceURI || '').includes('MathML');
        if (!ok || (tag === 'script' && !SCRIPT_TYPES.has((c.getAttribute('type') || '').toLowerCase()))) {
          c.remove();
          continue;
        }
        for (const a of [...c.attributes]) {
          const n = a.name.toLowerCase();
          if (n.startsWith('on')) { c.removeAttribute(a.name); continue; }
          if (n === 'src' && !/^data:image\//i.test(a.value)) { c.removeAttribute(a.name); continue; }
          if (!(ATTRS.has(n) || n.startsWith('data-') || MATHML.has(tag) || tag === 'math' ||
              ['display', 'mathvariant', 'stretchy', 'fence', 'separator', 'accent', 'width', 'height',
               'xmlns', 'encoding'].includes(n))) c.removeAttribute(a.name);
        }
        if (tag === 'template') walk(c.content); else walk(c);
      }
    };
    walk(root);
  }

  function parse(html) {
    if (!isVtdoc(html)) return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    sanitize(doc.documentElement);
    let meta = {};
    const m = doc.getElementById('vtdoc-meta');
    try { meta = m ? JSON.parse(m.textContent) : {}; } catch (e) { meta = {}; }
    return { doc, meta };
  }

  function hiddenUp(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (e.hasAttribute('hidden') || e.tagName === 'TEMPLATE' || e.tagName === 'HEAD') return true;
    }
    return false;
  }

  // 元素裡的文字（算式用 \( data-tex \)，讀音照字）
  // 算式中間夾的中文移到算式外（辨識套件 mathocr.split_cjk 同規則）：
  //   '2 \frac{1}{3} 是 4 \frac{1}{9}' → [{math:'2 \frac{1}{3}'}, {text:'是'}, {math:'4 \frac{1}{9}'}]
  //   只看最外層（\frac{甲}{乙} 留在算式裡）；\text{是} 這類內容全是中文的也算文字。沒夾中文回傳 null。
  //   不拆的話，後面那個算式在點字裡會接著前面的算式，少了數字記號。
  const CJK_CH = /[\u4e00-\u9fff\u3000-\u303f\uff01-\uff0f\uff1a-\uff20]/;
  const TEXT_CMD = /^\\(?:text|mbox|mathrm|textrm|mathbf|textbf)\s*\{([^{}]*)\}/;
  function splitCjk(tex) {
    const out = [];
    let buf = '', depth = 0, i = 0;
    const flushMath = () => { if (buf.trim()) out.push({ math: buf.trim() }); buf = ''; };
    const addText = t => { const l = out[out.length - 1]; if (l && l.text != null) l.text += t; else out.push({ text: t }); };
    while (i < tex.length) {
      const c = tex[i];
      if (c === '\\') {
        if (depth === 0) {
          const m = TEXT_CMD.exec(tex.slice(i));
          if (m && m[1].trim() && [...m[1]].every(ch => CJK_CH.test(ch) || /\s/.test(ch))) {
            flushMath(); addText(m[1].trim()); i += m[0].length; continue;
          }
        }
        const m = /^\\(?:[A-Za-z]+|[\s\S])?/.exec(tex.slice(i));   // 結尾單獨一個 \ 也要接得住
        buf += m[0]; i += m[0].length; continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth = Math.max(0, depth - 1);
      if (depth === 0 && CJK_CH.test(c)) { flushMath(); addText(c); i++; continue; }
      buf += c; i++;
    }
    flushMath();
    return out.some(p => p.text != null) && out.some(p => p.math != null) ? out : null;
  }
  // 算式被原卷斷行切開：後半「<7」跑到下一行、被當成文字（√48⅑ 換行 <7）。
  //   算式後面緊接「關係符號＋數字或單一字母」就收回算式裡（後面還接英文字的不收，免得吃到英文單字）
  const TAIL_RE = /^\s*([<>=＜＞＝≤≥≠])\s*([-−]?(?:\d+(?:\.\d+)?|[A-Za-z]))(?![0-9A-Za-z.])/;
  const OP_TEX = { '＜': '<', '＞': '>', '＝': '=', '≤': '\\le', '≥': '\\ge', '≠': '\\neq' };
  function tailTex(m) { return (OP_TEX[m[1]] || m[1]) + ' ' + m[2].replace('−', '-'); }
  function joinTail(text) {
    return text.replace(/\\\((.+?)\\\)([^\\]*)/g, (all, tex, rest) => {
      let t = tex, r = rest, m;
      while ((m = TAIL_RE.exec(r))) { t += ' ' + tailTex(m); r = r.slice(m[0].length); }
      return '\\(' + t + '\\)' + r;
    });
  }
  // 中繼檔裡的算式元素整理（nc 開檔時）：夾中文的拆開、被斷行切開的後半收回來。
  //   新的算式沿用原本的信心、裁圖、位置；確認標記、MathML 不留；
  //   手改的點字留在第一個算式（data-brlsrc 是原本 LaTeX 的，各工具會當成「舊的」提醒，不會直接用）→ { split, joined }
  // 弧 AB：算式辨識常認成 \widehat{AB}（或 \overparen 之類），改成 nc 認得的 \overset{\frown}{AB}。
  //   \widehat 只改 2～3 個大寫字母的（單一字母可能真的是 hat）
  const ARC_RE = /\\(?:overparen|wideparen|overarc|arc)\s*\{\s*([^{}]+?)\s*\}|\\widehat\s*\{\s*([A-Z](?:\s*[A-Z]){1,2})\s*\}/g;
  function arcTex(tex) {
    return tex.replace(ARC_RE, (m, a, b) => '\\overset{\\frown}{' + (a || b).replace(/\s+/g, '') + '}');
  }
  // 單獨一個反斜線（算式辨識會吐出 `{\}`、結尾多一個 `\`）：KaTeX／MathJax 畫不出來，
  //   結尾的還會吃掉 \) 讓整段變回原始碼 → 拿掉（2026-11-13 使用者回報）
  function loneBsTex(tex) {
    // 前面是反斜線的 \{\}（空集合的大括號）不動
    //   模型多吐的 \protect（「且 \protect. AB∥CD」，畫出來是紅字）也拿掉
    return tex.replace(/(^|[^\\])\{\s*\\\s*\}/g, '$1').replace(/\\protect(?![A-Za-z])\s*\.?\s*/g, '').replace(/(?:\s*\\)+\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  }
  function fixTex(tex) { return arcTex(loneBsTex(tex)); }
  function splitMathEls(root) {
    let split = 0, joined = 0, arcs = 0, lone = 0;
    root.querySelectorAll('.vt-math').forEach(el => {
      if (el.closest('template')) return;
      const tex = el.dataset.tex || el.textContent.replace(/^\\\(|\\\)$/g, '');
      const t1 = loneBsTex(tex), t2 = arcTex(t1);
      if (t1 !== tex) lone++;
      if (t2 !== t1) arcs++;
      if (t2 !== tex) el.replaceWith(mathLike(el, t2));
    });
    root.querySelectorAll('.vt-math').forEach(el => {
      if (el.closest('template')) return;
      const tex = el.dataset.tex || el.textContent.replace(/^\\\(|\\\)$/g, '');
      const parts = splitCjk(tex);
      if (!parts) return;
      const doc = el.ownerDocument;
      let first = true;
      for (const p of parts) {
        if (p.text != null) { el.parentNode.insertBefore(doc.createTextNode(p.text), el); continue; }
        el.parentNode.insertBefore(mathLike(el, p.math, first), el);
        first = false;
      }
      el.remove();
      split++;
    });
    root.querySelectorAll('.vt-math').forEach(el => {
      if (el.closest('template')) return;
      const nx = el.nextSibling;
      if (!nx || nx.nodeType !== 3) return;
      let tex = el.dataset.tex || el.textContent.replace(/^\\\(|\\\)$/g, ''), r = nx.nodeValue, m, got = false;
      while ((m = TAIL_RE.exec(r))) { tex += ' ' + tailTex(m); r = r.slice(m[0].length); got = true; }
      if (!got) return;
      el.replaceWith(mathLike(el, tex));
      nx.nodeValue = r;
      joined++;
    });
    const labels = tidyLabels(root);
    const promoted = isMathDoc(root) ? promoteMath(root) : 0;
    return { split, joined, promoted, labels, arcs, lone };
  }

  // 標號整理（2026-11-10 使用者定）：題號前後的作答括號「( )1.」「1.( )」拿掉；選項標記一律半形「(A) 」，後面空一格
  //   只看題目、選項那一行最前面的文字 → 改了幾行
  // 數學卷：標題（<title>、h1）有「數學」，或有辨識套件辨識出來的算式（data-conf）。國文、社會卷的數字、年份不要變成 Nemeth
  function isMathDoc(root) {
    const d = root.ownerDocument, h1 = root.querySelector('h1');
    return /數學/.test((d.title || '') + ' ' + (h1 ? h1.textContent : '')) || !!root.querySelector('.vt-math[data-conf]');
  }
  function tidyLabels(root) {
    let n = 0;
    const doc = root.ownerDocument;
    const firstText = el => { const w = doc.createTreeWalker(el, 4); let t = w.nextNode(); while (t && !t.nodeValue.trim() && t.nextSibling) t = w.nextNode(); return t; };
    root.querySelectorAll('section.vt-q > h3, section.vt-q p').forEach(el => {
      if (el.closest('template')) return;
      const t = firstText(el);
      if (!t || (t.parentElement && t.parentElement.closest('.vt-math'))) return;
      const v = t.nodeValue;
      let r = v;
      if (el.tagName === 'H3') {
        r = r.replace(/^(\s*)[(（][\s　]*[)）]\s*(\d{1,3}\s*[.．、])\s*/, '$1$2 ')       // ( )1.
             .replace(/^(\s*\d{1,3}\s*[.．、])\s*[(（][\s　]*[)）]\s*/, '$1 ');          // 1.( )
      }
      r = r.replace(/^(\s*)[(（]\s*([A-EＡ-Ｅ])\s*[)）]\s*(?=\S)/, (m, sp, c) =>
        sp + '(' + String.fromCharCode(c.charCodeAt(0) > 0xff ? c.charCodeAt(0) - 0xfee0 : c.charCodeAt(0)) + ') ');
      // 只有標記、內容是下一個元素（算式）時，標記後面也要空一格
      r = r.replace(/^(\s*)[(（]\s*([A-EＡ-Ｅ])\s*[)）]\s*$/, (m, sp, c) =>
        sp + '(' + String.fromCharCode(c.charCodeAt(0) > 0xff ? c.charCodeAt(0) - 0xfee0 : c.charCodeAt(0)) + ') ');
      if (r !== v) { t.nodeValue = r; n++; }
    });
    return n;
  }

  // 像算式的一般文字變成算式（2026-11-10 使用者定）：PDF 文字層讀到的「b > a > c」、夾在中文裡的變數「a」、數字「12」，
  //   跟辨識套件框到的算式一樣寫成 \( \)，轉點字才會一致（數學卷的數字、變數一律 Nemeth，同使用者手打的寫法）。
  //   只動題目、選項（section.vt-q 裡面）；不動：題號「1.」、選項標記「(A)」、配分「4 分」、「第 3 題」、「圖 1」、
  //   兩個字母以上的小寫英文字（cm、and）。新的算式標 data-auto，nc 校對時檢查 → 變了幾個
  const FW = { '－': '-', '−': '-', '＋': '+', '＝': '=', '＜': '<', '＞': '>', '（': '(', '）': ')', '∶': ':', '：': ':', '％': '%', '／': '/' };
  const TEX_OP = { '×': '\\times ', '÷': '\\div ', '≤': '\\le ', '≥': '\\ge ', '≠': '\\neq ', '%': '\\%',
    '△': '\\triangle ', '∠': '\\angle ', '⊥': '\\perp ', '∥': '\\parallel ', '≅': '\\cong ', '∼': '\\sim ', '°': '^\\circ ', 'π': '\\pi ' };
  const RUN_RE = /[A-Za-z0-9０-９.,%％()（）+\-−－＋×÷=<>≤≥≠＜＞＝:∶：／/^△∠⊥∥≅∼°π ]+/g;
  // 數字｜字母（π 也算）｜運算符號｜前置符號 △∠｜後置 °｜括號｜逗號｜空白
  const TOK_RE = /(\d+(?:[.,]\d+)*)|([A-Za-z]+|π)|([+\-×÷=<>≤≥≠:/^%⊥∥≅∼])|([△∠])|(°)|([()])|(,)|( +)|(.)/g;
  // 一行開頭的標號：作答括號「( )」、題號「1.」、小題「(1)」、選項「(A)」、圈號「①」（不管元素是不是 vt-opt）
  const LABEL_PREFIX = /^\s*(?:[(（]\s*[)）]\s*)?(?:\d+\s*[.．、]|[(（]\s*(?:\d{1,2}|[A-Ea-e])\s*[)）]|[①-⑳])\s*/;
  function mathGroups(run) {
    // 一段候選字串 → 幾個算式（[start, end) 在 run 裡的位置）：兩個「數字／字母」中間只有空白就分開（a b c 是三個）
    const toks = [];
    let m;
    TOK_RE.lastIndex = 0;
    while ((m = TOK_RE.exec(run))) {
      const t = m[0], k = m[1] ? 'num' : m[2] ? 'word' : m[3] ? 'op' : m[4] ? 'pre' : m[5] ? 'post' : m[6] ? 'par' : m[7] ? 'comma' : m[8] ? 'sp' : 'x';
      toks.push({ t, k, s: m.index, e: m.index + t.length });
    }
    const groups = [];
    let cur = null, needJoin = false;
    const close = () => { if (cur) groups.push(cur); cur = null; };
    for (const tk of toks) {
      if (tk.k === 'word') {
        // 一個字母（π 也算）、2～4 個大寫（ABC）、2～3 個小寫（abc、3ab；單位 cm、常見英文字 and 除外）
        const ok = tk.t.length === 1 || /^[A-Z]{2,4}$/.test(tk.t) ||
          (/^[a-z]{2,3}$/.test(tk.t) && !/^(?:cm|mm|km|kg|mg|ml|cc|hr|min|sec|am|pm|and|or|the|of|to|in|is|on|at|by|an|for|not)$/.test(tk.t));
        if (!ok) { close(); needJoin = false; continue; }   // 英文字：不是算式，也把前後分開
      }
      if (tk.k === 'num' || tk.k === 'word') {
        // 前一個是數字／字母、中間只有空白 → 另起一個（2x 這種緊接的照接）
        if (cur && !needJoin && cur.lastAtomEnd < tk.s && run.slice(cur.lastAtomEnd, tk.s).trim() === '') close();
        if (!cur) cur = { s: tk.s, atoms: 0 };
        cur.atoms++; cur.e = tk.e; cur.lastAtomEnd = tk.e; needJoin = false;
      } else if (tk.k === 'op' || tk.k === 'comma') {
        if (cur) { cur.e = tk.e; needJoin = true; }
        else if (tk.t === '-') { cur = { s: tk.s, atoms: 0, e: tk.e, lastAtomEnd: tk.s }; needJoin = true; }   // 負號開頭
      } else if (tk.k === 'pre') {
        // △ABC、∠1：前置符號，跟後面的字母／數字接在一起
        if (cur) { cur.e = tk.e; needJoin = true; }
        else { cur = { s: tk.s, atoms: 0, e: tk.e, lastAtomEnd: tk.s }; needJoin = true; }
      } else if (tk.k === 'post') {
        if (cur) cur.e = tk.e;   // 30°
      } else if (tk.k === 'par') {
        if (cur) cur.e = tk.e; else if (tk.t === '(') { cur = { s: tk.s, atoms: 0, e: tk.e, lastAtomEnd: tk.s }; needJoin = true; }
      }
    }
    close();
    return groups.filter(g => g.atoms > 0).map(g => {
      let s = g.s, e = g.e;
      // 頭尾：沒配對的括號、結尾的運算符號與逗號、頭上除了負號與左括號以外的符號，都留在算式外
      for (let ch = true; ch;) {
        ch = false;
        const t = run.slice(s, e);
        const open = (t.match(/\(/g) || []).length, cls = (t.match(/\)/g) || []).length;
        if (/^[ ,+×÷=<>≤≥≠:/^%⊥∥≅∼°]/.test(t) || (t[0] === '(' && open > cls)) { s++; ch = true; }
        else if (/[ ,+\-×÷=<>≤≥≠:/^.⊥∥≅∼△∠]$/.test(t) || (t.endsWith(')') && cls > open)) { e--; ch = true; }
      }
      return [s, e];
    }).filter(([s, e]) => e > s && /[A-Za-z0-9π]/.test(run.slice(s, e)));
  }
  function promoteMath(root) {
    const doc = root.ownerDocument;
    const nf = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[－−＋＝＜＞（）∶：％／]/g, c => FW[c]);
    let n = 0;
    // 辨識套件只框到前半、後半在文字裡的數字（y=0 ＋ .04、x= ＋ 5）：接回前一個算式（中間沒有空白才接）
    root.querySelectorAll('section.vt-q .vt-math').forEach(el => {
      if (el.closest('template')) return;
      const nx = el.nextSibling;
      if (!nx || nx.nodeType !== 3) return;
      const tex = el.dataset.tex || '';
      // 中間最多一個空白（文字層常在算式框和後半之間多一個空白）
      const re = /\d$/.test(tex) ? /^ ?\.\d+/ : /[=+\-<>]$/.test(tex) ? /^ ?-?\d+(?:\.\d+)?/ : null;
      const g = re && re.exec(nf(nx.nodeValue));
      if (!g || /^[A-Za-z]/.test(nx.nodeValue.slice(g[0].length))) return;
      el.replaceWith(mathLike(el, tex + g[0].trim()));
      nx.nodeValue = nx.nodeValue.slice(g[0].length);
      n++;
    });
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    const nodes = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const p = t.parentElement;
      if (!p || !p.closest('section.vt-q') || p.closest('.vt-math, template, script, style, figure, h1, h2')) continue;
      if (/[A-Za-z0-9０-９]/.test(t.nodeValue)) nodes.push(t);
    }
    for (const t of nodes) {
      const raw = t.nodeValue, txt = nf(raw);   // 一對一換字，位置不變
      // 題號「1.」、選項標記「(A)」：這一段文字在題目／選項的最前面才算
      let skip = 0;
      const blk = t.parentElement.closest('h3, p, li, td, th');
      const first = blk && (() => { const w = doc.createTreeWalker(blk, 4); return w.nextNode() === t; })();
      if (first) { const m = LABEL_PREFIX.exec(txt); if (m) skip = m[0].length; }
      const spans = [];
      RUN_RE.lastIndex = skip;   // 題號、選項標記之後才找
      let m;
      while ((m = RUN_RE.exec(txt))) {
        for (const [a, b] of mathGroups(m[0])) {
          const s = m.index + a, e = m.index + b;
          if (s < skip) continue;
          const body = txt.slice(s, e), before = txt.slice(0, s), after = txt.slice(e);
          if (/^\d+$/.test(body)) {
            if (/^\s*分(?![之鐘])/.test(after)) continue;                          // 配分
            if (/第\s*$/.test(before) && /^\s*(?:小題|題|格|頁)/.test(after)) continue;   // 第 3 題
            if (/[圖表]\s*$/.test(before)) continue;                               // 圖 1
          }
          spans.push([s, e]);
        }
      }
      if (!spans.length) continue;
      const frag = doc.createDocumentFragment();
      let k = 0;
      for (const [s, e] of spans) {
        if (s > k) frag.appendChild(doc.createTextNode(raw.slice(k, s)));
        const tex = txt.slice(s, e).replace(/[×÷≤≥≠%△∠⊥∥≅∼°π]/g, c => TEX_OP[c]).replace(/\s+/g, ' ').trim();
        const el = doc.createElement('span');
        el.className = 'vt-math';
        el.dataset.tex = tex;
        el.dataset.auto = '1';
        el.textContent = '\\(' + tex + '\\)';
        frag.appendChild(el);
        k = e;
        n++;
      }
      if (k < raw.length) frag.appendChild(doc.createTextNode(raw.slice(k)));
      t.replaceWith(frag);
    }
    // 相鄰的算式接成一個：中間沒有字（9 ＋ \frac{1}{8} 是帶分數），或只有運算符號（\overline{BE}：\overline{BC}＝1:4）
    const OPS = /^\s*([=:<>+\-×÷≤≥≠]|[＝：＜＞＋－])?\s*$/;
    let merged = true;
    while (merged) {
      merged = false;
      for (const el of root.querySelectorAll('section.vt-q .vt-math')) {
        let nx = el.nextSibling, op = '';
        if (nx && nx.nodeType === 3) {
          const m = OPS.exec(nx.nodeValue);
          if (!m) continue;
          op = m[1] ? nf(m[1]) : '';
          if (!op && /\s/.test(nx.nodeValue)) continue;   // 中間只有空白：是兩個算式（a b c）
          nx = nx.nextSibling;
        }
        if (!nx || nx.nodeType !== 1 || !nx.classList.contains('vt-math')) continue;
        if (!op && !(el.dataset.auto || nx.dataset.auto)) continue;   // 辨識套件本來就分開的兩個算式不動
        const a = el.dataset.tex || '', b = nx.dataset.tex || '';
        const tex = a + (op ? op : /[A-Za-z0-9}]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? ' ' : '') + b;
        const sp = mathLike(el, tex);
        if (el.dataset.auto || nx.dataset.auto) sp.dataset.auto = '1';
        while (el.nextSibling !== nx) el.nextSibling.remove();
        nx.remove();
        el.replaceWith(sp);
        merged = true;
        break;
      }
    }
    return n;
  }
  // 照原本的算式元素做一個新的（LaTeX 換掉）：留位置、信心、裁圖；手改的點字 keepBrl 才留（data-brlsrc 不改，變成「舊的」）
  function mathLike(el, tex, keepBrl = true) {
    const s = el.cloneNode(false);
    s.dataset.tex = tex;
    for (const a of keepBrl ? ['data-checked', 'id'] : ['data-brl', 'data-brlsrc', 'data-checked', 'id']) s.removeAttribute(a);
    s.textContent = '\\(' + tex + '\\)';
    return s;
  }

  function inlineText(el) {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        if (n.classList.contains('vt-math')) {
          const tex = n.dataset.tex || n.textContent.replace(/^\\\(|\\\)$/g, '');
          const parts = splitCjk(tex);
          s += parts ? parts.map(p => p.text != null ? p.text : '\\(' + p.math + '\\)').join('') : '\\(' + tex + '\\)';
        }
        else if (tag === 'br') s += '\n';
        else if (n.hasAttribute('hidden')) continue;
        else s += inlineText(n);
      }
    }
    return joinTail(s);
  }

  function tableLine(t) {
    const cap = t.querySelector(':scope > caption');
    let h = '<table border="1">';
    for (const tr of t.querySelectorAll('tr')) {
      h += '<tr>';
      for (const c of tr.children) {
        const cs = c.colSpan > 1 ? ` colspan="${c.colSpan}"` : '';
        const rs = c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : '';
        h += `<td${cs}${rs}>` + esc(inlineText(c).trim()) + '</td>';
      }
      h += '</tr>';
    }
    return (cap ? inlineText(cap).trim() : '') + h + '</table>';
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const BLOCKS = 'h1,h2,h3,p,table';

  // 規格第 4 節：看得到的內容＝純文字；大題前後、每題前面空一行（跟辨識套件的 試卷.txt 一樣）
  //   opt.scores：'block'＝確認過的譜例輸出 🎼 樂譜區塊（文字轉點字用）；預設一律「［譜例］」（朗讀、版面整理）
  function toText(v, opt) {
    const blocks = !!(opt && opt.scores === 'block');
    const main = v.doc.querySelector('main') || v.doc.body;
    const lines = [];
    const blank = () => { if (lines.length && lines[lines.length - 1].text !== '') lines.push({ text: '', el: null }); };
    for (const el of main.querySelectorAll(BLOCKS + ',figure.vt-score')) {
      if (hiddenUp(el)) continue;
      // 譜例（規格第 4 節、3.7）：在音樂點字確認過的（有 ABC 原文、點字，雜湊對得上）→ 🎼 樂譜區塊（【樂譜】ABC【/樂譜】，
      //   文字轉點字照 scoreBrl 用音樂點字存的點字）；辨識草稿、只標的 →「［譜例］」。這些行不綁元素、標 fixed，
      //   文字轉點字存回（applyText）時不寫回，譜例要到音樂點字改
      if (el.tagName === 'FIGURE') {
        if (el.dataset.how === 'none') continue;
        const abc = blocks && el.dataset.how === 'braille' && scoreAbc(el);
        if (abc) ['【樂譜】', ...abc.split('\n'), '【/樂譜】'].forEach(t => lines.push({ text: t, el: null, score: el, fixed: true }));
        else lines.push({ text: '［譜例］', el: null, score: el, fixed: true });
        continue;
      }
      if (el.closest('table') && el.tagName !== 'TABLE') continue;
      if (el.closest('figure')) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'h2') blank();  // 試卷標題前面不空行（辨識套件把頁首的附圖標記放在標題前）
      if (tag === 'h3' && el.closest('section.vt-q')) blank();
      const grp = el.closest('section.vt-group');
      if (grp && grp.querySelector(BLOCKS) === el) blank();   // 題組（文章＋題目）前空一行
      const text = tag === 'table' ? tableLine(el) : inlineText(el);
      text.split('\n').forEach((t, k) => lines.push({ text: t, el, part: k }));
      if (tag === 'h2' || tag === 'h1') blank();
    }
    while (lines.length && lines[lines.length - 1].text === '') lines.pop();
    return { text: lines.map(l => l.text).join('\n') + '\n', lines };
  }

  // 一行文字 → 元素內容：算式包成 vt-math（同一個算式沿用原本的屬性：信心、原卷裁圖、MathML）
  // 一段文字（算式寫成 \( LaTeX \)）寫回元素。算式元素盡量沿用原本的（位置、信心、手改的點字）：
  //   LaTeX 一樣 → 照抄；是原本算式拆開的一塊、或原本算式後面多接一段 → 照原本的做；
  //   都對不上的（LaTeX 改過），跟這段裡沒用到的原本算式照順序配對（個數一樣才配，有增減就當新的）。
  //   手改的點字一起留著，data-brlsrc 是舊 LaTeX 的，各工具會提醒「點字是舊的」、不會直接用
  function setInline(el, text) {
    const olds = [...el.querySelectorAll('.vt-math')].filter(s => s.dataset.tex);
    const old = new Map();
    olds.forEach(s => { if (!old.has(s.dataset.tex)) old.set(s.dataset.tex, s); });
    const pieces = new Map();   // 拆開的算式 → 原本的元素
    for (const s of old.values()) for (const p of splitCjk(s.dataset.tex) || []) if (p.math != null && !pieces.has(p.math)) pieces.set(p.math, s);
    const ms = [...text.matchAll(MATH_RE)];
    const used = new Set(), pieceUsed = new Set(), plan = ms.map(m => {
      const tex = m[1].trim();
      let src = old.get(tex), how = 'same';
      if (!src && pieces.has(tex)) { src = pieces.get(tex); how = 'like'; }
      if (!src) { const k = [...old.keys()].find(k => tex.startsWith(k)); if (k) { src = old.get(k); how = 'like'; } }
      if (src) used.add(src);
      return { tex, src, how };
    });
    const left = olds.filter(s => !used.has(s)), miss = plan.filter(p => !p.src);
    if (left.length && left.length === miss.length) miss.forEach((p, i) => { p.src = left[i]; p.how = 'like'; });
    const doc = el.ownerDocument;
    while (el.firstChild) el.removeChild(el.firstChild);
    let k = 0;
    ms.forEach((m, i) => {
      if (m.index > k) el.appendChild(doc.createTextNode(text.slice(k, m.index)));
      const p = plan[i];
      if (p.src && p.how === 'same') el.appendChild(p.src.cloneNode(true));
      else if (p.src) {
        // 同一個原本的算式拆成好幾塊：手改的點字只留在第一塊
        el.appendChild(mathLike(p.src, p.tex, !pieceUsed.has(p.src)));
        pieceUsed.add(p.src);
      } else {
        const s = doc.createElement('span');
        s.className = 'vt-math';
        s.dataset.tex = p.tex;
        s.textContent = m[0];
        el.appendChild(s);
      }
      k = m.index + m[0].length;
    });
    if (k < text.length) el.appendChild(doc.createTextNode(text.slice(k)));
  }

  function setTable(el, line) {
    const k = line.indexOf('<table');
    const tmp = el.ownerDocument.createElement('div');
    tmp.innerHTML = line.slice(k);
    sanitize(tmp);
    const t = tmp.querySelector('table');
    if (!t) return;
    for (const r of [...el.querySelectorAll('tr')]) r.remove();
    const body = el.querySelector('tbody') || el;
    for (const tr of t.querySelectorAll('tr')) {
      const ntr = el.ownerDocument.createElement('tr');
      for (const c of tr.children) {
        const nc = el.ownerDocument.createElement(c.tagName.toLowerCase() === 'th' ? 'th' : 'td');
        if (c.colSpan > 1) nc.colSpan = c.colSpan;
        if (c.rowSpan > 1) nc.rowSpan = c.rowSpan;
        setInline(nc, c.textContent.trim());
        ntr.appendChild(nc);
      }
      body.appendChild(ntr);
    }
    const cap = line.slice(0, k).trim();
    let ce = el.querySelector(':scope > caption');
    if (cap) {
      if (!ce) { ce = el.ownerDocument.createElement('caption'); el.insertBefore(ce, el.firstChild); }
      setInline(ce, cap);
    } else if (ce) ce.remove();
  }

  // 行的對應（最長共同子序列），改過的行寫回元素；多出來的行加 <p>，少掉的行刪掉元素
  const MUSIC_BLOCK_RE = /^[ \t]*[【\[]樂譜[】\]][ \t]*\n[\s\S]*?\n[ \t]*[【\[]\/樂譜[】\]][ \t]*$/gm;
  function applyText(v, t, newText) {
    // 譜例的行（樂譜區塊、［譜例］）不寫回：比對前兩邊都拿掉
    const A = t.lines.filter(l => !l.fixed);
    const B = newText.replace(/\r\n?/g, '\n').replace(MUSIC_BLOCK_RE, '\u0000').replace(/\n+$/, '').split('\n')
      .filter(l => l !== '\u0000' && l.trim() !== '［譜例］');
    const n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i].text === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const res = { changed: 0, added: 0, removed: 0 };
    const touched = new Map();  // 元素 → 新的幾行（一個元素多行：<br>）
    let i = 0, j = 0, lastEl = null;
    const pending = [];  // [舊行, 新行] 的一段差異
    const flush = () => {
      const olds = pending.filter(p => p[0] !== null).map(p => p[0]);
      const news = pending.filter(p => p[1] !== null).map(p => p[1]);
      const k = Math.min(olds.length, news.length);
      for (let x = 0; x < k; x++) {
        const o = A[olds[x]];
        if (o.el) { (touched.get(o.el) || touched.set(o.el, A.filter(l => l.el === o.el).map(l => l.text)).get(o.el))[o.part || 0] = news[x]; res.changed++; lastEl = o.el; }
        else if (news[x].trim()) addAfter(news[x]);
      }
      for (let x = k; x < olds.length; x++) {
        const o = A[olds[x]];
        if (o.el) { (touched.get(o.el) || touched.set(o.el, A.filter(l => l.el === o.el).map(l => l.text)).get(o.el))[o.part || 0] = null; res.removed++; }
      }
      for (let x = k; x < news.length; x++) if (news[x].trim()) addAfter(news[x]);
      pending.length = 0;
    };
    const main = v.doc.querySelector('main') || v.doc.body;
    function addAfter(text) {
      const p = v.doc.createElement('p');
      setInline(p, text);
      if (lastEl && lastEl.parentNode) lastEl.parentNode.insertBefore(p, lastEl.nextSibling);
      else main.insertBefore(p, main.firstChild);
      lastEl = p;
      res.added++;
    }
    while (i < n || j < m) {
      if (i < n && j < m && A[i].text === B[j]) { flush(); if (A[i].el) lastEl = A[i].el; i++; j++; }
      else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { pending.push([null, B[j]]); j++; }
      else { pending.push([i, null]); i++; }
    }
    flush();
    for (const [el, ls] of touched) {
      const keep = ls.filter(l => l !== null);
      if (!keep.length || !keep.some(l => l.trim())) {
        // 題目那一行刪了：只刪那一行；整題都沒有看得到的內容了才把這一題拿掉
        const sec = el.closest('section.vt-q');
        el.remove();
        if (sec && ![...sec.querySelectorAll(BLOCKS)].some(e => !hiddenUp(e) && !e.closest('figure'))) sec.remove();
        continue;
      }
      if (el.tagName === 'TABLE') setTable(el, keep.join(''));
      else {
        setInline(el, keep.join('\n'));
        // 多行：換行改回 <br>
        for (const tn of [...el.childNodes]) {
          if (tn.nodeType !== 3 || !tn.nodeValue.includes('\n')) continue;
          const parts = tn.nodeValue.split('\n');
          const frag = v.doc.createDocumentFragment();
          parts.forEach((s, x) => { if (x) frag.appendChild(v.doc.createElement('br')); frag.appendChild(v.doc.createTextNode(s)); });
          tn.replaceWith(frag);
        }
      }
    }
    return res;
  }

  // 讀音：先拿掉舊的 data-reading，再依 fn(行文字, 位置) 重新包（fn 回傳注音字串或 null）
  function applyReadings(v, fn) {
    const main = v.doc.querySelector('main') || v.doc.body;
    main.querySelectorAll('span[data-reading]').forEach(s => s.replaceWith(...s.childNodes));
    main.normalize();
    let n = 0;
    for (const el of main.querySelectorAll('h1,h2,h3,p,caption,td,th')) {
      if (hiddenUp(el) || el.closest('figure')) continue;
      if ((el.tagName === 'TD' || el.tagName === 'TH') && el.querySelector('p')) continue;
      const line = inlineText(el);
      // 字的位置 → 文字節點（算式範圍不算）
      const map = [];
      (function walk(e) {
        for (const c of e.childNodes) {
          if (c.nodeType === 3) for (let k = 0; k < c.nodeValue.length; k++) map.push([c, k]);
          else if (c.nodeType === 1) {
            if (c.classList.contains('vt-math')) { const len = ('\\(' + (c.dataset.tex || '') + '\\)').length; for (let k = 0; k < len; k++) map.push(null); }
            else if (c.tagName === 'BR') map.push(null);
            else if (!c.hasAttribute('hidden')) walk(c);
          }
        }
      })(el);
      const hits = [];
      for (let k = 0; k < line.length && k < map.length; k++) {
        if (!map[k]) continue;
        const r = fn(line, k);
        if (r) hits.push([map[k][0], map[k][1], r]);
      }
      // 從後面包起來，前面的位置才不會跑掉
      for (let x = hits.length - 1; x >= 0; x--) {
        const [tn, off, r] = hits[x];
        const after = tn.splitText(off);
        after.splitText(1);
        const s = v.doc.createElement('span');
        s.dataset.reading = r;
        after.replaceWith(s);
        s.appendChild(after);
        n++;
      }
    }
    return n;
  }

  // 讀出所有讀音：[{ line（所在元素的文字）, index, reading }]
  function readings(v) {
    const out = [];
    const main = v.doc.querySelector('main') || v.doc.body;
    for (const s of main.querySelectorAll('span[data-reading]')) {
      const el = s.closest('h1,h2,h3,p,caption,td,th');
      if (!el || hiddenUp(el)) continue;
      const line = inlineText(el);
      // 這個讀音在行裡的位置：從元素開頭算到這個 span
      let idx = 0, found = -1;
      (function walk(e) {
        for (const c of e.childNodes) {
          if (found >= 0) return;
          if (c === s) { found = idx; return; }
          if (c.nodeType === 3) idx += c.nodeValue.length;
          else if (c.nodeType === 1) {
            if (c.classList.contains('vt-math')) idx += ('\\(' + (c.dataset.tex || '') + '\\)').length;
            else if (c.tagName === 'BR') idx += 1;
            else if (!c.hasAttribute('hidden')) walk(c);
          }
        }
      })(el);
      if (found >= 0) out.push({ line, index: found, text: s.textContent, reading: s.dataset.reading });
    }
    return out;
  }

  function serialize(v, tool, note) {
    const now = new Date();
    const pad = x => String(x).padStart(2, '0');
    const off = -now.getTimezoneOffset();
    const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
      `${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
    const meta = Object.assign({ format: 'vtdoc', version: 1 }, v.meta);
    meta.modified = iso;
    meta.history = (meta.history || []).concat([{ tool, time: iso, note: note || '' }]);
    v.meta = meta;
    let m = v.doc.getElementById('vtdoc-meta');
    if (!m) {
      m = v.doc.createElement('script');
      m.type = 'application/json';
      m.id = 'vtdoc-meta';
      v.doc.head.appendChild(m);
    }
    m.textContent = JSON.stringify(meta).replace(/<\//g, '<\\/');
    return '<!DOCTYPE html>\n' + v.doc.documentElement.outerHTML + '\n';
  }

  function title(v) {
    return (v.meta && v.meta.title) || (v.doc.querySelector('h1') || {}).textContent || v.doc.title || '';
  }

  // 手改點字的來源雜湊（規格 3.4、3.7）：FNV-1a 32 位元，算 UTF-8 位元組，8 位十六進位
  function hash(s) {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(s || '')) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }

  // 算式手改的點字：{ hand: Map(LaTeX → 點字)（data-brlsrc 對得上的），stale: [LaTeX…]（算式後來改過、手改的點字是舊的） }
  function mathBrl(v) {
    const hand = new Map(), stale = [];
    (v.doc.querySelector('main') || v.doc.body).querySelectorAll('.vt-math[data-brl]').forEach(el => {
      if (el.closest('template')) return;
      const tex = (el.dataset.tex || el.textContent.replace(/^\\\(|\\\)$/g, '')).trim();
      if (!tex || !el.dataset.brl) return;
      if (el.dataset.brlsrc === hash(tex)) { if (!hand.has(tex)) hand.set(tex, el.dataset.brl); }
      else stale.push(tex);
    });
    return { hand, stale };
  }

  // 譜例在音樂點字確認過的 ABC 原文（ABC、點字的 data-src／data-brlsrc 都等於現在 MusicXML 的雜湊）；沒有 → ''
  function scoreAbc(fig) {
    const x = fig.querySelector('script[type="application/vnd.recordare.musicxml+xml"]');
    const a = fig.querySelector('script[type="text/vnd.abc"]');
    if (!x || !a || !fig.dataset.brl) return '';
    const h = hash(x.textContent);
    if (a.dataset.src !== h || fig.dataset.brlsrc !== h) return '';
    return a.textContent.replace(/<\\\/script/gi, '</script').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  }
  // 譜例的點字：{ hand: Map(ABC → 點字（換行分行）), draft: 辨識草稿還沒在音樂點字確認的塊數, stale: 點字是舊的（MusicXML 後來被改過）的塊數, total }
  function scoreBrl(v) {
    const hand = new Map();
    let draft = 0, stale = 0, total = 0;
    (v.doc.querySelector('main') || v.doc.body).querySelectorAll('figure.vt-score').forEach(fig => {
      if (fig.closest('template') || hiddenUp(fig) || fig.dataset.how === 'none') return;
      total++;
      const abc = scoreAbc(fig);
      if (abc) { if (fig.dataset.how === 'braille' && !hand.has(abc.trim())) hand.set(abc.trim(), fig.dataset.brl); return; }
      const x = fig.querySelector('script[type="application/vnd.recordare.musicxml+xml"]');
      if (x && x.dataset.engine) draft++;
      else if (x && fig.dataset.brl) stale++;
    });
    return { hand, draft, stale, total };
  }

  window.vitoolsVtdoc = { isVtdoc, parse, toText, scoreBrl, applyText, applyReadings, readings, serialize, title, inlineText, source, box, hash, mathBrl, splitCjk, splitMathEls, promoteMath, setInline, arcTex, fixTex };
})();
