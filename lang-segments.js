// 中英切段：把文字切成中文段與英文段，朗讀時各用各的語音（英文用英文語音，避免中文語音的腔調）
// 規則：
//   英文段 = 連續的英文單字（中間只隔空白，可夾數字，例：Windows 10 Pro），後面緊接的標點跟著英文段
//   連續英文單字數 >= minWords 才切成英文段；少於的（例如單獨的縮寫 PDF、NVDA）留在中文段，由中文語音念
//   數字、標點跟著前一段；相鄰同語言的段合併
// 對外：window.vitoolsLangSegments = { split(text, { minWords = 2 }) → [{ lang: 'zh' | 'en', text }] }
(function () {
  'use strict';

  const WORD = "[A-Za-z][A-Za-z0-9'\u2019\\-]*";
  const NUM = '[0-9]+(?:[.,][0-9]+)*';
  // 英文串：以英文單字開頭，之後可接空白隔開的單字或數字；最後緊接的英文標點一起算
  const RUN = new RegExp(`${WORD}(?:[ \\t]+(?:${WORD}|${NUM}))*[.,!?;:'"\u2019)]*`, 'g');

  function split(text, opts) {
    const minWords = (opts && opts.minWords) || 2;
    const out = [];
    const push = (lang, s) => {
      if (!s) return;
      const last = out[out.length - 1];
      if (last && last.lang === lang) last.text += s;
      else out.push({ lang, text: s });
    };
    let pos = 0, m;
    RUN.lastIndex = 0;
    while ((m = RUN.exec(text)) !== null) {
      const words = m[0].match(new RegExp(WORD, 'g')) || [];
      if (words.length < minWords) continue;
      push('zh', text.slice(pos, m.index));
      push('en', m[0]);
      pos = m.index + m[0].length;
    }
    push('zh', text.slice(pos));
    return out;
  }

  const api = { split };
  if (typeof window !== 'undefined') window.vitoolsLangSegments = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
