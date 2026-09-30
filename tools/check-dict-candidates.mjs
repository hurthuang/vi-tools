// 語音字典的候選條目（原詞 → 同音替換寫法）在真實文章裡的效果：
//   在文章（會考試題本等 UTF-8 文字檔）裡找出每個原詞出現的句段，Hanhan 念「套用現有字典」「再加上候選條目」，
//   比較替換位置的念法：有讀音標注的位置看是否念對；沒有標注的位置列出念法改變的句段給人工判斷（可能是修好，也可能誤傷）
//   另外列出 McBopomofo 詞庫裡含原詞、但該位置念法和替換字不同的詞（可能誤傷）
// 候選檔每行「原詞 替換」（空白或 Tab 分隔）；讀音標注格式同 check-exam-annotations.mjs
// 用法（在 vi-tools 根目錄）：node tools/check-dict-candidates.mjs <候選檔> <文字檔資料夾> <字典.dic> [報告.tsv]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readings, words } from './mcb-data.mjs';
import { speak, decode } from './hanhan.mjs';
import { loadSpeechDict, applyDict as applyAll, makeEntry, stripNotes, HAN } from './speech-check-lib.mjs';

const [candPath, dir, dicPath, outPath = 'dict-candidates.tsv'] = process.argv.slice(2);
if (!candPath || !dir || !dicPath) { console.error('用法：node tools/check-dict-candidates.mjs <候選檔> <文字檔資料夾> <字典.dic> [報告.tsv]'); process.exit(1); }

const entries = loadSpeechDict(dicPath);
const applyDict = (s, extra = []) => applyAll([...entries, ...extra], s);
const cands = readFileSync(candPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim().split(/\s+/))
  .filter(a => a.length === 2 && !a[0].startsWith('#') && [...a[0]].length === [...a[1]].length)
  .map(([pat, rep]) => ({ ...makeEntry(pat, rep), pos: [...pat].map((c, i) => c !== [...rep][i] ? i : -1).filter(i => i >= 0) }));

const texts = readdirSync(dir).filter(f => f.endsWith('.txt')).sort()
  .map(f => ({ name: f, ...stripNotes(readFileSync(join(dir, f), 'utf8').replace(/^\uFEFF/, '')) }));

// 每個候選：找出現的位置，取句段（前後各最多 8 個連續漢字）
const occ = [];
for (const c of cands) for (const t of texts) {
  let k = t.clean.indexOf(c.pat);
  while (k >= 0) {
    let a = k, b = k + c.pat.length - 1;
    while (a > 0 && k - a < 8 && HAN.test(t.clean[a - 1])) a--;
    while (b < t.clean.length - 1 && b - k < c.pat.length + 7 && HAN.test(t.clean[b + 1])) b++;
    const seg = t.clean.slice(a, b + 1);
    if ([...seg].length === seg.length)   // 句段裡沒有擴充區漢字，位置才對得上
      occ.push({ c, file: t.name, seg, at: k - a, wants: c.pos.map(i => t.notes.get(k + i)) });
    k = t.clean.indexOf(c.pat, k + 1);
  }
}
const s0 = speak(occ.map(o => applyDict(o.seg))), s1 = speak(occ.map(o => applyDict(o.seg, [o.c])));
const show = d => d.map(x => x.bpmf.length ? x.bpmf.join('/') : '?');
occ.forEach((o, k) => {
  const d0 = decode(s0[k]), d1 = decode(s1[k]);
  if (d0.length !== o.seg.length || d1.length !== o.seg.length) { o.status = '無法對齊'; return; }
  const b0 = show(d0), b1 = show(d1);
  o.before = o.c.pos.map(i => b0[o.at + i]).join(' '); o.after = o.c.pos.map(i => b1[o.at + i]).join(' ');
  // 替換字念成它自己的讀音？
  o.repOk = o.c.pos.every(i => d1[o.at + i].bpmf.some(b => (readings.get([...o.c.rep][i]) || []).includes(b)));
  // 其他位置的念法有沒有被連帶改變
  o.side = b0.map((x, i) => x !== b1[i] && !o.c.pos.some(p => o.at + p === i) ? `${o.seg[i]}：${x}→${b1[i]}` : '').filter(Boolean).join('、');
  if (o.wants.some(Boolean)) o.status = o.c.pos.every((i, j) => !o.wants[j] || d1[o.at + i].bpmf.includes(o.wants[j])) ? '標注處念對' : '標注處仍念錯';
  else o.status = o.before === o.after ? '沒改變' : '念法改變（沒有標注，需判斷）';
});

// 詞庫裡可能誤傷的詞
for (const c of cands) {
  c.harm = [];
  const want = c.pos.map(i => readings.get([...c.rep][i]) || []);
  for (const [w, e] of words) {
    if (w === c.pat) continue;
    let k = w.indexOf(c.pat);
    while (k >= 0) {
      if (c.pos.some((i, j) => e.bpmf[k + i] && !want[j].includes(e.bpmf[k + i]))) c.harm.push({ w, score: e.score });
      k = w.indexOf(c.pat, k + 1);
    }
  }
  c.harm.sort((a, b) => b.score - a.score);
  c.occ = occ.filter(o => o.c === c);
}

// ── 報告：每個候選一行摘要，後面接每個出現位置
const n = (c, s) => c.occ.filter(o => o.status === s).length;
const tsv = [['原詞', '替換', '替換字讀音', '出現', '標注處念對', '標注處仍念錯', '念法改變（沒有標注）', '沒改變', '替換字念錯', '連帶改變其他字', '詞庫可能誤傷', '念法改變的句段（前→後）'].join('\t')];
for (const c of cands) tsv.push([c.pat, c.rep, c.pos.map(i => readings.get([...c.rep][i]) || ['?']).map(r => r.join('/')).join(' '),
  c.occ.length, n(c, '標注處念對'), n(c, '標注處仍念錯'), n(c, '念法改變（沒有標注，需判斷）'), n(c, '沒改變'),
  c.occ.filter(o => o.repOk === false).length, c.occ.filter(o => o.side).map(o => `${o.seg}（${o.side}）`).slice(0, 3).join('；'),
  c.harm.slice(0, 6).map(h => h.w).join('、') + (c.harm.length > 6 ? `…共 ${c.harm.length} 個` : ''),
  c.occ.filter(o => o.status !== '沒改變' && o.status !== '無法對齊').map(o => `${o.seg}（${o.before}→${o.after}${o.status === '標注處念對' ? '，標注' : o.status === '標注處仍念錯' ? '，標注仍錯' : ''}）`).slice(0, 5).join('；')].join('\t'));
writeFileSync(outPath, '﻿' + tsv.join('\r\n') + '\r\n');
const bad = cands.filter(c => n(c, '標注處仍念錯') || c.occ.some(o => o.repOk === false || o.side) || c.harm.length);
console.log(`候選 ${cands.length} 條，出現 ${occ.length} 處；需要看的 ${bad.length} 條：${bad.map(c => c.pat).join('、')}`);
console.log('報告：' + outPath);
