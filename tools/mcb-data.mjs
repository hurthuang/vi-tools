// McBopomofo（mcbopomofo-service.js）內附資料，給 Node 工具用
//   readings：字 → [注音]（webBpmfvsVariants，約 1.2 萬字，含多音字的每個讀音）
//   words：詞 → { bpmf: [每個字的注音], score }（webData 語言模型；鍵是編碼過的注音，每個音節 2 個字元）
//   syllableScore：單字 → 單字詞在語言模型裡最高的分數（越大越常用）
// 語言模型的音節編碼不直接解：用「鍵裡的單字、它們在 readings 裡的讀音」多數決，得到每個 2 字元編碼對應的注音
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'mcbopomofo-service.js'), 'utf8');

function grab(name) {
  const tag = name + "=JSON.parse('";
  const i = src.indexOf(tag);
  if (i < 0) throw new Error('mcbopomofo-service.js 裡找不到 ' + name);
  let j = i + tag.length;
  while (!(src[j] === "'" && src[j - 1] !== '\\')) j++;
  return JSON.parse(eval("'" + src.slice(i + tag.length, j) + "'"));   // 字串常值的跳脫交給 JS 解
}

export const readings = new Map();
for (const k of Object.keys(grab('webBpmfvsVariants'))) {
  const j = k.indexOf('-'), ch = k.slice(0, j), r = k.slice(j + 1);
  if (r === 'na') continue;
  if (!readings.has(ch)) readings.set(ch, []);
  readings.get(ch).push(r);
}

const D = grab('webData');
const parse = v => { const p = String(v).split(' '), out = []; for (let i = 0; i + 1 < p.length; i += 2) out.push({ w: p[i], score: Number(p[i + 1]) }); return out; };

// 單音節：2 字元編碼 → 注音（多數決）
const codeToBpmf = new Map();
export const syllableScore = new Map();
for (const [k, v] of Object.entries(D)) {
  if (k.length !== 2 || k.startsWith('_')) continue;
  const vote = new Map();
  for (const { w, score } of parse(v)) {
    if ([...w].length !== 1) continue;
    syllableScore.set(w, Math.max(syllableScore.get(w) ?? -99, score));
    for (const r of readings.get(w) || []) vote.set(r, (vote.get(r) || 0) + 1);
  }
  const best = [...vote].sort((a, b) => b[1] - a[1])[0];
  if (best) codeToBpmf.set(k, best[0]);
}

// 多音節詞：鍵每 2 字元一個音節，全部解得出來、字數和音節數相同才收；同一個詞有多個讀音時留分數高的
export const words = new Map();
for (const [k, v] of Object.entries(D)) {
  if (k.length < 4 || k.length % 2 || k.startsWith('_')) continue;
  const bpmf = [];
  for (let i = 0; i < k.length; i += 2) { const b = codeToBpmf.get(k.slice(i, i + 2)); if (!b) { bpmf.length = 0; break; } bpmf.push(b); }
  if (!bpmf.length) continue;
  for (const { w, score } of parse(v)) {
    if ([...w].length !== bpmf.length) continue;
    const old = words.get(w);
    if (!old || score > old.score) words.set(w, { bpmf, score });
  }
}

// 只有一個讀音的字 → 那個讀音；多音字 → null
export const singleReading = ch => { const r = readings.get(ch); return r && r.length === 1 ? r[0] : null; };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`字→讀音 ${readings.size} 字；單音節編碼 ${codeToBpmf.size}；多音節詞 ${words.size}`);
  for (const w of ['酪農', '銀行', '行走', '本事', '待人', '在地', '安地斯山脈']) console.log(w, words.get(w)?.bpmf.join(' ') ?? '（沒有）');
}
