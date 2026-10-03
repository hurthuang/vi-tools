// 找語音字典可以補的詞：文章全文讓 Hanhan（套用語音字典後）念，和 McBopomofo 詞庫的讀音比對
//   每個句段用詞庫切詞（最大分數路徑，2–6 字的詞），詞裡每個字的詞庫讀音當「應念」；
//   不在任何詞裡的字，只有一個讀音時也比對。Hanhan 念的不符合應念就記一次
//   統計：同一個「詞＋第幾字」出現幾次、念錯幾次 → 念錯次數多的詞就是候選條目；
//        單一讀音的字另外統計（任何位置都念錯的字可以用單字條目）
//   --chars：另外把所有單一讀音的常用字單獨念一次，列出念錯的（不限文章裡出現的字）
// 限制：詞庫讀音是 McBopomofo 的（偏口語，不一定是審訂音）、切詞可能切錯；結果要人工判斷
// 用法（在 vi-tools 根目錄）：node tools/scan-hanhan-polyphones.mjs <文字檔資料夾> <字典.dic> [輸出前綴] [--chars]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readings, words, syllableScore } from './mcb-data.mjs';
import { speak, decode } from './hanhan.mjs';
import { loadSpeechDict, applyDict, stripNotes, matches, show, HAN } from './speech-check-lib.mjs';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [dir, dicPath, prefix = 'hanhan-scan'] = args;
if (!dir || !dicPath) { console.error('用法：node tools/scan-hanhan-polyphones.mjs <文字檔資料夾> <字典.dic> [輸出前綴] [--chars]'); process.exit(1); }
const entries = loadSpeechDict(dicPath);

// ── 1. 句段（連續漢字，太長的切成 30 字）
const segs = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
  const { clean } = stripNotes(readFileSync(join(dir, f), 'utf8').replace(/^﻿/, ''));
  for (const m of clean.matchAll(/[㐀-鿿]+/gu)) {
    const s = m[0];
    if ([...s].length !== s.length || s.length < 2) continue;   // 擴充區漢字位置對不上
    for (let i = 0; i < s.length; i += 30) if (s.length - i >= 2) segs.push({ file: f, text: s.slice(i, i + 30) });
  }
}
const uniq = [...new Set(segs.map(s => s.text))];
console.log(`句段 ${segs.length}（不重複 ${uniq.length}），Hanhan 朗讀中…`);

// ── 2. 詞庫切詞：分數最大的路徑；單字的分數固定 -12（詞庫沒有單字詞）
const SINGLE = -12;
function segment(s) {
  const best = new Array(s.length + 1).fill(-Infinity), from = new Array(s.length + 1);
  best[0] = 0;
  for (let i = 0; i < s.length; i++) {
    if (best[i] === -Infinity) continue;
    if (best[i] + SINGLE > best[i + 1]) { best[i + 1] = best[i] + SINGLE; from[i + 1] = [i, null]; }
    for (let len = 2; len <= 6 && i + len <= s.length; len++) {
      const e = words.get(s.slice(i, i + len));
      if (e && best[i] + e.score > best[i + len]) { best[i + len] = best[i] + e.score; from[i + len] = [i, e]; }
    }
  }
  const out = [];
  for (let j = s.length; j > 0; j = from[j][0]) out.unshift({ at: from[j][0], w: s.slice(from[j][0], j), e: from[j][1] });
  return out;
}

