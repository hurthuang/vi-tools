/*
 * 珠算出題核心：分級規則、題庫、出題。出題練習（index.html）和家長版（parent.html）共用，node 也能用（tools/check-abacus.mjs）。
 * 要在 abacus-levels.js 之後載入。
 */
// 一個位數上撥珠的難度。a 是算盤上原本的數字，n 是要加（減）的數。
const lo = a => a % 5;
function addd(a, n) {
  if (a + n <= 9) {
    if (n >= 5) return '1';
    return lo(a) + n <= 4 ? '1' : '2';      // 下珠不夠 → 小補數
  }
  const c = 10 - n;                          // 大補數
  if (c >= 5) return '3b';                   // 修正會動上珠
  return lo(a) >= c ? '3a' : '4';            // 下珠不夠扣 → 又要小補數
}
function subd(a, n) {
  if (a >= n) {
    if (n >= 5) return '1';
    return lo(a) >= n ? '1' : '2';
  }
  const c = 10 - n;
  if (c >= 5) return '3b';
  return lo(a) + c <= 4 ? '3a' : '4';
}

// 模擬撥珠，進位／借位馬上撥到左邊一位。預設從個位往左；high 是從最高位往右。
function trace(x, y, op, high) {
  const d = String(x).split('').reverse().map(Number);
  while (d.length < 6) d.push(0);
  const ys = String(y).split('').reverse().map(Number);
  const steps = [];
  function apply(k, v, carry) {
    const a = d[k];
    if (op === '+') {
      steps.push({ k, L: addd(a, v), carry });
      const s = a + v; d[k] = s % 10;
      if (s >= 10) apply(k + 1, 1, true);
    } else {
      steps.push({ k, L: subd(a, v), carry });
      const s = a - v; d[k] = (s + 10) % 10;
      if (s < 0) apply(k + 1, 1, true);
    }
  }
  const order = ys.map((v, k) => [k, v]).filter(([, v]) => v);
  if (high) order.reverse();
  order.forEach(([k, v]) => apply(k, v, false));
  return steps;
}

// 回傳級數代號；不屬於任何一級回傳 null。
// 1～4 級只看撥珠時最難的動作，數字有幾位另外設定。
// 第 5 級是一位數碰不到的情況：左邊一檔進退位時要用小補數（5a）、連續進退位（5b）、
// 進位撞上這一檔自己要加的數（5c）、兩步以上都難（5d）。
const RANK = { '1': 1, '2': 2, '3a': 3, '3b': 3, '4': 4 };
function classify(x, y, op, high) {
  if (y < 10) return classifyOne(x, y, op);
  if (!high) {
    // 從個位開始：進位撞上那一檔自己要加的數 → 5c
    const st = trace(x, y, op);
    const carries = st.filter(s => s.carry), nC = carries.length;
    const ys = String(y).split('').reverse().map(Number);
    if (carries.some(s => ys[s.k])) {
      const has4 = st.some(s => s.L === '4');
      if (nC >= 2) return has4 ? '5c-5' : '5c-4';
      if (has4) return '5c-3';
      return st.slice(1).every(s => s.L === '1') ? '5c-1' : '5c-2';
    }
  }
  return combineSteps(digitSteps(x, y, op, high));
}
// 加減數是一位數：看個位那一步和它引起的進退位
function classifyOne(x, y, op) {
  const st = trace(x, y, op);
  const ones = st[0];
  const carries = st.filter(s => s.carry);
  const nC = carries.length;
  if (nC === 0) return ones.L;                              // 1、2
  if (nC === 1) {
    if (carries[0].L === '1') return ones.L;                // 3a、3b、4
    if (carries[0].L === '2') return '5a' + (ones.L === '4' ? '-2' : '-1');
    return null;
  }
  if (carries.some(s => s.k >= 2 && s.L === '2')) return '5b-3';
  if (carries.some(s => s.L === '2')) return null;          // 十位用小補數又連續進位：不歸類
  return ones.L === '4' ? '5b-2' : '5b-1';
}
// 多位數一位一位撥（從最高位開始，或從個位開始而進位沒有撞上要加的數）：
// 撥 d 在第 k 位只會動到第 k 位和更左邊，所以每一步就是「左邊的部分 ± 一位數」，照 1～4、5a、5b 分。
// 例：從最高位開始 146 − 98，十位那一步是 14 − 9（4 級），個位那一步是 56 − 8（5a）。
function digitSteps(x, y, op, high) {
  const ys = String(y).split('').reverse().map(Number);
  const ks = ys.map((v, k) => k).filter(k => ys[k]);
  if (high) ks.reverse();
  let cur = x;
  return ks.map(k => {
    const p = 10 ** k, L = classifyOne(Math.floor(cur / p), ys[k], op);
    cur += (op === '+' ? 1 : -1) * ys[k] * p;
    return { k, L };
  });
}
// 每一步都是 1～4 級 → 取最難的（一樣難時算個位那一步）。
// 只有一步是第 5 級，其他步不比它難（5a-1、5b-1 配 3 級以下；5a-2、5b-2、5b-3 配 4 級以下）→ 那一級。
// 其他（兩步都是第 5 級，或第 5 級配上更難的一步）→ 5d。
function combineSteps(st) {
  if (st.some(s => !s.L)) return null;
  const five = st.filter(s => !RANK[s.L]).map(s => s.L);
  const top = st.filter(s => RANK[s.L]).sort((a, b) => RANK[b.L] - RANK[a.L] || a.k - b.k).map(s => s.L)[0] || '1';
  if (!five.length) return top;
  if (five.length === 1 && RANK[top] <= (/-2$/.test(five[0]) || five[0] === '5b-3' ? 4 : 3)) return five[0];
  return '5d';
}

