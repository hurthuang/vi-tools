// 珠算檢查：node tools/check-abacus.mjs（分級規則有意改變時加 --update 重新產生題庫快照）
// 1. abacus-levels.js 的每個代表例題，用出題核心分級後要落在自己那一級
// 2. 各級撥珠教法（complement.html）的小標題「6a 級：名稱（例：…）」要跟 abacus-levels.js 的名稱一致，例題要在那一級的代表例題裡
// 3. 1～4、6～9 級每一級在各級撥珠教法都有小標題
// 4. 題庫：每一題分級後落在自己那一級；兩種撥珠方向的題庫跟快照（fixtures/abacus-bank.json）一樣
// 5. 撥珠動畫：加減乘除、兩種方向，最後算盤上的數（除法是餘數）和點顯器上的商都對，每一步只動到說明裡的檔
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../abacus/', import.meta.url);
const AL = require(new URL('abacus-levels.js', root).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
globalThis.AbacusLevels = AL;

const html = readFileSync(new URL('index.html', root), 'utf8');
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const C = new Function(core.replace("if (typeof module !== 'undefined')", 'if (false)') +
  ';return { classify, classifyMul, classifyDiv, buildBank, inRange };')();
const { abacusSteps } = require(new URL('abacus-anim.js', root).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

let bad = 0;
const fail = msg => { bad++; console.log('✗ ' + msg); };
const norm = e => e.replace(/\s/g, '').replace(/[−-]/g, '−');

// 1. 代表例題分到自己那一級（加減法用從個位開始；5a、5b 是一位數加數，兩種方向一樣）
const OPS = [['add', '+'], ['sub', '-'], ['mul', '×'], ['div', '÷']];
for (const l of AL.LEVELS) for (const [key, op] of OPS) {
  if (!l[key]) continue;
  for (const e of l[key].split('、')) {
    const [x, y] = e.split(/[+−×÷]/).map(Number);
    const got = op === '×' ? C.classifyMul(x, y) : op === '÷' ? C.classifyDiv(x, y) : C.classify(x, y, op);
    if (got !== l.id) fail(`例題 ${e} 標在 ${l.id}，分級結果是 ${got}`);
  }
}

// 2、3. 各級撥珠教法的小標題
const comp = readFileSync(new URL('complement.html', root), 'utf8');
const seen = new Set();
for (const m of comp.matchAll(/<h3[^>]*>(\w+) 級：(.+?)<\/h3>/g)) {
  const [, id, rest] = m;
  const lv = AL.LEVELS.find(l => l.id === id);
  if (!lv) continue;                       // 5a、5b、5c 是小組標題，細項在表格裡
  seen.add(id);
  const ex = rest.match(/（例：(.+?) = /);
  const name = rest.replace(/（例：.*）$/, '');
  if (name !== lv.name) fail(`各級撥珠教法 ${id} 的名稱「${name}」跟資料「${lv.name}」不一樣`);
  if (ex) {
    const all = OPS.flatMap(([k]) => (lv[k] || '').split('、')).filter(Boolean).map(norm);
    if (!all.includes(norm(ex[1]))) fail(`各級撥珠教法 ${id} 的例題 ${ex[1]} 不在代表例題（${all.join('、')}）裡`);
  }
}
for (const l of AL.LEVELS) if (!/^5/.test(l.id) && !seen.has(l.id)) fail(`各級撥珠教法沒有 ${l.id} 級的小標題`);

// 1～4 級的例題放在 h4「例：5 + 3 = 8」，要在那一級的代表例題裡
const lv14 = comp.slice(comp.indexOf('<h2 id="lv1-4">'), comp.indexOf('<h3 id="digits">'));
for (const part of lv14.split('<h3 id="lv').slice(1)) {
  const id = part.match(/^(\w+)"/)[1];
  const lv = AL.LEVELS.find(l => l.id === id);
  const all = [lv.add, lv.sub].join('、').split('、').map(norm);
  for (const m of part.matchAll(/<h4>例：(.+?) = /g)) if (!all.includes(norm(m[1]))) fail(`各級撥珠教法 ${id} 級的例題 ${m[1]} 不在代表例題裡`);
}

// 4. 題庫
const update = process.argv.includes('--update');
const snapUrl = new URL('fixtures/abacus-bank.json', import.meta.url);
const hash = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const snap = {};
for (const high of [false, true]) {
  const dir = high ? 'high' : 'low', bank = C.buildBank(high);
  for (const op of Object.keys(bank)) for (const [lv, items] of Object.entries(bank[op])) {
    if (!items.length) continue;
    for (const [x, y] of items) {
      const got = op === '×' ? C.classifyMul(x, y) : op === '÷' ? C.classifyDiv(x, y) : C.classify(x, y, op, high);
      if (got !== lv || !C.inRange(lv, x, y, op, high)) { fail(`題庫 ${dir} ${x}${op}${y} 放在 ${lv}，分級是 ${got}`); break; }
    }
    snap[`${dir} ${op} ${lv}`] = `${items.length} ${hash(JSON.stringify(items))}`;
  }
}
// 第 9 級每一級三種題型都有題目
for (const lv of ['9a', '9b', '9c', '9d']) for (const f of ['E2', 'E3', 'E4']) {
  const n = C.buildBank(true)['÷'][lv].filter(it => it[2] === f).length;
  if (!n) fail(`第 ${lv} 級沒有 ${f} 題型的題目`);
}
if (update) { writeFileSync(snapUrl, JSON.stringify(snap, null, 1) + '\n'); console.log('已更新題庫快照 tools/fixtures/abacus-bank.json'); }
else {
  let old = {};
  try { old = JSON.parse(readFileSync(snapUrl, 'utf8')); } catch { fail('沒有題庫快照，先跑 node tools/check-abacus.mjs --update'); }
  for (const k of new Set([...Object.keys(old), ...Object.keys(snap)]))
    if (old[k] !== snap[k]) fail(`題庫 ${k} 變了：快照 ${old[k] || '（沒有）'}，現在 ${snap[k] || '（沒有）'}`);
}

// 5. 撥珠動畫
const val = d => d.reduce((s, v, t) => s + v * 10 ** t, 0);
let anim = 0;
function animCheck(x, y, op, dir) {
  anim++;
  const st = abacusSteps(x, y, op, dir), last = st[st.length - 1];
  const want = op === '+' ? x + y : op === '-' ? x - y : op === '×' ? x * y : x % y;
  if (val(last.d) !== want) return fail(`動畫 ${x}${op}${y}（${dir}）最後算盤上是 ${val(last.d)}，應該是 ${want}`);
  if (op === '÷' && last.q !== String(Math.floor(x / y))) return fail(`動畫 ${x}÷${y}（${dir}）商是 ${last.q}`);
  for (let i = 1; i < st.length; i++) for (let k = 0; k < 6; k++) {
    if (st[i].d[k] < 0 || st[i].d[k] > 9) return fail(`動畫 ${x}${op}${y}（${dir}）第 ${i} 步出現 ${st[i].d[k]}`);
    if (st[i].d[k] !== st[i - 1].d[k] && !st[i].moved.includes(k)) return fail(`動畫 ${x}${op}${y}（${dir}）第 ${i} 步動了沒標的檔`);
  }
}
for (const dir of ['low', 'high']) {
  for (let x = 0; x <= 999; x++) for (let y = 1; y <= 99; y++) { animCheck(x, y, '+', dir); if (y <= x) animCheck(x, y, '-', dir); }
  for (let y = 1; y <= 99; y++) for (let x = y; x <= 999; x++) animCheck(x, y, '÷', dir);
}
for (let x = 1; x <= 999; x++) for (let y = 1; y <= 9; y++) animCheck(x, y, '×', 'low');
for (let x = 1; x <= 99; x++) for (let y = 10; y <= 99; y++) animCheck(x, y, '×', 'low');

console.log(bad ? `${bad} 個問題` : `珠算檢查通過：代表例題、各級撥珠教法的標題和例題、題庫（${Object.keys(snap).length} 組）、撥珠動畫（${anim} 題）`);
process.exit(bad ? 1 : 0);
