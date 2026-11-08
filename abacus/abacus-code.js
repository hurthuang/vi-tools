/*
 * 練習代號：把出題設定（級數與運算、題目大小、題數、撥珠方向，可以再加「同一組題目」）壓成短代號，
 * 老師寫在聯絡簿，或做成連結傳 LINE（parent.html#代號）。出題練習和家長版都能讀（使用者 2026-11-01）。
 * 沒有伺服器，代號本身就是全部的資料。字母用 Crockford base32（沒有 I L O U，家長打成 O、I、L 也認得），
 * 每 4 個字一條橫線，最後一個字是檢查碼（抄錯一個字或相鄰兩個字對調一定會發現）。
 * 要在 abacus-levels.js、abacus-core.js 之後載入；node 也能用（tools/check-abacus.mjs）。
 *
 * 位元：版本 2、方向 1、題數 3（常用的 10、5、15、20、25、30、50；其他再加 7）、有沒有種子 1（有的話種子 10、題庫指紋 4）、
 * 級數個數 5、每一級代號 5；有加減法時：運算是否一樣 1（一樣的話運算 2，不一樣每個加減法級數 2）；
 * 最後是選到的運算的題目大小（加減法 4、乘法 2、除法 3）。選 1～3 級加法大約 6～8 個字，同一組題目多 3 個字。
 * 加法進位「先扣補數」（2026-11-08 加）：題目大小後面多放一個 1；「先進位」什麼都不放，所以代號跟以前一樣、舊代號照樣讀得到。
 * 讀的時候後面還有位元才讀這一位（補齊 5 位的 0 就是先進位）。舊版網站讀新代號會忽略這一位（照先進位）。
 */