// 乘法：照直式，乘數從個位開始一位一位乘（76 × 58 先算 76 × 8，再算 76 × 5），
// 每一位又從被乘數的個位開始；九九的乘積撥在「兩個數字的位數相加」那一位起，照唸法先撥高位。
// 算盤上邊乘邊加，不用記中間結果。回傳每一個撥珠動作 { L, carry }。
function mulTrace(x, y) {
  const d = [0, 0, 0, 0, 0, 0], st = [];
  function add(k, v, carry) {
    st.push({ k, L: addd(d[k], v), carry });
    const s = d[k] + v; d[k] = s % 10;
    if (s >= 10) add(k + 1, 1, true);
  }
  const xs = String(x).split('').reverse().map(Number), ys = String(y).split('').reverse().map(Number);
  ys.forEach((b, j) => xs.forEach((a, i) => {
    String(a * b).split('').reverse().map((v, t) => [i + j + t, +v]).filter(([, v]) => v)
      .reverse().forEach(([k, v]) => add(k, v, false));
  }));
  return st;
}
// 第 6 級（× 一位數）與第 7 級（兩位數 × 兩位數）都看撥珠時最難的動作：
// 直接撥 → 要用小補數 → 要進位（第 7 級再分進位一次、兩次以上）。
// 一位數 × 多位數（3 × 46）換成 46 × 3 來撥，歸第 6 級（課程手冊 N-4-2：可以用交換律轉換，不宜認定為錯誤）。
// 十十乘法（0～10 × 0～10，課程手冊 N-2-7）都是「九九」，包括 × 0、× 1、× 10；它跟撥珠難度無關，不算第 6 級。
function classifyMul(x, y) {
  if (x <= 10 && y <= 10) return '九九';
  if (x < 10 && y >= 10) return classifyMul(y, x);
  const st = mulTrace(x, y), carries = st.filter(s => s.carry).length;
  const g = y < 10 ? '6' : '7';
  if (carries) return g === '6' ? '6c' : carries === 1 ? '7c' : '7d';
  return g + (st.every(s => s.L === '1') ? 'a' : 'b');
}

// 除法（除數一位數）：從最高位開始，這一位（連同上一位剩下的）裡有幾個除數，商就寫幾，乘回來扣掉。
// 第 8 級看題型：每一位都除得盡 → 要往下一位借來除 → 有餘數 → 商有 0 或第一位比除數小。
// 第一位比除數小但商只有一位（28÷7、14÷3）是九九的範圍，不算 8d。
function classifyDiv(x, y) {
  if (x < y) return null;
  if (y >= 10) return classifyDiv2(x, y);
  const ds = String(x).split('').map(Number), qd = [];
  let r = 0, borrow = false;
  ds.forEach((v, i) => {
    r = r * 10 + v;
    const q = Math.floor(r / y);
    if (qd.length || q) qd.push(q);
    r -= q * y;
    if (r && qd.length && i < ds.length - 1) borrow = true;
  });
  if (qd.includes(0) || (qd.length > 1 && qd.length < ds.length)) return '8d';
  if (r) return '8c';
  return borrow ? '8b' : '8a';
}

