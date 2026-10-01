/*
 * BRF (North American Braille ASCII) <-> Unicode braille.
 * 內部一律使用「大寫 BRF」字串處理點字，顯示時才轉成 Unicode 點字。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});

  // 依點位遮罩 0..63 排列的 BRF 字元（bit0=點1 … bit5=點6，與 Unicode 相同）
  const BRF_BY_MASK =
    " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=";

  const MASK_BY_BRF = {};
  for (let i = 0; i < 64; i++) MASK_BY_BRF[BRF_BY_MASK[i]] = i;
  // 小寫及常見替代字元
  const ALIASES = { '`': '@', '{': '[', '|': '\\', '}': ']', '~': '^' };

  function normalizeBrfChar(ch) {
    if (ALIASES[ch]) return ALIASES[ch];
    if (ch >= 'a' && ch <= 'z') return ch.toUpperCase();
    return ch;
  }

  /** 將任意點字輸入（Unicode 點字或 BRF）轉為大寫 BRF。 */
  function toBrf(text) {
    let out = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x2800 && cp <= 0x28ff) {
        out += BRF_BY_MASK[(cp - 0x2800) & 0x3f]; // 忽略點 7、8
      } else if (ch === '\r') {
        continue;
      } else if (ch === '\n' || ch === ' ' || ch === '\t') {
        out += ch === '\t' ? ' ' : ch;
      } else if (ch === ' ') {
        out += ' ';
      } else {
        out += normalizeBrfChar(ch);
      }
    }
    return out;
  }

  /** 大寫 BRF 轉 Unicode 點字；空白轉為 U+2800 以外的一般空白（保持可讀）。 */
  function toUnicode(brf, opts) {
    const blank = opts && opts.blankCell ? '⠀' : ' ';
    let out = '';
    for (const ch of brf) {
      if (ch === '\n') out += '\n';
      else if (ch === ' ') out += blank;
      else {
        const m = MASK_BY_BRF[normalizeBrfChar(ch)];
        out += m === undefined ? ch : String.fromCodePoint(0x2800 + m);
      }
    }
    return out;
  }

  function isUnicodeBraille(text) {
    return /[⠁-⣿]/.test(text);
  }

  /** 字元的點位遮罩（未知字元回傳 -1）。 */
  function mask(ch) {
    const m = MASK_BY_BRF[normalizeBrfChar(ch)];
    return m === undefined ? -1 : m;
  }

  /** 是否含點 1、2 或 3（許多規則需在此情況加點 3 分隔）。 */
  function hasDots123(ch) {
    const m = mask(ch);
    return m > 0 && (m & 0b111) !== 0;
  }

  /** 點位描述，如 "1-4-5"。 */
  function dotsOf(ch) {
    const m = mask(ch);
    if (m <= 0) return '';
    const d = [];
    for (let i = 0; i < 6; i++) if (m & (1 << i)) d.push(i + 1);
    return d.join('-');
  }

  const UPPER_DIGITS = 'JABCDEFGHI'; // 0..9
  const LOWER_DIGITS = '0123456789'; // BRF 的數字字元本身就是下位數字

  function upperNumber(n) {
    return String(n)
      .split('')
      .map((d) => UPPER_DIGITS[+d])
      .join('');
  }
  function lowerNumber(n) {
    return String(n)
      .split('')
      .map((d) => LOWER_DIGITS[+d])
      .join('');
  }
  function parseUpperNumber(s) {
    let n = '';
    for (const ch of s) {
      const i = UPPER_DIGITS.indexOf(ch);
      if (i < 0) return NaN;
      n += i;
    }
    return n === '' ? NaN : parseInt(n, 10);
  }
  function parseLowerNumber(s) {
    if (!/^[0-9]+$/.test(s)) return NaN;
    return parseInt(s, 10);
  }

  MB.brf = {
    toBrf,
    toUnicode,
    isUnicodeBraille,
    mask,
    hasDots123,
    dotsOf,
    upperNumber,
    lowerNumber,
    parseUpperNumber,
    parseLowerNumber,
    UPPER_DIGITS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
