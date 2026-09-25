// 算式報讀：把文字裡的 LaTeX 算式轉成中文報讀文字（例：x^2-5x+6=0 →「x 平方 減 5 x 加 6; 等於 0」）
// 流程：LaTeX →（MathJax）MathML →（MathCAT，mathcat/ 裡的 WASM）報讀文字；MathCAT 第一次用到才載入（約 3.5MB）
// 對外：window.vitoolsMathSpeech = { findMath, hasMath, toSpeech, load, loadMathJax }
//   loadMathJax() 也可單獨用來渲染數學式（文件整理「數學式（聽報讀）」模式）
(function () {
  'use strict';

  // ── 找算式位置 → [{ start, end, tex, display }]
  // opts.pattern：用頁面自己的算式正規式（例如數學點字頁轉點字用的 MATH_RE），讓報讀和轉點字認得的算式一致；
  //               捕捉群組取第一個有值的當作 LaTeX
  // 否則認 \( \)、\[ \]、$$ $$；opts.dollar 為 true 時也認單個 $...$，並照 Pandoc 規則避免把金額當算式：
  //   開頭 $ 後面不是空白、結尾 $ 前面不是空白且後面不接數字、不跨行；\$ 是錢字號本身
  function findMath(text, opts) {
    opts = opts || {};
    const out = [];
    if (opts.pattern) {
      const re = new RegExp(opts.pattern.source, opts.pattern.flags.includes('g') ? opts.pattern.flags : opts.pattern.flags + 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        if (!m[0]) { re.lastIndex++; continue; }
        const tex = m.slice(1).find(g => g !== undefined) || '';
        out.push({ start: m.index, end: m.index + m[0].length, tex, display: false });
      }
      return out;
    }
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') {
        const n = text[i + 1];
        if (n === '(' || n === '[') {
          const j = text.indexOf(n === '(' ? '\\)' : '\\]', i + 2);
          if (j > i + 2) { out.push({ start: i, end: j + 2, tex: text.slice(i + 2, j), display: n === '[' }); i = j + 2; continue; }
        }
        i += 2;   // 其他跳脫字元（含 \$）整組跳過
        continue;
      }
      if (c === '$' && text[i + 1] === '$') {
        const j = text.indexOf('$$', i + 2);
        if (j > i + 2) { out.push({ start: i, end: j + 2, tex: text.slice(i + 2, j), display: true }); i = j + 2; continue; }
        i += 2;
        continue;
      }
      if (c === '$' && opts.dollar && text[i + 1] && !/\s/.test(text[i + 1])) {
        // 同一行內找下一個 $；它不符合結尾條件就不算算式（不再往後找，避免「$100 和 $200 … $x$」誤配）
        let j = i + 1;
        while (j < text.length && text[j] !== '\n' && text[j] !== '$') j += text[j] === '\\' ? 2 : 1;
        if (text[j] === '$' && !/\s/.test(text[j - 1]) && !/[0-9]/.test(text[j + 1] || '')) {
          out.push({ start: i, end: j + 1, tex: text.slice(i + 1, j), display: false });
          i = j + 1;
          continue;
        }
      }
      i++;
    }
    return out;
  }
  const hasMath = (text, opts) => findMath(text, opts).length > 0;

  // ── 載入 MathJax：頁面自己有（數學點字頁）就用；沒有就從 CDN 載入。
  // （桌面版會把這個 CDN 網址換成 app 內附的同一份檔案，離線也能用）
  const MATHJAX_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('載入失敗：' + src));
    document.head.appendChild(s);
  });
  let mathjaxPromise = null;
  function loadMathJax() {
    const ready = () => window.MathJax && window.MathJax.tex2mmlPromise;
    mathjaxPromise = mathjaxPromise || (async () => {
      if (document.getElementById('MathJax-script'))   // 頁面的 MathJax 還在載入
        for (let i = 0; i < 50 && !ready(); i++) await new Promise(r => setTimeout(r, 100));
      if (!ready()) {
        // 沿用頁面既有的設定（例如 \ratio 巨集）；沒有的話只做轉換、不排版畫面
        if (!window.MathJax) window.MathJax = { startup: { typeset: false } };
        try { await loadScript(MATHJAX_CDN); }
        catch (e) { throw new Error('MathJax 載入失敗（需要網路連線）'); }
      }
      await window.MathJax.startup.promise;
      return window.MathJax;
    })().catch(e => { mathjaxPromise = null; throw e; });
    return mathjaxPromise;
  }

  // ── 載入 MathCAT（WASM，放在網頁同一層的 mathcat/）
  let mathcatPromise = null;
  function loadMathCat() {
    mathcatPromise = mathcatPromise || import(new URL('mathcat/mathcat_nemeth.js', document.baseURI).href)
      .then(async m => { await m.default(); return m; })
      .catch(e => { mathcatPromise = null; throw new Error('MathCAT 載入失敗：' + e.message); });
    return mathcatPromise;
  }

  const load = () => Promise.all([loadMathJax(), loadMathCat()]);

  async function texToSpeech(mc, tex, display) {
    const mml = await window.MathJax.tex2mmlPromise(tex, { display });
    // MathCAT 遇到 <merror>（LaTeX 語法錯誤）會讓 WASM 直接崩潰，先擋掉（同 mathcat-lab 的做法）
    if (mml.includes('<merror')) return null;
    const brl = mc.nemeth_from_mathml(mml);   // 同時把 MathML 設進 MathCAT
    if (/^(ERROR|PANIC):/.test(brl)) return null;
    const sp = mc.spoken_text();
    return /^(ERROR|PANIC):/.test(sp) ? null : sp;
  }

  // 把文字裡每個算式換成報讀文字，其餘照舊；轉不了的算式念成「無法轉換的算式」
  // opts 同 findMath → { text, count, failed: [轉不了的 LaTeX] }
  async function toSpeech(text, opts) {
    const found = findMath(text, opts);
    if (!found.length) return { text, count: 0, failed: [] };
    const [, mc] = await load();
    const parts = [], failed = [];
    let last = 0;
    for (const m of found) {
      parts.push(text.slice(last, m.start));
      last = m.end;
      const tex = m.tex.trim();
      const sp = tex ? await texToSpeech(mc, tex, m.display) : null;
      if (sp === null) { failed.push(tex); parts.push('，無法轉換的算式，'); }
      else parts.push(' ' + sp + ' ');
    }
    parts.push(text.slice(last));
    return { text: parts.join('').replace(/[ \t]{2,}/g, ' '), count: found.length, failed };
  }

  window.vitoolsMathSpeech = { findMath, hasMath, toSpeech, load, loadMathJax };
})();