// 第 9 級（除數兩位數）：商要先估，除數看成最接近的整十，心裡試乘「除數 × 商」確認了才在算盤上一次扣掉。
// 分級看除數的第二位（之後除數三位數也看第二位）：第二位乘以商會進位到前一位，離整十越遠越容易估錯。
// 9a 整十；9b 第二位 1～3（看成小一號的整十，只會估太大）；9c 第二位 7～9（看成大一號的整十，只會估太小）；
// 9d 第二位 4～6（4 往下、5、6 往上，離整十最遠）。
function classifyDiv2(x, y) {
  if (y < 11 || y > 99) return null;
  const u = y % 10;
  return !u ? '9a' : u <= 3 ? '9b' : u >= 7 ? '9c' : '9d';
}

// 分級的名稱、說明、例題放在 abacus-levels.js，三個珠算頁面共用
const LEVELS = (typeof AbacusLevels !== 'undefined' ? AbacusLevels : require('./abacus-levels.js')).LEVELS;

// 1～4 級的題型（數字有幾位），每一級在設定頁分別選。
// 題目大小（使用者 2026-11-01 定案）：不分級數，所有選的級數共用。依運算分三種，可以複選。
// 文獻（MEXT〈珠算編〉、Gissoni、Amato 的教師調查）都以撥法為主，位數只粗分：三位數以上做法跟兩位數一樣。
const FORMS = [
  { id: 'F1', name: '20 以內', ex: '3+4、12+5、12−8' },
  { id: 'F2', name: '兩位數 ± 一位數', ex: '23+4、3+26、41−7' },
  { id: 'F3', name: '兩位數 ± 兩位數', ex: '32+15、23+10、115−71' },
  { id: 'F4', name: '三位數以上', ex: '104+8、268+535、4253−2697' },
  { id: 'M2', name: '被乘數兩位數', ex: '34×2、76×58' },
  { id: 'M3', name: '被乘數三位數', ex: '207×3、324×79' },
  { id: 'D2', name: '被除數兩位數以內', ex: '28÷7、84÷21' },
  { id: 'D3', name: '被除數三位數', ex: '486÷2、736÷23' },
  { id: 'D4', name: '被除數四位數', ex: '1032÷24、5481÷63' },
];
const SIZE_GROUPS = [['加減法', ['F1', 'F2', 'F3', 'F4']], ['乘法', ['M2', 'M3']], ['除法', ['D2', 'D3', 'D4']]];
const DEFAULT_SIZES = ['F1', 'F2', 'F3', 'M2', 'D2'];
const divForm = x => x < 100 ? 'D2' : x < 1000 ? 'D3' : 'D4';
// 九九乘法不分大小
const mulForm = (x, y) => x <= 10 && y <= 10 ? null : Math.max(x, y) < 100 ? 'M2' : 'M3';
// 減法看答案：答案是兩位數以內就跟加法一樣算，所以被減數可以是 1xx（115 − 71、100 − 1，就是 44 + 71、99 + 1 倒過來）。
// 一位數 + 兩位數（3 + 26，小的數在前面）算「兩位數 ± 一位數」（MEXT〈珠算編〉有專門一小節）。
function formOf(x, y, op) {
  const r = op === '+' ? x + y : x - y;
  if (y >= 10 && x < 10 && op === '+' && y <= 99) return r <= 20 ? 'F1' : 'F2';
  if (y >= 10) return x >= 10 && (op === '+' ? x <= 99 : r <= 99) ? 'F3' : null;
  if (x <= 20 && r <= 20) return 'F1';
  return (op === '+' ? x : r) <= 99 ? 'F2' : null;
}
// 一題的題目大小；超出範圍（五位數以上）回傳 null
function sizeOf(x, y, op) {
  if (op === '×') return mulForm(x, y);
  if (op === '÷') return divForm(x);
  return formOf(x, y, op) || (Math.max(x, y) <= 9999 ? 'F4' : null);
}
// 題庫（全列）的範圍：加減法到兩位數 ± 兩位數，三位數以上用 sampleBank 抽題
function inRange(lv, x, y, op) {
  if (lv === '九九') return x >= 0 && x <= 10 && y >= 0 && y <= 10;
  // 第 6 級被乘數到三位數（課程手冊 N-3-3，含 207 × 3 這種十位是 0 的）
  if (lv.startsWith('6')) return x >= 11 && x <= 999 && y >= 2 && y <= 9;
  // 第 7 級被乘數到三位數（N-4-2），可以有 0（30 × 49、16 × 30：乘數個位是 0 時那一行不用撥）
  if (lv.startsWith('7')) return x >= 10 && x <= 999 && y >= 10 && y <= 99;
  if (lv.startsWith('8')) return y >= 2 && y <= 9 && x >= y && x <= 999;
  if (lv.startsWith('9')) return y >= 11 && y <= 99 && x >= y && x <= 999;
  return !!formOf(x, y, op);
}