// ── 3. 朗讀（套用字典後長度不變的才比對，位置才對得上）
const spoken = uniq.map(t => applyDict(entries, t));
const said = speak(spoken.map((t, k) => t.length === uniq[k].length ? t : ''));
const byWord = new Map(), bySingle = new Map();
let compared = 0, skipped = 0;
uniq.forEach((t, k) => {
  if (spoken[k].length !== t.length) { skipped++; return; }
  const dec = decode(said[k]);
  if (dec.length !== t.length) { skipped++; return; }
  compared++;
  const got = show(dec);
  const want = new Array(t.length).fill(null), alts = new Array(t.length).fill(null), wordOf = new Array(t.length).fill(null);
  for (const p of segment(t)) {
    if (p.e) p.e.bpmf.forEach((b, i) => { want[p.at + i] = b; alts[p.at + i] = [...new Set(p.e.alts.map(a => a[i]))]; wordOf[p.at + i] = [p.w, i]; });
    else { const r = readings.get(p.w); if (r && r.length === 1) want[p.at] = r[0]; }
  }
  for (let i = 0; i < t.length; i++) {
    if (!want[i] || '一不'.includes(t[i])) continue;   // 一、不的變調交給 Hanhan
    // 後一個字：詞庫讀音＋它所有可能的讀音（三聲變調用）
    const next = [want[i + 1], ...(readings.get(t[i + 1]) || [])].filter(Boolean);
    const ok = (alts[i] || [want[i]]).some(w => matches(dec, i, w, next));
    const ctx = t.slice(Math.max(0, i - 6), i + 7);
    const rs = readings.get(t[i]) || [];
    // 單一讀音的字（不論在不在詞裡）
    // 應念用字的唯一讀音（詞庫的詞可能用別的念法，例：液體 ㄧˋ）
    if (rs.length === 1) {
      const ok1 = matches(dec, i, rs[0], next);
      if (!bySingle.has(t[i])) bySingle.set(t[i], { want: rs[0], n: 0, bad: 0, got: new Map(), ex: [] });
      const o = bySingle.get(t[i]); o.n++;
      if (!ok1) { o.bad++; o.got.set(got[i], (o.got.get(got[i]) || 0) + 1); if (o.ex.length < 3) o.ex.push(ctx); }
    }
    // 多音字在詞裡
    if (rs.length > 1 && wordOf[i]) {
      const key = wordOf[i][0] + '\t' + wordOf[i][1];
      if (!byWord.has(key)) byWord.set(key, { w: wordOf[i][0], pos: wordOf[i][1], want: alts[i].join('/'), n: 0, bad: 0, got: new Map(), ex: [] });
      const o = byWord.get(key); o.n++;
      if (!ok) { o.bad++; o.got.set(got[i], (o.got.get(got[i]) || 0) + 1); if (o.ex.length < 3) o.ex.push(ctx); }
    }
  }
});
console.log(`比對 ${compared} 句段，略過 ${skipped}（字典改變長度或念出的音節數不同）`);

const top = m => [...m].sort((a, b) => b[1] - a[1]).map(([g, c]) => `${g}×${c}`).join('、');
const w1 = [['詞', '第幾字', '字', '詞庫讀音（有多個時以 / 分隔）', '出現', 'Hanhan 念錯', '念錯比例', 'Hanhan 念成', '例句'].join('\t')];
for (const o of [...byWord.values()].filter(o => o.bad).sort((a, b) => b.bad - a.bad || b.n - a.n))
  w1.push([o.w, o.pos + 1, o.w[o.pos], o.want, o.n, o.bad, (o.bad / o.n).toFixed(2), top(o.got), o.ex.join('／')].join('\t'));
writeFileSync(prefix + '-words.tsv', '﻿' + w1.join('\r\n') + '\r\n');
const w2 = [['字', '讀音', '出現', 'Hanhan 念錯', '念錯比例', 'Hanhan 念成', '例句'].join('\t')];
for (const [c, o] of [...bySingle].filter(([, o]) => o.bad).sort((a, b) => b[1].bad - a[1].bad))
  w2.push([c, o.want, o.n, o.bad, (o.bad / o.n).toFixed(2), top(o.got), o.ex.join('／')].join('\t'));
writeFileSync(prefix + '-single.tsv', '﻿' + w2.join('\r\n') + '\r\n');
console.log(`詞裡的多音字念錯：${w1.length - 1} 組；單一讀音字念錯：${w2.length - 1} 字`);

// ── 4. --chars：單一讀音的常用字單獨念
if (process.argv.includes('--chars')) {
  const cs = [...readings].filter(([c, r]) => r.length === 1 && syllableScore.has(c) && [...c].length === 1 && c.length === 1).map(([c]) => c);
  const s = speak(cs);
  const w3 = [['字', '讀音', '常用度', 'Hanhan 單獨念'].join('\t')];
  const bad = [];
  cs.forEach((c, k) => {
    const dec = decode(s[k]);
    const r = readings.get(c)[0];
    if (dec.length === 1 && !matches(dec, 0, r)) bad.push([c, r, syllableScore.get(c), show(dec)[0]]);
  });
  bad.sort((a, b) => b[2] - a[2]).forEach(x => w3.push(x.join('\t')));
  writeFileSync(prefix + '-chars.tsv', '﻿' + w3.join('\r\n') + '\r\n');
  console.log(`單一讀音常用字 ${cs.length} 個，單獨念錯 ${bad.length} 個`);
}
