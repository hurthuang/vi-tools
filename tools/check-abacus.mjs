// 珠算三頁的分級一致性檢查：node tools/check-abacus.mjs
// 1. abacus-levels.js 的每個代表例題，用出題核心分級後要落在自己那一級
// 2. 各級撥珠教法（complement.html）的小標題「6a 級：名稱（例：…）」要跟 abacus-levels.js 的名稱一致，例題要在那一級的代表例題裡
// 3. 1～4、6～9 級每一級在各級撥珠教法都有小標題
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../abacus/', import.meta.url);
const AL = require(new URL('abacus-levels.js', root).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
globalThis.AbacusLevels = AL;

const html = readFileSync(new URL('index.html', root), 'utf8');
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const C = new Function(core.replace("if (typeof module !== 'undefined')", 'if (false)') +
  ';return { classify, classifyMul, classifyDiv };')();

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

console.log(bad ? `${bad} 個問題` : '珠算分級一致：代表例題、各級撥珠教法的標題和例題都對得上');
process.exit(bad ? 1 : 0);
