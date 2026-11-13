// 算式辨識（MFR）結果的整理，跟 vi-tools 辨識套件一樣：
//   post(raw)：Pix2Text（MIT License, breezedeus）latex_ocr.py 的後處理（辨識套件 app/exam/pix2text_post.py）
//   tidy(tex)：辨識套件 app/exam/mathocr.py 的 tidy（整理成人手打的樣子）
//   vitoolsMfrTidy.clean(raw) = tidy(post(raw))
// 網頁、Web Worker（importScripts）、Node（require）都能用。改了要跟辨識套件那兩個檔一起改。
(function (root) {
  'use strict';
  const W = '[\\p{L}\\p{N}_]';   // Python 的 \w（Unicode）
  const D = '\\p{Nd}';           // Python 的 \d（Unicode）
  const isAlpha = c => c !== undefined && /\p{L}/u.test(c);
  const ASCII = /[A-Za-z]/;

  // ---------- Pix2Text post_process ----------
  function removeRedundantScript(t) {
    t = t.replace(/^\^\s*\{\s*(.*?)\s*\}/, '$1');
    t = t.replace(/^_\s*\{\s*(.*?)\s*\}/, '$1');
    return t.trim();
  }
  function replaceIllegalSymbols(t) {
    return t.replace(/\\\./g, '\\ .').replace(/\\=/g, '\\ =').replace(/\\-/g, '\\ -').replace(/\\~/g, '\\ ~');
  }
  const EMPTY = ['\\\\hat', '\\^', '_', '\\\\text', '\\\\tilde', '\\\\bar', '\\\\vec', '\\\\acute', '\\\\grave', '\\\\breve',
    '\\\\overline', '\\\\dot', '\\\\ddot', '\\\\widehat', '\\\\widetilde'].map(p => new RegExp(p + '\\s*\\{\\s*\\}', 'g'));
  function removeEmptyText(t) {
    EMPTY.forEach(re => { t = t.replace(re, ''); });
    return t.trim();
  }
  const TRAIL = /(?:\\ +|\\quad\s*|\\qquad\s*|\\,\s*|\\:\s*|\\;\s*|\\enspace\s*|\\thinspace\s*|\\!\s*)+$/;
  function removeTrailingWhitespace(t) { return t.replace(TRAIL, '').trim(); }
  function removeUnnecessarySpaces(t) {
    t = t.replace(/\\([a-zA-Z]+) (?=[a-zA-Z])/g, '\\$1 ');
    t = t.replace(/\\([a-zA-Z]+)\s+(?![a-zA-Z])/g, '\\$1');
    t = t.replace(/(\{)\s+/g, '$1');
    t = t.replace(/\s+(\})/g, '$1');
    t = t.replace(/(?<=[^\\])\s*([+\-=])\s*/g, '$1');
    t = t.replace(/\s*(\^|_)\s*/g, '$1');
    return t;
  }
  function findAll(latex, lr) {
    const out = [], pre = lr.length + 1;
    const re = new RegExp('\\\\' + lr + '\\s*\\S', 'g');
    let m;
    while ((m = re.exec(latex))) {
      const start = m.index;
      let end = start + m[0].length;
      if (ASCII.test(latex[end - 1])) continue;
      while (latex[end - 1] === '\\' || latex[end - 1] === ' ') {
        end += 1;
        while (end < latex.length && isAlpha(latex[end])) end += 1;
      }
      out.push({ str: latex.slice(start + pre, end).trim(), start, end });
    }
    out.sort((a, b) => a.start - b.start);
    return out;
  }
  const PAIRS = new Set([['', ''], ['(', ')'], ['\\{', '.'], ['⟮', '⟯'], ['[', ']'], ['⟨', '⟩'], ['{', '}'], ['⌈', '⌉'],
    ['┌', '┐'], ['⌊', '⌋'], ['└', '┘'], ['⎰', '⎱'], ['lt', 'gt'], ['lang', 'rang'], ['langle', 'rangle'],
    ['lbrace', 'rbrace'], ['lBrace', 'rBrace'], ['lbracket', 'rbracket'], ['lceil', 'rceil'], ['lcorner', 'rcorner'],
    ['lfloor', 'rfloor'], ['lgroup', 'rgroup'], ['lmoustache', 'rmoustache'], ['lparen', 'rparen'], ['lvert', 'rvert'],
    ['lVert', 'rVert']].map(p => p[0] + '\u0001' + p[1]));
  function matchLeftRight(a, b) {   // 照原版：a 去掉前 5 個字、b 去掉前 6 個字
    a = a.trim().replace(/ /g, '').slice(5);
    b = b.trim().replace(/ /g, '').slice(6);
    while (a && b && a[0] === b[0]) { a = a.slice(1); b = b.slice(1); }
    return PAIRS.has(a + '\u0001' + b);
  }
  function blank(latex, start, len) { return latex.slice(0, start) + ' '.repeat(len) + latex.slice(start + len); }
  function fixLatex(latex) {
    const L = findAll(latex, 'left'), R = findAll(latex, 'right');
    L.forEach(l => {
      for (const r of R) {
        if (!r.matched && r.start > l.start && matchLeftRight(r.str, l.str)) { l.matched = r.matched = true; break; }
      }
    });
    L.forEach(l => { if (!l.matched) latex = blank(latex, l.start, 5); });
    R.forEach(r => { if (!r.matched) latex = blank(latex, r.start, 6); });
    return latex.replace(/\s+/g, ' ').trim();
  }
  function post(text) {
    text = removeRedundantScript(text);
    text = removeTrailingWhitespace(text);
    text = replaceIllegalSymbols(text);
    for (let i = 0; i < 10; i++) {
      const n = removeEmptyText(text);
      if (n === text) break;
      text = n;
    }
    text = fixLatex(text);
    text = removeUnnecessarySpaces(text);
    return text.trim();
  }

  // ---------- 辨識套件 mathocr.tidy ----------
  const WRAP = /\\(?:mathrm|mathbf|boldsymbol|textbf|bm|mathit|mathsf|underline|mathring|mathtt|mathcal|operatorname|texttt|textsc|textrm|textit|textsf)\s*\{/;
  function unwrap(t) {
    for (;;) {
      const m = WRAP.exec(t);
      if (!m) return t;
      let i = m.index + m[0].length, d = 1;
      while (i < t.length && d) { d += t[i] === '{' ? 1 : t[i] === '}' ? -1 : 0; i++; }
      t = t.slice(0, m.index) + t.slice(m.index + m[0].length, i - 1) + t.slice(i);
    }
  }
  const SPACES = /\\[!,;:> ]|~|\\q?quad/g;
  const R = {
    oneRow: new RegExp('\\\\begin\\{(array|matrix)\\}\\s*(?:\\{[lcr ]*\\}|[lcr](?!' + W + '))?([^\\\\]*?)\\\\end\\{\\1\\}', 'gu'),
    sf: new RegExp('\\\\(?:mathsf|mathring)\\s*(?=' + W + ')', 'gu'),
    bf: new RegExp('\\\\(?:bf|mathbf|boldsymbol|bm)\\s*(?=' + W + ')', 'gu'),
    bfg: /\{\\bf\s*([^{}]*)\}/g,
    word: new RegExp('(?<![\\p{L}\\p{N}_}^_])\\{(' + W + '+)\\}', 'gu'),
    left: /\\left\s*([(\[|.])/g,
    right: /\\right\s*([)\]|.])/g,
    font: /\\(?:mathrm|mathbf|boldsymbol|textbf|bm|mathit|it)\s*\{([^{}]*)\}/g,
    dbl: /\{\{([^{}]*)\}\}/g,
    font2: new RegExp('\\\\(?:boldsymbol|textbf|bm|it|tt|rm|sc|sf)(?!' + W + ')\\s*', 'gu'),
    cdot: /\\cdot(?![a-zA-Z])/g,
    par: /\/\s*\//g,
    tri: /\\(triangle|angle)(?=[A-Z])/g,
    cases: /\\?\{\s*\\begin\{(?:matrix|array)\}(?:\s*\{[lcr ]*\})?(.*?)\\end\{(?:matrix|array)\}\s*\.?/gs,
    casesIn: /\{([^{}\x00]*)\}(?=\s*(?:\x00|\\end\{cases\}))/g,
    casesHead: /(?<=\\begin\{cases\})\s*\{/g,
    endRow: /\s*\\\\\s*\\end\{/g,
    dd: new RegExp('(' + D + ') (' + D + ')', 'gu'),
    ddot: new RegExp('(' + D + ') \\. (' + D + ')', 'gu'),
    sup: new RegExp('\\^\\{(' + W + ')\\}', 'gu'),
    sub: new RegExp('_\\{(' + W + ')\\}', 'gu'),
  };
  function tidy(tex) {
    tex = unwrap(tex);
    tex = tex.replace(R.oneRow, '$2');
    tex = tex.replace(R.sf, '');
    tex = tex.split('℃').join('^{\\circ} C').split('•C').join('^{\\circ} C');
    let t = tex.split('\\\\').join('\x00').split('\\left\\{').join('\\{').split('\\right\\}').join('\\}');
    t = t.replace(SPACES, ' ');
    t = t.replace(R.bf, '');
    t = t.replace(R.bfg, '$1');
    t = t.replace(R.word, '$1');
    t = t.replace(R.left, '$1');
    t = t.replace(R.right, '$1');
    t = t.split('\\left.').join('').split('\\right.').join('');
    t = t.split('\\cfrac').join('\\frac').split('\\dfrac').join('\\frac');
    for (let i = 0; i < 4; i++) {
      t = t.replace(R.font, '$1');
      t = t.replace(R.dbl, '{$1}');
    }
    t = t.replace(R.font2, '');
    t = t.replace(R.cdot, ',');
    t = t.replace(R.par, '\\parallel ').split('\\bot').join('\\perp');
    t = t.replace(R.tri, '\\$1 ');
    // 「{\triangle} A B C」→「\triangle ABC」（vtdoc.js triTex 同規則）
    t = t.replace(/\{\s*\\(triangle|angle)\s*\}/g, '\\$1 ').replace(/\\(triangle|angle)\s*\{\s*([A-Z](?:\s*[A-Z]){0,2})\s*\}/g, '\\$1 $2')
      .replace(/\\(triangle|angle)(?![A-Za-z])\s*([A-Z](?:\s*[A-Z]){0,2})(?![A-Za-z])/g, (m, c, l) => '\\' + c + ' ' + l.replace(/\s+/g, ''));
    t = t.replace(R.cases, (m, g) => '\\begin{cases}' + g + '\\end{cases}');
    t = t.replace(R.casesIn, '$1');
    t = t.replace(R.casesHead, '');
    t = t.split('\x00').join(' \\\\ ');
    t = t.replace(R.endRow, ' \\end{');
    t = t.replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 4; i++) {
      t = t.replace(R.dd, '$1$2');
      t = t.replace(R.ddot, '$1.$2');
    }
    t = t.replace(/\{\s+/g, '{');
    t = t.replace(/\s+\}/g, '}');
    t = t.replace(R.sup, '^$1');
    t = t.replace(R.sub, '_$1');
    // 弧 AB：\widehat{AB}（2～3 個大寫字母）、\overparen{…} → \overset{\frown}{AB}（vtdoc.js arcTex 同規則）
    t = t.replace(/\\(?:overparen|wideparen|overarc|arc)\s*\{\s*([^{}]+?)\s*\}|\\widehat\s*\{\s*([A-Z](?:\s*[A-Z]){1,2})\s*\}/g,
      (m, a, b) => '\\overset{\\frown}{' + (a || b).replace(/\s+/g, '') + '}');
    // 單獨一個反斜線：`{\}`、結尾多一個 `\`（vtdoc.js loneBsTex 同規則）
    t = t.replace(/(^|[^\\])\{\s*\\\s*\}/g, '$1').replace(/\\protect(?![A-Za-z])\s*\.?\s*/g, '').replace(/(?:\s*\\)+\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    return t;
  }

  const api = { post, tidy, clean: raw => tidy(post(raw)) };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.vitoolsMfrTidy = api;
})(typeof self !== 'undefined' ? self : this);
