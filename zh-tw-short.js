// 縮點頁（zh-tw-short.html）的轉換：國語點字對照縮點
//   國字、全形標點：prn-core.js 的 zhChar（同「文字轉點字」的 parseCtb；loadZh 要帶 { nvda: true }，標點照 zh-tw.ctb）
//   英數與其他符號：照 zh-tw.ctb 依序 include 的 en-us-comp8.ctb（電腦八點），字元定義以第一次為準（同 liblouis），
//         和 NVDA 點顯器上看到的一樣（例：● 在 en-us-comp8 先定義成 16，zh-tw.ctb 後面的定義不算）
//   縮點：國語點字逐字轉換，規則同 NVDA-brailleTableSwitcher 的 tools/build_short_ctb.py（zh-tw-short.ctb）
//         改規則時兩邊要一起改；規則文件在 zh-tw-short repo 的 rules.md
// 瀏覽器：window.ZhTwShort（要先載入 prn-core.js）；node：module.exports(PrnCore)
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory;
  else root.ZhTwShort = factory(root.PrnCore);
})(typeof window !== 'undefined' ? window : this, function (PrnCore) {
  'use strict';
  const CHAR_OPS = new Set(['letter', 'lowercase', 'uppercase', 'punctuation', 'sign', 'math', 'digit', 'litdigit', 'space']);
  const ESC = { '\\s': ' ', '\\t': '\t' };
  const defs = new Map();
  const isZh = c => /[㐀-鿿]/.test(c);   // 範圍同 zh-tw-short.ctb 轉換的國字

  // files：{ 檔名: 內容 }，從 zh-tw.ctb 依 include 展開，收集國字以外的字元定義（liblouis：以第一次定義為準）
  function loadCharDefs(files) {
    defs.clear();
    const seen = new Set();
    (function parse(name) {
      if (seen.has(name) || !(name in files)) return;
      seen.add(name);
      for (const raw of files[name].split(/\r?\n/)) {
        const parts = raw.trim().split(/\s+/);
        if (parts[0] === 'nofor') continue;               // 只用在反向翻譯
        if (parts[0] === 'noback') parts.shift();         // 只用在正向翻譯，照樣收
        const op = parts[0].toLowerCase();
        if (op === 'include') { parse(parts[1]); continue; }
        if (!CHAR_OPS.has(op) || parts.length < 3 || !/^[\d-]+$/.test(parts[2])) continue;
        const tok = parts[1], m = tok.match(/^\\x([0-9a-fA-F]{1,6})$/);
        const ch = ESC[tok] || (m ? String.fromCodePoint(parseInt(m[1], 16)) : tok.length === 1 ? tok : null);
        if (ch === null || isZh(ch) || defs.has(ch)) continue;
        defs.set(ch, PrnCore.dotsToUnicode(parts[2], true));
      }
    })('zh-tw.ctb');
  }


  // 文字 → { normal, short, missing }；opts.supplement 時先套多音字補充規則（整詞）
  function translate(text, opts = {}) {
    const chars = [...text], d = PrnCore.zhData(), missing = [];
    let normal = '', short = '';
    const push = (b, zh) => { normal += b; short += zh ? (shortBraille(b) ?? b) : b; };
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === '\n') { push('\n'); continue; }
      if (opts.supplement && isZh(c)) {
        let best = null;
        for (const [w, b] of d.supplement)
          if ((!best || w.length > best[0].length) && chars.slice(i, i + [...w].length).join('') === w) best = [w, b];
        if (best) { push(best[1], true); i += [...best[0]].length - 1; continue; }
      }
      if (c.codePointAt(0) >= 0x2800 && c.codePointAt(0) <= 0x28ff) { push(c); continue; }
      // 國字和有前後文規則的符號交給 zhChar，其他照第一次的字元定義
      const plain = !isZh(c) && !d.ctx.has(c) && !d.correctCtx.has(c) && !(c in d.correct);
      const b = (plain && defs.get(c)) || PrnCore.zhChar(chars, i);
      if (b) push(b, isZh(c));
      else if (c.trim()) missing.push(c);
    }
    return { normal, short, missing };
  }

  // ── 縮點 ──
  const INITIALS = new Set(['135', '1234', '134', '12345', '145', '124', '1345', '14', '13', '123', '1235',
    '1', '12', '24', '1245', '125', '245', '15']);
  const FINALS = new Set(['123456', '12346', '12356', '1236', '12456', '1246', '1256', '126', '13456', '1346',
    '1356', '136', '1456', '146', '156', '16', '234', '2345', '23456', '2346', '235', '2356', '236', '2456', '246',
    '25', '256', '26', '34', '345', '346', '35', '356', '45', '456', '46']);
  const TONES = { '3': 1, '2': 2, '4': 3, '5': 4, '1': 5 };   // 國語點字調號那一方 → 聲調
  const cellDots = c => { const b = c.codePointAt(0) - 0x2800; let s = ''; for (let k = 0; k < 8; k++) if (b >> k & 1) s += k + 1; return s || '0'; };

  // 一串「聲母-韻母-調號」點字轉成縮點；有無法解析的部分就傳回 null（照原樣）
  function shortBraille(brl) {
    const cells = [...brl].map(cellDots), out = [];
    let i = 0;
    while (i < cells.length) {
      // 聲母可能帶原表區分代名詞的 7／8 點（他 1247、她 1248、你 13457、妳 13458），照樣保留
      let ini = INITIALS.has(cells[i].replace(/[78]/g, '')) && i + 2 < cells.length && FINALS.has(cells[i + 1]) ? cells[i] : null;
      const j = ini ? i + 1 : i;
      if (j + 1 >= cells.length || !FINALS.has(cells[j]) || !(cells[j + 1] in TONES)) return null;
      let fin = cells[j];
      const tone = TONES[cells[j + 1]];
      if (tone === 5 && ini && !ini.includes('8')) ini += '8';
      else if (tone >= 2 && tone <= 4) fin += { 2: '7', 3: '78', 4: '8' }[tone];
      if (ini) out.push(ini);
      out.push(fin);
      i = j + 2;
    }
    return out.map(PrnCore.dotsToUnicode).join('');
  }

  return { loadCharDefs, translate, shortBraille, cellDots };
});
