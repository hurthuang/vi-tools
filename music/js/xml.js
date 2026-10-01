/*
 * 精簡的 XML 解析與輸出（MusicXML 用；瀏覽器與 Node 皆可執行）。
 * 節點：{ name, attrs: {}, children: [], text }
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});

  const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  function decode(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isNaN(cp) ? m : String.fromCodePoint(cp);
      }
      return e in ENT ? ENT[e] : m;
    });
  }
  function encode(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function parse(text) {
    const root = { name: '#document', attrs: {}, children: [], text: '' };
    const stack = [root];
    let i = 0;
    const n = text.length;
    if (text.charCodeAt(0) === 0xfeff) i = 1;
    while (i < n) {
      const lt = text.indexOf('<', i);
      const top = stack[stack.length - 1];
      if (lt < 0) {
        top.text += decode(text.slice(i));
        break;
      }
      if (lt > i) top.text += decode(text.slice(i, lt));
      if (text.startsWith('<!--', lt)) {
        const e = text.indexOf('-->', lt + 4);
        i = e < 0 ? n : e + 3;
        continue;
      }
      if (text.startsWith('<![CDATA[', lt)) {
        const e = text.indexOf(']]>', lt + 9);
        top.text += text.slice(lt + 9, e < 0 ? n : e);
        i = e < 0 ? n : e + 3;
        continue;
      }
      if (text[lt + 1] === '?') {
        const e = text.indexOf('?>', lt + 2);
        i = e < 0 ? n : e + 2;
        continue;
      }
      if (text[lt + 1] === '!') {
        // DOCTYPE（可能含 [ ... ] 內部子集）
        let depth = 0;
        let k = lt + 2;
        for (; k < n; k++) {
          if (text[k] === '[') depth++;
          else if (text[k] === ']') depth--;
          else if (text[k] === '>' && depth <= 0) break;
        }
        i = k + 1;
        continue;
      }
      if (text[lt + 1] === '/') {
        const e = text.indexOf('>', lt);
        const name = text.slice(lt + 2, e).trim();
        // 容錯：往上找到同名元素為止
        for (let k = stack.length - 1; k > 0; k--) {
          if (stack[k].name === name) {
            stack.length = k;
            break;
          }
        }
        i = e + 1;
        continue;
      }
      // 開始標籤
      let k = lt + 1;
      let quote = null;
      for (; k < n; k++) {
        const c = text[k];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      let body = text.slice(lt + 1, k);
      const selfClose = body.endsWith('/');
      if (selfClose) body = body.slice(0, -1);
      const m = /^([^\s/>]+)/.exec(body);
      const el = { name: m ? m[1] : '', attrs: {}, children: [], text: '' };
      const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = re.exec(body))) el.attrs[a[1]] = decode(a[3] !== undefined ? a[3] : a[4]);
      top.children.push(el);
      if (!selfClose) stack.push(el);
      i = k + 1;
    }
    return root;
  }

  // 查詢工具
  function child(el, name) {
    if (!el) return null;
    for (const c of el.children) if (c.name === name) return c;
    return null;
  }
  function children(el, name) {
    return el ? el.children.filter((c) => !name || c.name === name) : [];
  }
  function path(el, p) {
    let cur = el;
    for (const name of p.split('/')) {
      cur = child(cur, name);
      if (!cur) return null;
    }
    return cur;
  }
  function textOf(el, p) {
    const e = p ? path(el, p) : el;
    return e ? e.text.trim() : '';
  }

  /** 以巢狀陣列產生 XML：['name', {attrs}, ...children] 或字串（文字內容）。 */
  function build(node, indent) {
    indent = indent || '';
    if (node == null || node === false) return '';
    if (typeof node === 'string' || typeof node === 'number') return indent + encode(node) + '\n';
    const [name, maybeAttrs, ...rest] = node;
    let attrs = {};
    let kids = rest;
    if (maybeAttrs && typeof maybeAttrs === 'object' && !Array.isArray(maybeAttrs)) attrs = maybeAttrs;
    else kids = [maybeAttrs].concat(rest);
    kids = kids.filter((k) => k != null && k !== false && k !== undefined);
    const at = Object.keys(attrs)
      .filter((k) => attrs[k] != null)
      .map((k) => ' ' + k + '="' + encode(attrs[k]) + '"')
      .join('');
    if (!kids.length) return indent + '<' + name + at + '/>\n';
    if (kids.length === 1 && (typeof kids[0] === 'string' || typeof kids[0] === 'number'))
      return indent + '<' + name + at + '>' + encode(kids[0]) + '</' + name + '>\n';
    return indent + '<' + name + at + '>\n' + kids.map((k) => build(k, indent + '  ')).join('') + indent + '</' + name + '>\n';
  }

  MB.xml = { parse, child, children, path, textOf, build, encode };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
