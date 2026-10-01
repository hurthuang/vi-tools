/*
 * 點字時值判讀（寫出點字與讀入點字共用）。
 *
 * 點字每個音符符號同時代表兩種時值（全/16 分、二分/32 分、四分/64 分、八分/128 分），
 * 並有「音符分組」（Par. 8.1）：同一拍內 3 個以上的小時值音符，只有第一個寫實際時值，
 * 其餘寫成八分音符的樣子。本模組依小節長度找出最合理的解讀。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const M = MB.model;

  const LARGE = [1, 2, 4, 8];
  const SMALL = [16, 32, 64, 128];
  const SMALL_COST = { 16: 1, 32: 2, 64: 3, 128: 6 };

  function valueClass(value) {
    return { 1: 0, 2: 1, 4: 2, 8: 3, 16: 0, 32: 1, 64: 2, 128: 3 }[value];
  }

  function ticksOf(value, item) {
    let t = M.valueTicks(value, item.dots || 0);
    if (item.factor) t = (t * item.factor.of) / item.factor.n;
    return t;
  }

  /**
   * items: [{cls, rest, dots, factor, hint: 'large'|'small'|null}]
   * target: 小節長度（ticks）
   * partial: 允許總長小於 target（弱起或最後一小節）
   * 回傳 {values: [...], total} 或 null
   */
  function solve(items, target, partial) {
    const memo = new Map();
    const n = items.length;

    function rec(i, elapsed, gv, gc) {
      if (elapsed > target) return null;
      if (i === n) {
        if (gc === 2) return null;
        if (elapsed === target || (partial && elapsed > 0)) return { cost: partial ? (target - elapsed) / M.TPW * 0.01 : 0, choice: [] };
        return null;
      }
      const key = i + '|' + elapsed + '|' + gv + '|' + gc;
      if (memo.has(key)) return memo.get(key);
      const it = items[i];
      let best = null;
      function consider(value, cost, ngv, ngc, closing) {
        if (closing && gc === 2) return; // 分組至少 3 個
        const r = rec(i + 1, elapsed + ticksOf(value, it), ngv, ngc);
        if (!r) return;
        const c = r.cost + cost;
        if (!best || c < best.cost) best = { cost: c, choice: [value].concat(r.choice) };
      }
      const allowLarge = it.hint !== 'small';
      const allowSmall = it.hint !== 'large';
      // 分組延續：寫成八分音符形狀，實際為目前分組的時值
      if (allowSmall && it.cls === 3 && !it.rest && gv && !it.dots) {
        consider(gv, 0.1, gv, gc + 1, false);
      }
      if (allowLarge) consider(LARGE[it.cls], 0, 0, 0, true);
      if (allowSmall) {
        const v = SMALL[it.cls];
        const starts = v <= 64 && !it.dots;
        consider(v, SMALL_COST[v], starts ? v : 0, starts ? 1 : 0, true);
      }
      memo.set(key, best);
      return best;
    }

    const r = rec(0, 0, 0, 0);
    if (!r) return null;
    let total = 0;
    r.choice.forEach((v, k) => (total += ticksOf(v, items[k])));
    return { values: r.choice, total, cost: r.cost };
  }

  MB.durations = { solve, valueClass, LARGE, SMALL, ticksOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