// 建立題庫：bank[op][level] = [[x, y, 題目大小], ...]；乘法放在 bank['×']，除法放在 bank['÷']。
let mulDivBank = null;   // 乘除法跟撥珠方向無關，兩個方向共用
function buildBank(high) {
  const bank = { '+': {}, '-': {}, '×': {}, '÷': {} };
  for (const lv of LEVELS) for (const op of ['+', '-']) bank[op][lv.id] = [];
  for (const op of ['+', '-']) {
    for (let x = 1; x <= 199; x++) {
      for (let y = 1; y <= 99; y++) {
        if (op === '-' && y >= x) break;        // 不出答案是 0 的題目
        const f = formOf(x, y, op);
        if (!f) continue;
        const lv = classify(x, y, op, high);
        if (lv) bank[op][lv].push([x, y, f]);
      }
    }
  }
  if (!mulDivBank) mulDivBank = buildMulDiv();
  bank['×'] = mulDivBank['×']; bank['÷'] = mulDivBank['÷'];
  return bank;
}
function buildMulDiv() {
  const bank = { '×': {}, '÷': {} };
  for (const lv of LEVELS) for (const op in bank) bank[op][lv.id] = [];
  for (let x = 0; x <= 999; x++) for (let y = 0; y <= 99; y++) {
    const lv = classifyMul(x, y);
    if (inRange(lv, x, y, '×')) bank['×'][lv].push([x, y, mulForm(x, y)]);
  }
  for (let x = 2; x <= 999; x++) for (let y = 2; y <= 99 && y <= x; y++) {
    const lv = classifyDiv(x, y);
    if (lv && inRange(lv, x, y, '÷')) bank['÷'][lv].push([x, y, divForm(x)]);
  }
  return bank;
}

// 三位數以上的加減（F4，三位數、四位數各半）和四位數 ÷ 一位數、兩位數（D4）：用固定的亂數種子抽 SAMPLE_TRIES 題，
// 分級後每一級最多留 SAMPLE_MAX 題。種子固定，所以每次打開抽到的一樣（檢查腳本也能比對快照）。
// 加數、被加數位數各種組合都有（3 + 268、104 + 8）。
const SAMPLE_TRIES = 40000, SAMPLE_MAX = 300, sampled = {};
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function sampleBank(op, high) {
  const key = `${high ? 'high' : 'low'} ${op}`;
  if (sampled[key]) return sampled[key];
  const rand = seeded({ '+': 1, '-': 2, '÷': 3 }[op] * 2 + (high ? 1 : 0));
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const num = d => int(d === 1 ? 1 : 10 ** (d - 1), 10 ** d - 1);
  const out = {}, seen = new Set();
  for (let i = 0; i < SAMPLE_TRIES; i++) {
    let x, y;
    const D = int(3, 4);
    if (op === '÷') { x = num(4); y = rand() < 0.5 ? int(2, 9) : int(11, 99); }
    else if (op === '+') { const dx = int(1, D); x = num(dx); y = num(dx === D ? int(1, D) : D); }
    else { x = num(D); y = num(int(1, D)); if (y >= x) continue; }
    const k = x + op + y;
    if (seen.has(k) || (op !== '÷' && sizeOf(x, y, op) !== 'F4')) continue;   // 150 − 98 這種在題庫裡已經有
    seen.add(k);
    const lv = op === '÷' ? classifyDiv(x, y) : classify(x, y, op, high);
    if (!lv) continue;
    const list = out[lv] || (out[lv] = []);
    if (list.length < SAMPLE_MAX) list.push([x, y, sizeOf(x, y, op)]);
  }
  return sampled[key] = out;
}
// 一級、一種運算可以出的題目：sizes 是選的題目大小（十十乘法不分大小，一律可以出）
function poolOf(bank, op, lv, sizes, high) {
  const ok = it => !it[2] || sizes.includes(it[2]);
  const list = (bank[op][lv] || []).filter(ok);
  if ((op === '÷' ? sizes.includes('D4') : op !== '×' && sizes.includes('F4'))) list.push(...(sampleBank(op, op === '÷' ? false : high)[lv] || []));
  return list;
}

