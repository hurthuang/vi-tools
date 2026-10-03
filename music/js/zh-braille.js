/*
 * 中文 → 國語點字（歌詞用）。讀取 liblouis 的台灣國語點字表 zh-tw.ctb（LGPL，視障輔助工具集 table/ 已附），
 * 做法和工具集「文字轉點字」相同：逐字查表，先套用 correct（異體字換成標準字）與 context（多音字依前後文）規則。
 * 只處理中文字與中文標點；英文、數字等不在這裡處理。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});

  const map = new Map(); // 字 → 點字（Unicode）
  const ctxRules = []; // { prev, curr, next, braille }
  const correctMap = new Map(); // 字 → 字
  const correctCtx = []; // { prev, curr, next, replacement }
  let loaded = false;

  const CHAR_OPS = new Set(['letter', 'lowercase', 'uppercase', 'punctuation', 'sign', 'math', 'digit', 'base', 'litdigit', 'display']);
  const decode = (s) => s.replace(/\\x([0-9a-fA-F]{1,6})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  /** liblouis 點位寫法（例如 24-1236-4）→ Unicode 點字（只取 1–6 點） */
  function dots(s) {
    return s
      .replace(/(-0)+$/, '')
      .split('-')
      .map((cell) => String.fromCharCode(0x2800 + [...cell].reduce((m, d) => (d >= '1' && d <= '6' ? m | (1 << (d - 1)) : m), 0)))
      .join('');
  }

  /** 解析 zh-tw.ctb 的內容（include 的其他表格不需要：英文、符號由音樂點字或文字點字另外處理） */
  function load(text) {
    for (const raw of text.split('\n')) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      let op = parts[0].toLowerCase();
      let ci = 1;
      let di = 2;
      if (op === 'noback' || op === 'nofor') {
        op = (parts[1] || '').toLowerCase();
        ci = 2;
        di = 3;
      }
      const rhs = parts.slice(ci).join(' ');
      if (op === 'correct') {
        if (/[%$]/.test(rhs)) continue;
        let m = /^_\d+"([^"]*)"\["([^"]*)"\](?:"([^"]*)")?\s+"([^"]*)"/.exec(rhs) || null;
        if (m) {
          if (decode(m[2]).length === 1) correctCtx.push({ prev: decode(m[1]), curr: decode(m[2]), next: m[3] != null ? decode(m[3]) : null, replacement: decode(m[4]) });
          continue;
        }
        m = /^\["([^"]*)"\](?:"([^"]*)")?\s+"([^"]*)"/.exec(rhs);
        if (m) {
          if (decode(m[1]).length === 1) correctCtx.push({ prev: null, curr: decode(m[1]), next: m[2] != null ? decode(m[2]) : null, replacement: decode(m[3]) });
          continue;
        }
        m = /^"([^"]*)"\s+"([^"]*)"/.exec(rhs);
        if (m && decode(m[1]).length === 1) correctMap.set(decode(m[1]), decode(m[2]));
        continue;
      }
      if (op === 'context') {
        if (/[%$]/.test(rhs)) continue;
        let m = /^_\d+"([^"]*)"\["([^"]*)"\](?:"([^"]*)")?\s+@([\d-]+)/.exec(rhs);
        if (m) {
          if (decode(m[2]).length === 1) ctxRules.push({ prev: decode(m[1]), curr: decode(m[2]), next: m[3] != null ? decode(m[3]) : null, braille: dots(m[4]) });
          continue;
        }
        m = /^\["([^"]*)"\](?:"([^"]*)")?\s+@([\d-]+)/.exec(rhs);
        if (m && decode(m[1]).length === 1) ctxRules.push({ prev: null, curr: decode(m[1]), next: m[2] != null ? decode(m[2]) : null, braille: dots(m[3]) });
        continue;
      }
      if (!CHAR_OPS.has(op) || parts.length <= di) continue;
      const tok = parts[ci];
      const esc = /^\\x([0-9a-fA-F]{1,6})$/.exec(tok);
      const ch = esc ? String.fromCodePoint(parseInt(esc[1], 16)) : [...tok].length === 1 ? tok : null;
      if (!ch) continue;
      const cp = ch.codePointAt(0);
      if (cp >= 0x20 && cp <= 0x7e) continue; // ASCII 字元不由這張表處理
      map.set(ch, dots(parts[di]));
    }
    loaded = map.size > 0;
    return loaded;
  }

  /**
   * 多音字補充詞表（工具集的 bt-zh-supplement-rules.json：[{ text, braille }]，整詞比對）。
   * 詞的點字要拆回每個字一個音節（歌詞一字對一音）：每個音節以聲調結尾，但 ⠁ 同時是輕聲和聲母ㄓ，
   * 所以列出所有「每段以聲調點結尾、2～4 方」的切法，取和各字預設讀音長度最接近的一種。
   */
  const words = []; // { chars: [..], syl: [每字點字] }
  const TONES = new Set(['⠄', '⠂', '⠈', '⠐', '⠁']);
  function splitSyllables(brl, chars) {
    const cells = [...brl];
    const want = chars.map((ch) => [...(map.get(ch) || '⠀⠀')].length);
    let best = null;
    const rec = (start, k, acc, cost) => {
      if (k === chars.length) {
        if (start === cells.length && (!best || cost < best.cost)) best = { cost, acc };
        return;
      }
      for (let len = 1; len <= 4 && start + len <= cells.length; len++) {
        if (!TONES.has(cells[start + len - 1])) continue;
        rec(start + len, k + 1, acc.concat([cells.slice(start, start + len).join('')]), cost + Math.abs(len - want[k]));
      }
    };
    rec(0, 0, [], 0);
    return best ? best.acc : null;
  }
  function loadWords(list) {
    for (const w of list || []) {
      const chars = [...(w.text || '')];
      if (chars.length < 2 || !chars.every((c) => /[㐀-鿿豈-﫿]/.test(c))) continue;
      const syl = splitSyllables(w.braille || '', chars);
      if (syl) words.push({ chars, syl });
    }
    words.sort((a, b) => b.chars.length - a.chars.length); // 長詞優先
    return words.length;
  }

  const ctxMatch = (r, chars, i) => {
    if (r.prev !== null && chars.slice(Math.max(0, i - [...r.prev].length), i).join('') !== r.prev) return false;
    if (r.next !== null && chars.slice(i + 1, i + 1 + [...r.next].length).join('') !== r.next) return false;
    return true;
  };

  /**
   * 把一段文字逐字轉成國語點字。回傳 [{ ch, brl, known }]，brl 為 Unicode 點字；
   * 查不到的字 known 為 false、brl 為原字。前後文（多音字）以整段文字判斷，所以請傳入整句歌詞。
   */
  function translate(text) {
    const chars = [...text];
    // 先比對補充詞表（長詞優先），比對到的字直接用詞表的讀音
    const fromWord = new Array(chars.length).fill(null);
    for (let i = 0; i < chars.length; i++) {
      if (fromWord[i]) continue;
      const w = words.find((x) => x.chars.every((c, k) => chars[i + k] === c));
      if (w) w.syl.forEach((b, k) => (fromWord[i + k] = b));
    }
    return chars.map((ch, i) => {
      if (fromWord[i]) return { ch, brl: fromWord[i], known: true, word: true };
      let eff = ch;
      const cc = correctCtx.find((r) => r.curr === ch && ctxMatch(r, chars, i));
      if (cc) eff = cc.replacement;
      else if (correctMap.has(ch)) eff = correctMap.get(ch);
      const ctx = ctxRules.find((r) => r.curr === eff && ctxMatch(r, chars, i));
      const brl = (ctx && ctx.braille) || map.get(eff);
      return { ch, brl: brl || ch, known: !!brl };
    });
  }

  /** 瀏覽器：從視障輔助工具集的 table/ 載入（放在 music/ 時是 ../table/zh-tw.ctb）。單獨使用時沒有這個檔案。 */
  let loading = null;
  function loadFromSite(base) {
    if (loaded) return Promise.resolve(true);
    const root = base || '../';
    if (!loading)
      loading = fetch(root + 'table/zh-tw.ctb')
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
        .then(load)
        .then((ok) =>
          // 多音字補充詞表：載不到也不影響逐字轉換
          fetch(root + 'bt-zh-supplement-rules.json')
            .then((r) => (r.ok ? r.json() : []))
            .then(loadWords, () => 0)
            .then(() => ok)
        )
        .catch(() => false);
    return loading;
  }

  MB.zhBraille = { load, loadWords, loadFromSite, translate, isLoaded: () => loaded, isChinese: (ch) => /[㐀-鿿豈-﫿]/.test(ch) };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
