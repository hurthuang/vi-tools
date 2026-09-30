// 比較兩版語音字典在文章裡的效果：只念「兩版套用結果不同」的句段，列出 Hanhan 念法改變的字，歸到造成改變的新條目
//   用途：新條目在一般文章（不只是會考試題）會不會誤傷。念法改變不一定是對或錯，要抽樣人工判斷
//   輸出 <前綴>-entries.tsv（每個條目改變幾處、例句）與 <前綴>-changes.tsv（每一處）
// 用法（在 vi-tools 根目錄）：node tools/compare-speech-dicts.mjs <舊字典> <新字典> <輸出前綴> <文字檔資料夾>...
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { speak, decode } from './hanhan.mjs';
import { loadSpeechDict, applyDict, stripNotes, show } from './speech-check-lib.mjs';

const [oldPath, newPath, prefix, ...dirs] = process.argv.slice(2);
if (!dirs.length) { console.error('用法：node tools/compare-speech-dicts.mjs <舊字典> <新字典> <輸出前綴> <文字檔資料夾>...'); process.exit(1); }
const oldE = loadSpeechDict(oldPath), newE = loadSpeechDict(newPath);
const oldKeys = new Set(oldE.map(e => e.pat + '\t' + e.rep + '\t' + e.type));
const added = newE.filter(e => !oldKeys.has(e.pat + '\t' + e.rep + '\t' + e.type));

// 句段：連續漢字，太長切成 30 字
const segs = new Map();   // 句段 → 來源
for (const dir of dirs) for (const f of readdirSync(dir).filter(f => /\.txt$/i.test(f))) {
  const { clean } = stripNotes(readFileSync(join(dir, f), 'utf8').replace(/^﻿/, ''));
  for (const m of clean.matchAll(/[㐀-鿿豈-﫿]+/gu)) {
    const s = m[0];
    if ([...s].length !== s.length) continue;
    for (let i = 0; i < s.length; i += 30) { const t = s.slice(i, i + 30); if (t.length >= 2 && !segs.has(t)) segs.set(t, dir.split(/[\\/]/).pop() + '/' + f); }
  }
}
const cand = [];
for (const [t, src] of segs) {
  const a = applyDict(oldE, t), b = applyDict(newE, t);
  if (a !== b && a.length === t.length && b.length === t.length) cand.push({ t, src, a, b });
}
console.log(`句段 ${segs.size}，兩版套用結果不同 ${cand.length}，Hanhan 朗讀中…`);
const s0 = speak(cand.map(c => c.a)), s1 = speak(cand.map(c => c.b));

// 哪個新條目改到這個位置：新條目依序套用在舊版結果上，看哪一條第一次改到該位置
function blame(t, pos) {
  let s = applyDict(oldE, t);
  for (const e of added) {
    const r = s.replace(e.re, e.r);
    if (r.length === s.length && r[pos] !== s[pos]) return e;
    // 替換字造成鄰字念法改變：以「這條條目改到的範圍」前後 2 字內為準
    if (r !== s && r.length === s.length) {
      const diff = [...r].map((c, i) => c !== s[i] ? i : -1).filter(i => i >= 0);
      if (diff.some(i => Math.abs(i - pos) <= 2)) return e;
    }
    s = r;
  }
  return null;
}
const changes = [], byEntry = new Map();
cand.forEach((c, k) => {
  const d0 = decode(s0[k]), d1 = decode(s1[k]);
  if (d0.length !== c.t.length || d1.length !== c.t.length) return;
  const b0 = show(d0), b1 = show(d1);
  for (let i = 0; i < c.t.length; i++) {
    if (b0[i] === b1[i]) continue;
    const e = blame(c.t, i);
    const key = e ? `${e.pat} → ${e.rep}` : '（不明）';
    const ctx = `${c.t.slice(Math.max(0, i - 8), i)}【${c.t[i]}】${c.t.slice(i + 1, i + 8)}`;
    const row = { key, ch: c.t[i], from: b0[i], to: b1[i], ctx, src: c.src, own: e && c.a[i] !== c.b[i] };
    changes.push(row);
    if (!byEntry.has(key)) byEntry.set(key, []);
    byEntry.get(key).push(row);
  }
});
writeFileSync(prefix + '-changes.tsv', '﻿條目\t字\t原念\t新念\t是否替換的字\t句段\t來源\r\n' +
  changes.map(r => [r.key, r.ch, r.from, r.to, r.own ? '是' : '鄰字', r.ctx, r.src].join('\t')).join('\r\n') + '\r\n');
const rows = [...byEntry].sort((a, b) => b[1].length - a[1].length);
writeFileSync(prefix + '-entries.tsv', '﻿條目\t改變處數\t鄰字連帶改變\t例句\r\n' +
  rows.map(([k, v]) => [k, v.length, v.filter(r => !r.own).length, v.slice(0, 6).map(r => `${r.ctx}（${r.from}→${r.to}）`).join('；')].join('\t')).join('\r\n') + '\r\n');
console.log(`念法改變 ${changes.length} 處，涉及 ${byEntry.size} 個條目`);
