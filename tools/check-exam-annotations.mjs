// 會考 NVDA 試題本的讀音標注（例：枯荷葉底鷺鷥藏（ㄘㄤ二聲））→ 檢查 Hanhan 套用語音字典後是否念對，念錯的建議新條目
//   試題本先轉成 UTF-8 文字檔（LibreOffice：soffice --headless --convert-to "txt:Text (encoded):UTF8"），
//   檔名前 3 碼是年份（例 115_03.txt）
// 每個標注：取標注字前後的中文句段，Hanhan 念「原文」「套用字典後」，看標注字的讀音
//   已念對：原文就念對
//   字典已修好：原文念錯、套用字典後念對
//   需補條目：套用字典後仍念錯 → 建議條目（詞庫裡含這個字、念法和標注相同的最短詞；沒有就取前後各一字），
//            替換字用只有一個讀音、念法和標注相同的常用字，再念一次確認，並列出詞庫裡可能誤傷的詞
//   無法對齊：Hanhan 念出的音節數和字數不同（有數字、英文、相容字元等）
// 用法（在 vi-tools 根目錄）：node tools/check-exam-annotations.mjs <文字檔資料夾> <字典.dic> [報告.tsv]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readings, words, syllableScore } from './mcb-data.mjs';
import { speak, decode } from './hanhan.mjs';
import { loadSpeechDict, applyDict as applyAll, makeEntry, stripNotes, matches, show as showAll, HAN } from './speech-check-lib.mjs';

const [dir, dicPath, outPath = 'exam-annotations.tsv'] = process.argv.slice(2);
if (!dir || !dicPath) { console.error('用法：node tools/check-exam-annotations.mjs <文字檔資料夾> <字典.dic> [報告.tsv]'); process.exit(1); }

// 字典（含正規式；套用後長度改變的句段位置對不上，結果標「無法對齊」）
const entries = loadSpeechDict(dicPath);
const applyDict = (s, extra = []) => applyAll([...entries, ...extra], s);
const show = dec => showAll(dec).join(' ');
const nextReading = (s, i) => readings.get(s[i + 1]) || [];

// ── 1. 收集標注
const items = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
  const { clean, notes } = stripNotes(readFileSync(join(dir, f), 'utf8').replace(/^\uFEFF/, ''));
  for (const [p, want] of notes) {
    if (!HAN.test(clean[p] || '')) continue;
    // 中文句段：往前後各取最多 8 個連續漢字
    let a = p, b = p;
    while (a > 0 && p - a < 8 && HAN.test(clean[a - 1])) a--;
    while (b < clean.length - 1 && b - p < 8 && HAN.test(clean[b + 1])) b++;
    items.push({ year: f.slice(0, 3), ch: clean[p], want, seg: clean.slice(a, b + 1), at: p - a });
  }
}

// ── 2. Hanhan 念原文、套用字典後
const said0 = speak(items.map(x => x.seg)), said1 = speak(items.map(x => applyDict(x.seg)));
const need = [];
items.forEach((x, k) => {
  const d0 = decode(said0[k]), d1 = decode(said1[k]), n = [...x.seg].length;
  x.orig = show(d0); x.dict = show(d1);
  const nw = nextReading(x.seg, x.at);
  if (d0.length !== n || d1.length !== n) x.status = '無法對齊';
  else if (matches(d0, x.at, x.want, nw)) x.status = '已念對';
  else if (matches(d1, x.at, x.want, nw)) x.status = '字典已修好';
  else { x.status = '需補條目'; need.push(x); }
});