// 讀學生答案：接受 #15、＃１５、點字 ⠼⠂⠢。
const NEMETH_DIGITS = '⠴⠂⠆⠒⠲⠢⠖⠶⠦⠔';
function parseAnswer(raw) {
  let s = raw.normalize('NFKC').replace(/[\s⠀]+/g, '');
  s = s.replace(/⠼/g, '#').replace(/[⠴⠂⠆⠒⠲⠢⠖⠶⠦⠔]/g, ch => String(NEMETH_DIGITS.indexOf(ch)));
  const m = s.match(/^(#?)(\d+)$/);
  if (!m) return null;
  return { hasSign: m[1] === '#', value: parseInt(m[2], 10) };
}

// ---- 出題 ----
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// 第 9 級的商自然分布偏小（兩位數 ÷ 兩位數大多商 1），照商分堆輪流取，商一位看商、商兩位看商的十位
function quotOrder(items) {
  const heaps = new Map();
  for (const it of shuffle(items.slice())) {
    const q = Math.floor(it[0] / it[1]), k = q < 10 ? 'q' + q : 't' + Math.floor(q / 10);
    if (!heaps.has(k)) heaps.set(k, []);
    heaps.get(k).push(it);
  }
  const out = [];
  while (heaps.size) for (const k of shuffle([...heaps.keys()])) {
    const h = heaps.get(k);
    out.push(h.pop());
    if (!h.length) heaps.delete(k);
  }
  return out;
}
const order = (lv, items) => lv[0] === '9' ? quotOrder(items) : shuffle(items);

// picks：勾選的「級別|運算」，例如 ['2|+', '2|-', '6b|×', '8a|÷']；pool(op, lv) 回傳這一項可以出的題目
function makeProblems(picks, count, pool) {
  const pools = [];
  for (const [lv, op] of picks.map(v => v.split('|'))) {
    const list = pool(op, lv);
    if (list.length) pools.push({ op, lv, items: order(lv, list.slice()), i: 0 });
  }
  if (!pools.length) return [];
  // 題數平均分給各級，同一級再平均分給加、減；除不盡的餘數隨機給
  const split = (n, k) => { const a = Array(k).fill(Math.floor(n / k)); shuffle([...a.keys()]).slice(0, n % k).forEach(i => a[i]++); return a; };
  const levels = [...new Set(pools.map(p => p.lv))];
  split(count, levels.length).forEach((n, li) => {
    const ps = pools.filter(p => p.lv === levels[li]);
    split(n, ps.length).forEach((m, pi) => { ps[pi].left = m; });
  });
  // 排順序：大多換一種，但約一半的機會允許連著出，免得完全輪流被猜到；
  // 某一種剩太多（超過一半）時先出它，免得最後擠在一起
  const seq = [];
  for (let rest = count; rest > 0; rest--) {
    const last = Math.random() < 0.5 ? null : seq[seq.length - 1];
    let cand = pools.filter(p => p.left > rest / 2);
    if (!cand.length) cand = pools.filter(p => p.left && p !== last);
    if (!cand.length) cand = pools.filter(p => p.left);
    let r = Math.random() * cand.reduce((s, p) => s + p.left, 0);
    const p = cand.find(c => (r -= c.left) < 0) || cand[cand.length - 1];
    p.left--; seq.push(p);
  }
  return seq.map(p => {
    if (p.i >= p.items.length) { p.items = order(p.lv, p.items); p.i = 0; }
    const [x, y, form] = p.items[p.i++];
    return { x, y, op: p.op, lv: p.lv, form };
  });
}

// 除法的 calc 是商，餘數另外算
const calc = p => p.op === '+' ? p.x + p.y : p.op === '-' ? p.x - p.y : p.op === '×' ? p.x * p.y : Math.floor(p.x / p.y);
// 商只少了 0（206 打成 26、20 打成 2）：打的數字依序都在答案裡，少掉的全是 0
function missingZero(typed, ans) {
  const t = String(typed), s = String(ans);
  if (t.length >= s.length) return false;
  let j = 0;
  for (const ch of s) { if (ch === t[j]) j++; else if (ch !== '0') return false; }
  return j === t.length;
}
const remOf = p => p.op === '÷' ? p.x % p.y : 0;
const ansText = p => calc(p) + (remOf(p) ? ` 餘 ${remOf(p)}` : '');
const sym = op => ({ '+': '+', '-': '−', '×': '×', '÷': '÷' })[op];

if (typeof module !== 'undefined') module.exports = { addd, subd, trace, mulTrace, classify, classifyOne, digitSteps, sizeOf, sampleBank, poolOf, SIZE_GROUPS, DEFAULT_SIZES, classifyMul, classifyDiv, classifyDiv2, divForm, mulForm, formOf, inRange, buildBank, parseAnswer, LEVELS, FORMS, makeProblems, calc, remOf, ansText, sym };
