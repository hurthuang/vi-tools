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
  const SCRIPT_TYPES = new Set(['application/json', 'application/vnd.recordare.musicxml+xml', 'application/pdf',
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
        const m = /^\\(?:[A-Za-z]+|[\s\S])/.exec(tex.slice(i));
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
  //   新的算式沿用原本的信心、裁圖、位置；確認標記、手改點字、MathML 不留 → { split, joined }
  function splitMathEls(root) {
    let split = 0, joined = 0;
    root.querySelectorAll('.vt-math').forEach(el => {
      if (el.closest('template')) return;
      const tex = el.dataset.tex || el.textContent.replace(/^\\\(|\\\)$/g, '');
      const parts = splitCjk(tex);
      if (!parts) return;
      const doc = el.ownerDocument;
      for (const p of parts) {
        if (p.text != null) { el.parentNode.insertBefore(doc.createTextNode(p.text), el); continue; }
        el.parentNode.insertBefore(mathLike(el, p.math), el);
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
    return { split, joined };
  }
  function mathLike(el, tex) {
    const s = el.cloneNode(false);
    s.dataset.tex = tex;
    for (const a of ['data-brl', 'data-brlsrc', 'data-checked', 'id']) s.removeAttribute(a);
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
  function toText(v) {
    const main = v.doc.querySelector('main') || v.doc.body;
    const lines = [];
    const blank = () => { if (lines.length && lines[lines.length - 1].text !== '') lines.push({ text: '', el: null }); };
    for (const el of main.querySelectorAll(BLOCKS)) {
      if (hiddenUp(el)) continue;
      if (el.closest('table') && el.tagName !== 'TABLE') continue;
      if (el.closest('figure')) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'h2') blank();  // 試卷標題前面不空行（辨識套件把頁首的附圖標記放在標題前）
      if (tag === 'h3' && el.closest('section.vt-q')) blank();
      const text = tag === 'table' ? tableLine(el) : inlineText(el);
      text.split('\n').forEach((t, k) => lines.push({ text: t, el, part: k }));
      if (tag === 'h2' || tag === 'h1') blank();
    }
    while (lines.length && lines[lines.length - 1].text === '') lines.pop();
    return { text: lines.map(l => l.text).join('\n') + '\n', lines };
  }

  // 一行文字 → 元素內容：算式包成 vt-math（同一個算式沿用原本的屬性：信心、原卷裁圖、MathML）
  function setInline(el, text) {
    const old = new Map();
    el.querySelectorAll('.vt-math').forEach(s => { if (s.dataset.tex && !old.has(s.dataset.tex)) old.set(s.dataset.tex, s); });
    const pieces = new Map();   // 拆開的算式 → 原本的元素
    for (const s of old.values()) for (const p of splitCjk(s.dataset.tex) || []) if (p.math != null && !pieces.has(p.math)) pieces.set(p.math, s);
    const doc = el.ownerDocument;
    while (el.firstChild) el.removeChild(el.firstChild);
    let k = 0;
    for (const m of text.matchAll(MATH_RE)) {
      if (m.index > k) el.appendChild(doc.createTextNode(text.slice(k, m.index)));
      const tex = m[1].trim();
      const prev = old.get(tex);
      if (prev) el.appendChild(prev.cloneNode(true));
      else if (pieces.has(tex)) el.appendChild(mathLike(pieces.get(tex), tex));
      else if ([...old.keys()].some(k => tex.startsWith(k))) el.appendChild(mathLike(old.get([...old.keys()].find(k => tex.startsWith(k))), tex));
      else {
        const s = doc.createElement('span');
        s.className = 'vt-math';
        s.dataset.tex = tex;
        s.textContent = m[0];
        el.appendChild(s);
      }
      k = m.index + m[0].length;
    }
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
  function applyText(v, t, newText) {
    const A = t.lines, B = newText.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
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

  window.vitoolsVtdoc = { isVtdoc, parse, toText, applyText, applyReadings, readings, serialize, title, inlineText, source, box, hash, mathBrl, splitCjk, splitMathEls, setInline };
})();