// ── 3. 需補條目：建議原詞與替換
// 替換字：只有一個讀音、就是標注讀音的常用字，最多試 6 個，取第一個在句段裡念對的
const homo = new Map();
for (const [c, rs] of readings) if (rs.length === 1 && syllableScore.has(c)) {
  if (!homo.has(rs[0])) homo.set(rs[0], []);
  homo.get(rs[0]).push(c);
}
for (const cs of homo.values()) cs.sort((a, b) => syllableScore.get(b) - syllableScore.get(a));
function suggestKey(x) {
  const s = x.seg;
  // 詞庫裡：包含標注字、該字念法和標注相同的詞，最短優先、同長常用優先
  let best = null;
  for (let len = 2; len <= 4 && !best; len++)
    for (let a = Math.max(0, x.at - len + 1); a <= x.at && a + len <= s.length; a++) {
      const w = s.slice(a, a + len), e = words.get(w);
      if (e && e.bpmf[x.at - a] === x.want && (!best || e.score > best.score)) best = { w, off: x.at - a, score: e.score, src: '詞庫' };
    }
  if (best) return best;
  // 沒有：前一字 + 標注字 + 後一字（句段邊界就少一邊）
  const a = Math.max(0, x.at - 1), b = Math.min(s.length, x.at + 2);
  return { w: s.slice(a, b), off: x.at - a, src: '前後文' };
}
const entryOf = (x, r) => {
  const rep = [...x.key.w].map((c, i) => i === x.key.off ? r : c).join('');
  return makeEntry(x.key.w, rep);
};
const tries = [];
for (const x of need) {
  x.key = suggestKey(x);
  x.reps = (homo.get(x.want) || []).filter(c => c !== x.ch).slice(0, 6);
  if (!x.reps.length) { x.note = '找不到只有一個讀音的同音字'; continue; }
  for (const r of x.reps) tries.push({ x, r, text: applyDict(x.seg, [entryOf(x, r)]) });
}
const said2 = speak(tries.map(t => t.text));
const withRep = need.filter(x => x.reps.length);
tries.forEach((t, k) => {
  const { x, r } = t;
  if (x.fixed) return;
  const d2 = decode(said2[k]);
  const ok = d2.length === [...x.seg].length && matches(d2, x.at, x.want, nextReading(x.seg, x.at));
  if (ok || r === x.reps[0]) { x.rep = r; x.keyRep = entryOf(x, r).rep; x.after = show(d2); x.fixed = ok; }
});
for (const x of withRep) {
  // 詞庫裡含原詞、但該字念法不同的詞（可能誤傷）
  const harm = [];
  for (const [w, e] of words) {
    if (w === x.key.w) continue;
    let k2 = w.indexOf(x.key.w);
    while (k2 >= 0) {
      if (e.bpmf[k2 + x.key.off] && e.bpmf[k2 + x.key.off] !== x.want) harm.push({ w, score: e.score, b: e.bpmf[k2 + x.key.off] });
      k2 = w.indexOf(x.key.w, k2 + 1);
    }
  }
  x.harm = harm.sort((a, b) => b.score - a.score);
}

// ── 報告
const order = ['需補條目', '字典已修好', '已念對', '無法對齊'];
items.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.ch.localeCompare(b.ch) || a.year.localeCompare(b.year));
const tsv = [['年', '字', '標注讀音', '句段', '結果', 'Hanhan 念原文', 'Hanhan 念套用字典後', '建議原詞', '建議替換', '原詞來源', '套用建議後念對', 'Hanhan 念套用建議後', '可能誤傷（詞庫裡該字念法不同，常用在前）', '備註'].join('\t')];
for (const x of items) tsv.push([x.year, x.ch, x.want, x.seg, x.status, x.orig, x.dict,
  x.key ? x.key.w : '', x.keyRep || '', x.key ? x.key.src : '', x.status !== '需補條目' ? '' : x.fixed ? '是' : '否', x.after || '',
  (x.harm || []).slice(0, 8).map(h => `${h.w}（${h.b}）`).join('、') + ((x.harm || []).length > 8 ? `…共 ${x.harm.length} 個` : ''), x.note || ''].join('\t'));
writeFileSync(outPath, '﻿' + tsv.join('\r\n') + '\r\n');
const count = s => items.filter(x => x.status === s).length;
console.log(`標注 ${items.length} 處：${order.map(s => `${s} ${count(s)}`).join('，')}`);
console.log(`需補條目中：建議條目念對 ${withRep.filter(x => x.fixed).length}，沒有可能誤傷的 ${withRep.filter(x => x.fixed && !x.harm.length).length}`);
console.log('報告：' + outPath);
