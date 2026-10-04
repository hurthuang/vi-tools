// PRN 核心：ViewPlus Tiger 的 .prn 編碼／解碼、點字轉換、點字排到點陣
//   頁面：寬 × 高 點（20 dpi；預設 12 × 11 吋 = 240 × 220），每點 1 byte：0 空白、1–7 灰階（3D Emboss 的凸起高度）、15 點字
//   每頁 = 16 bytes 標頭 + 高 列；每列 寬/2 個 16-bit word（big-endian，每 word 兩點）
//   標頭（比對 12×11、11×11.5、8.5×11 三份樣本得出）：
//     1b 04 | 00 10 | 256+寬（16 bit）| 高（16 bit）| 00 × 6 | 檢查碼（前 14 bytes 加總 + 3，little-endian）
//     第 3–4 byte 驅動程式寫 00 10、Tiger Designer 寫 00 c0，這裡照驅動程式
//     0xC001          整列空白
//     0x8000|n, w     word w 重複 n 次
//     n (< 0x8000), w1..wn   照抄 n 個 word
// 瀏覽器：window.PrnCore；node：module.exports
(function (root) {
  'use strict';

  const W = 240, H = 220;   // 預設紙張 12 × 11 吋
  const DPI = 20, MAX_W = 254;   // 寬寫在一個 byte 裡（256+寬），而且一列要整數個 word，所以寬是偶數、最多 254 點
  const LINE = 7, BRL = 15;
  const PrnCoreDefaults = { W, H };

  function header(w, h) {
    const b = [0x1b, 0x04, 0x00, 0x10, ((256 + w) >> 8) & 0xff, (256 + w) & 0xff, (h >> 8) & 0xff, h & 0xff, 0, 0, 0, 0, 0, 0];
    const sum = b.reduce((a, v) => a + v, 0) + 3;
    return b.concat([sum & 0xff, (sum >> 8) & 0xff]);
  }

  // 回傳 { pages, w, h }（同一檔案各頁尺寸相同；以第一頁為準）
  function decode(buf) {
    const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const pages = [];
    let pos = 0, W0 = 0, H0 = 0;
    while (pos + 16 <= d.length) {
      if (d[pos] !== 0x1b || d[pos + 1] !== 0x04) throw new Error('不是 ViewPlus PRN 格式（位置 ' + pos + '）');
      const w = ((d[pos + 4] << 8) | d[pos + 5]) - 256, h = (d[pos + 6] << 8) | d[pos + 7];
      if (!W0) { W0 = w > 0 && w <= MAX_W ? w : W; H0 = h > 0 ? h : H; }
      const W = W0, H = H0;
      pos += 16;
      const page = new Uint8Array(W * H);
      let o = 0;
      while (pos + 1 < d.length && !(d[pos] === 0x1b && d[pos + 1] === 0x04)) {
        const x = (d[pos] << 8) | d[pos + 1];
        if (x === 0xc001) { o += W; pos += 2; }
        else if (x & 0x8000) {
          const n = x & 0x7fff, a = d[pos + 2], b = d[pos + 3];
          for (let i = 0; i < n && o < page.length; i++) { page[o++] = a; page[o++] = b; }
          pos += 4;
        } else {
          for (let i = 0; i < 2 * x && o < page.length; i++) page[o++] = d[pos + 2 + i];
          pos += 2 + 2 * x;
        }
      }
      pages.push(page);
    }
    return { pages, w: W0 || W, h: H0 || H };
  }

  function encode(pages, W = PrnCoreDefaults.W, H = PrnCoreDefaults.H) {
    const out = [], WORDS = W / 2, HEAD = header(W, H);
    const push16 = v => out.push((v >> 8) & 0xff, v & 0xff);
    for (const page of pages) {
      out.push(...HEAD);
      for (let y = 0; y < H; y++) {
        const w = new Array(WORDS);
        let any = false;
        for (let i = 0; i < WORDS; i++) {
          w[i] = (page[y * W + 2 * i] << 8) | page[y * W + 2 * i + 1];
          if (w[i]) any = true;
        }
        if (!any) { push16(0xc001); continue; }
        let i = 0;
        while (i < WORDS) {
          let j = i;
          while (j + 1 < WORDS && w[j + 1] === w[i]) j++;
          if (j > i) { push16(0x8000 | (j - i + 1)); push16(w[i]); i = j + 1; continue; }
          const s = i;
          while (i < WORDS && !(i + 1 < WORDS && w[i + 1] === w[i])) i++;
          push16(i - s);
          for (let k = s; k < i; k++) push16(w[k]);
        }
      }
    }
    return new Uint8Array(out);
  }

  // ── 點字轉換 ───────────────────────────────────────────
  const LETTERS = 'a⠁b⠃c⠉d⠙e⠑f⠋g⠛h⠓i⠊j⠚k⠅l⠇m⠍n⠝o⠕p⠏q⠟r⠗s⠎t⠞u⠥v⠧w⠺x⠭y⠽z⠵';
  const LETTER = {};
  for (let i = 0; i < LETTERS.length; i += 2) LETTER[LETTERS[i]] = LETTERS[i + 1];
  const UPPER_DIGIT = '⠚⠁⠃⠉⠙⠑⠋⠛⠓⠊';   // 0–9，接在數符 ⠼ 後
  const LOWER_DIGIT = '⠴⠂⠆⠒⠲⠢⠖⠶⠦⠔';   // 0–9，下標（M₁ → ⠠⠍⠂）
  const CAP = '⠠', NUM = '⠼';
  // 標籤裡的運算符號（Nemeth；等號前後空一方）
  const MATH_OP = { '+': '⠬', '-': '⠤', '−': '⠤', '×': '⠈⠡', '÷': '⠨⠌', '=': '⠀⠨⠅⠀', '(': '⠷', ')': '⠾', '>': '⠀⠨⠂⠀', '<': '⠀⠐⠅⠀' };

  // 國字資料：loadZh(zh-tw.ctb 的內容, bt-zh-supplement-rules.json 的內容) 載入；解析方式同「文字轉點字」的 parseCtb
  //   字表（後面的蓋前面的）、前後文破音規則 context、異體字 correct（第一條符合的勝出）、補充規則（整詞）
  const EMPTY_ZH = () => ({ chars: new Map(), ctx: new Map(), correct: {}, correctCtx: new Map(), supplement: [] });
  let zh = EMPTY_ZH(), zhLoaded = false;
  const zhData = () => zh;
  const CHAR_OPS = new Set(['letter', 'lowercase', 'uppercase', 'punctuation', 'sign', 'math', 'digit', 'base', 'litdigit', 'display']);
  const decodeCtb = s => s.replace(/\\x([0-9a-fA-F]{1,6})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  function dotsToUnicode(s) {
    if (/^[\u2800-\u28ff]+$/.test(s)) return s;
    const c = s.replace(/(-0)+$/, '');
    if (!c) return '\u2800';
    return c.split('-').map(cell => String.fromCharCode(0x2800 + [...(cell === '0' ? '' : cell)].reduce((a, d) => a | (1 << (+d - 1)), 0))).join('');
  }
  function loadZh(ctbText, supplement = []) {
    const d = EMPTY_ZH();
    const add = (m, r) => { if (!m.has(r[1])) m.set(r[1], []); m.get(r[1]).push(r); };
    for (const raw of ctbText.split('\n')) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      let op = parts[0].toLowerCase(), ci = 1, di = 2;
      if (op === 'include') continue;
      if (op === 'noback' || op === 'nofor') { op = (parts[1] || '').toLowerCase(); ci = 2; di = 3; }
      const rhs = parts.slice(ci).join(' ');
      if (op === 'correct') {
        if (rhs.includes('%') || rhs.includes('$')) continue;
        let m = rhs.match(/^_\d+"([^"]*)"\["([^"]*)"\](?:"([^"]*)")?\s+"([^"]*)"/);
        if (m) { const curr = decodeCtb(m[2]), rep = decodeCtb(m[4]); if (curr.length === 1 && rep) add(d.correctCtx, [decodeCtb(m[1]), curr, m[3] == null ? null : decodeCtb(m[3]), rep]); continue; }
        m = rhs.match(/^\["([^"]*)"\](?:"([^"]*)")?\s+"([^"]*)"/);
        if (m) { const curr = decodeCtb(m[1]), rep = decodeCtb(m[3]); if (curr.length === 1 && rep) add(d.correctCtx, [null, curr, m[2] == null ? null : decodeCtb(m[2]), rep]); continue; }
        m = rhs.match(/^"([^"]*)"\s+"([^"]*)"/);
        if (m) { const a = decodeCtb(m[1]), b = decodeCtb(m[2]); if (a.length === 1 && b) d.correct[a] = b; }
        continue;
      }
      if (op === 'context') {
        if (rhs.includes('%') || rhs.includes('$')) continue;
        let m = rhs.match(/^_\d+"([^"]*)"\["([^"]*)"\](?:"([^"]*)")?\s+@([\d-]+)/);
        if (m) { if (decodeCtb(m[2]).length === 1) add(d.ctx, [decodeCtb(m[1]), decodeCtb(m[2]), m[3] == null ? null : decodeCtb(m[3]), dotsToUnicode(m[4])]); continue; }
        m = rhs.match(/^\["([^"]*)"\](?:"([^"]*)")?\s+@([\d-]+)/);
        if (m && decodeCtb(m[1]).length === 1) add(d.ctx, [null, decodeCtb(m[1]), m[2] == null ? null : decodeCtb(m[2]), dotsToUnicode(m[3])]);
        continue;
      }
      if (!CHAR_OPS.has(op) || parts.length <= di) continue;
      const tok = parts[ci], esc = tok.match(/^\\x([0-9a-fA-F]{1,6})$/);
      const ch = esc ? String.fromCodePoint(parseInt(esc[1], 16)) : tok.length === 1 ? tok : null;
      if (!ch) continue;
      const cp = ch.codePointAt(0);
      if (cp >= 0x20 && cp <= 0x7e) continue;
      d.chars.set(ch, dotsToUnicode(parts[di]));
    }
    // 同文字轉點字的 PDF 規範覆蓋與補入
    for (const [k, v] of [['\uFF0E', '\u2824'], ['\u00B7', '\u2824'], ['\u2027', '\u2824'], ['\uFF1F', '\u2815'],
                          ['\uFF5E', '\u2820\u2824'], ['\u203B', '\u2808\u283C'], ['\u25CE', '\u282A\u2815']]) d.chars.set(k, v);
    d.supplement = (supplement || []).map(r => [r.text, r.braille]);
    zh = d; zhLoaded = true;
  }
  const isCjk = c => /[\u3400-\u9fff\uf900-\ufaff]/.test(c);

  // 前後文比對：prev／next 為 null 表示不檢查（第一條符合的規則勝出，同文字轉點字）
  function ctxMatch(rules, text, i) {
    for (const [prev, , next, out] of rules || []) {
      if (prev !== null && (i < prev.length || text.slice(i - prev.length, i).join('') !== prev)) continue;
      if (next !== null && text.slice(i + 1, i + 1 + next.length).join('') !== next) continue;
      return out;
    }
    return null;
  }

  // 一個國字 → 點字：correct 規則（異體字等）→ 破音前後文規則 → 字表
  function zhChar(text, i) {
    const d = zhData(), ch = text[i];
    const eff = ctxMatch(d.correctCtx.get(ch), text, i) || d.correct[ch] || ch;
    return ctxMatch(d.ctx.get(eff), text, i) || d.chars.get(eff) || null;
  }

  // 文字 → Unicode 點字
  //   大寫字母：⠠ + 字母；小寫：字母
  //   數字：opts.lowerDigits（標籤，數學點字）一律下位數字；單獨的數字、以數字開頭（開頭或空白之後）前面加數字記號 ⠼，
  //         字母後的數字是下標（M₁ = ⠠⠍⠂）；= < > 前後空方，後面的數字也加 ⠼；+ − × 後的數字不加；小數點 ⠨
  //         否則（標題）字母後的數字是下標，其他用 ⠼ + 上位數字
  //   國字：注音點字（要先 loadZh）；opts.supplement 時先套多音字補充規則（整詞）
  //   查不到的字回傳在 missing
  function toBraille(text, opts = {}) {
    const d = zhData();
    const chars = [...text.replace(/[₀-₉]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x2080 + 48))];
    let out = '';
    const missing = [];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i], prev = chars[i - 1];
      if (opts.supplement && isCjk(c)) {
        let best = null;
        for (const [w, b] of d.supplement)
          if ((!best || w.length > best[0].length) && chars.slice(i, i + [...w].length).join('') === w) best = [w, b];
        if (best) { out += best[1]; i += [...best[0]].length - 1; continue; }
      }
      if (/[A-Z]/.test(c)) out += CAP + LETTER[c.toLowerCase()];
      else if (/[a-z]/.test(c)) out += LETTER[c];
      else if (/[0-9]/.test(c)) {
        if (opts.lowerDigits) {
          if (!prev || /[\s　=<>]/.test(prev)) out += NUM;   // 開頭、空白後、比較符號（前後空方）後
          while (i < chars.length && (/[0-9]/.test(chars[i]) || (chars[i] === '.' && /[0-9]/.test(chars[i + 1] || ''))))
            out += chars[i] === '.' ? '⠨' : LOWER_DIGIT[+chars[i]], i++;
          i--;
        } else if (prev && /[A-Za-z]/.test(prev)) {
          while (i < chars.length && /[0-9]/.test(chars[i])) out += LOWER_DIGIT[+chars[i++]];
          i--;
        } else {
          out += NUM;
          while (i < chars.length && /[0-9]/.test(chars[i])) out += UPPER_DIGIT[+chars[i++]];
          i--;
        }
      }
      else if (opts.lowerDigits && MATH_OP[c]) out += MATH_OP[c];
      else if (c === '.') out += '⠲';
      else if (c === ' ' || c === '　') out += '⠀';
      else if (c === "'" || c === '′') out += '⠄';
      else if (/[\u2800-\u28ff]/.test(c)) out += c;
      else {
        const b = zhChar(chars, i);
        if (b) out += b;
        else if (c.trim()) missing.push(c);
      }
    }
    return { braille: out, missing };
  }

  // 點字在點陣上的大小：方距 5 點、點距 2 點
  const brlWidth = brl => Math.max(0, [...brl].length * 5 - 2);
  const BRL_HEIGHT = 5;

  // 把 Unicode 點字畫進點陣（x, y 為第一方左上點）
  function stampBraille(page, brl, x, y, value = BRL, W = PrnCoreDefaults.W, H = PrnCoreDefaults.H) {
    [...brl].forEach((ch, i) => {
      const bits = ch.charCodeAt(0) - 0x2800;
      for (let k = 0; k < 6; k++) {
        if (!(bits & (1 << k))) continue;
        const px = x + 5 * i + (k >= 3 ? 2 : 0), py = y + (k % 3) * 2;
        if (px >= 0 && px < W && py >= 0 && py < H) page[py * W + px] = value;
      }
    });
  }

  const api = { W, H, DPI, MAX_W, LINE, BRL, header, decode, encode, toBraille, brlWidth, BRL_HEIGHT, stampBraille, loadZh, zhReady: () => zhLoaded };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PrnCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