(function (g) {
  'use strict';
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  // 代號裡級數的編號：只能往後加，不能改順序或刪除，不然舊代號會讀錯
  const CODE_LEVELS = ['1', '2', '3a', '3b', '4', '5a-1', '5a-2', '5b-1', '5b-2', '5b-3', '5c-1', '5c-2', '5c-3', '5c-4', '5c-5', '5d',
    '九九', '6a', '6b', '6c', '7a', '7b', '7c', '7d', '8a', '8b', '8c', '8d', '9a', '9b', '9c', '9d'];
  const SIZE_IDS = ['F1', 'F2', 'F3', 'F4', 'M2', 'M3', 'D2', 'D3', 'D4'];
  const VERSION = 1;
  const COUNTS = [10, 5, 15, 20, 25, 30, 50];
  const SIZE_OF = { F: /^[1-5]/, M: /^[67]/, D: /^[89]/ };
  const isAddSub = lv => /^[1-5]/.test(lv);
  const opMask = ops => (ops.includes('+') ? 1 : 0) | (ops.includes('-') ? 2 : 0);

  // 檢查碼：在 GF(32) 裡，第 i 個字乘上 2 的 i 次方再加總（XOR）。權重都不是 0、相鄰兩個權重也不一樣，
  // 所以抄錯任何一個字、或對調相鄰兩個字，檢查碼一定會變（一般的「除以 31 取餘數」抓不到 0 和 Z 互換）
  const gmul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; b >>= 1; a <<= 1; if (a & 32) a ^= 0x25; } return r; };
  const check = vals => { let c = 0, w = 1; for (const v of vals) { w = gmul(w, 2); c ^= gmul(v, w); } return c; };

  // settings：{ picks: ['2|+', '3a|-', '6a|×'], sizes: ['F1', ...], count, high, seed?, fp?, carry? }（carry：'carry' 或 'comp'）
  function encode({ picks, sizes, count, high, seed, fp, carry }) {
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    const byLv = new Map();
    for (const v of picks) {
      const [lv, op] = v.split('|');
      if (!CODE_LEVELS.includes(lv)) continue;
      byLv.set(lv, [...(byLv.get(lv) || []), op]);
    }
    const lvs = [...byLv.keys()].sort((a, b) => CODE_LEVELS.indexOf(a) - CODE_LEVELS.indexOf(b));
    const masks = lvs.filter(isAddSub).map(lv => opMask(byLv.get(lv)));
    const same = masks.every(m => m === masks[0]);
    const n = Math.max(1, Math.min(100, count)), ci = COUNTS.indexOf(n);
    put(VERSION, 2); put(high ? 1 : 0, 1);
    put(ci < 0 ? 7 : ci, 3);
    if (ci < 0) put(n - 1, 7);
    put(seed != null ? 1 : 0, 1);
    if (seed != null) { put(seed & 1023, 10); put((fp || 0) & 15, 4); }
    put(lvs.length, 5);
    for (const lv of lvs) put(CODE_LEVELS.indexOf(lv), 5);
    if (masks.length) {
      put(same ? 1 : 0, 1);
      if (same) put(masks[0], 2); else masks.forEach(m => put(m, 2));
    }
    for (const [k, re] of Object.entries(SIZE_OF)) if (lvs.some(lv => re.test(lv))) SIZE_IDS.filter(id => id[0] === k).forEach(id => put(sizes.includes(id) ? 1 : 0, 1));
    if (carry === 'comp') put(1, 1);
    while (bits.length % 5) bits.push(0);
    const vals = [];
    for (let i = 0; i < bits.length; i += 5) vals.push(bits.slice(i, i + 5).reduce((s, b) => s * 2 + b, 0));
    vals.push(check(vals));
    return vals.map(v => ALPHA[v]).join('');
  }

  // 每 4 個字一條橫線：K7M2-QX4P
  const format = code => code.match(/.{1,4}/g).join('-');

  // 讀代號：回傳設定，或 { error: '…' }
  function decode(raw) {
    const s = String(raw || '').normalize('NFKC').toUpperCase().replace(/[\s\-‐－—_.]/g, '')
      .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    if (!s) return { error: '請輸入代號' };
    if ([...s].some(c => !ALPHA.includes(c))) return { error: '代號裡有不認得的字，請再對一次' };
    if (s.length < 5) return { error: '代號太短，請再對一次' };
    const vals = [...s].map(c => ALPHA.indexOf(c)), last = vals.pop();
    if (check(vals) !== last) return { error: '代號對不起來，可能抄錯了一個字，請再對一次' };
    const bits = vals.flatMap(v => [16, 8, 4, 2, 1].map(b => (v & b) ? 1 : 0));
    let p = 0;
    const get = n => { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + (bits[p++] || 0); return v; };
    const ver = get(2);
    if (ver !== VERSION) return { error: '這個代號是新版網站產生的，請重新整理網頁再試' };
    const out = { high: !!get(1), picks: [], sizes: [] };
    const ci = get(3);
    out.count = ci === 7 ? get(7) + 1 : COUNTS[ci];
    if (get(1)) { out.seed = get(10); out.fp = get(4); }
    const lvs = [];
    for (let i = get(5); i > 0; i--) {
      const lv = CODE_LEVELS[get(5)];
      if (!lv) return { error: '代號對不起來，請再對一次' };
      lvs.push(lv);
    }
    const addsub = lvs.filter(isAddSub), same = addsub.length ? get(1) : 1, mask = addsub.length && same ? get(2) : 0;
    const masks = new Map(addsub.map(lv => [lv, same ? mask : get(2)]));
    for (const lv of lvs) {
      const m = masks.get(lv);
      if (m === undefined) { out.picks.push(lv + (/^[89]/.test(lv) ? '|÷' : '|×')); continue; }
      if (m & 1) out.picks.push(lv + '|+');
      if (m & 2) out.picks.push(lv + '|-');
    }
    for (const [k, re] of Object.entries(SIZE_OF)) if (lvs.some(lv => re.test(lv))) SIZE_IDS.filter(id => id[0] === k).forEach(id => { if (get(1)) out.sizes.push(id); });
    if (p > bits.length) return { error: '代號對不起來，請再對一次' };
    out.carry = p < bits.length && get(1) ? 'comp' : 'carry';
    return out;
  }

  // 題庫指紋：同一組題目要靠題庫一樣；網站更新後題庫變了，指紋就不一樣，提醒家長題目可能跟老師的不同
  function fingerprint(picks, pool) {
    let h = 0;
    for (const v of picks) {
      const [lv, op] = v.split('|'), list = pool(op, lv);
      const str = `${v}:${list.length}:${list[0] || ''}:${list[list.length - 1] || ''}`;
      for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h % 32;
  }
  const newSeed = () => Math.floor(Math.random() * 1024);
  // 照代號裡的順序排（級數編號，再來 + − × ÷），老師預覽和家長出題的順序一樣
  const OP_ORDER = '+-×÷';
  const canonical = picks => picks.slice().sort((a, b) => {
    const [la, oa] = a.split('|'), [lb, ob] = b.split('|');
    return CODE_LEVELS.indexOf(la) - CODE_LEVELS.indexOf(lb) || OP_ORDER.indexOf(oa) - OP_ORDER.indexOf(ob);
  });
  // 同一組題目：用代號裡的種子出題
  const problemsOf = (d, pool, count) => makeProblems(canonical(d.picks), count || d.count, pool, seeded(d.seed + 1));

  // 代號的內容寫成一句話，套用前讓家長、老師對一下
  function describe(d) {
    const OPN = { '+': '加法', '-': '減法', both: '加減' };
    const byLv = new Map();
    for (const v of d.picks) { const [lv, op] = v.split('|'); byLv.set(lv, [...(byLv.get(lv) || []), op]); }
    const lvs = [...byLv].map(([lv, ops]) => AbacusLevels.lvTag(lv) +
      (isAddSub(lv) ? OPN[ops.length > 1 ? 'both' : ops[0]] : ''));
    const has = re => [...byLv.keys()].some(lv => re.test(lv));
    const sz = d.sizes.filter(id => (id[0] === 'F' && has(/^[1-5]/)) || (id[0] === 'M' && has(/^[67]/)) || (id[0] === 'D' && has(/^[89]/)));
    return [lvs.join('、') || '沒有選級數', sz.length ? '題目大小：' + sz.map(formName).join('、') : '',
      `${d.count} 題`, d.high ? '從最高位開始' : '從個位開始', d.carry === 'comp' ? '加法先扣補數再進位' : '',
      d.seed != null ? '同一組題目' : ''].filter(Boolean).join('；');
  }
  const formName = id => (FORMS.find(f => f.id === id) || {}).name || id;

  // 網址 # 後面的代號（parent.html#K7M2QX4P）
  const fromHash = () => decodeURIComponent((typeof location !== 'undefined' && location.hash || '').slice(1));
  const linkOf = (code, page) => new URL(page + '#' + code, location.href).href;

  const api = { encode, decode, format, describe, fingerprint, newSeed, canonical, problemsOf, fromHash, linkOf, CODE_LEVELS };
  g.AbacusCode = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
