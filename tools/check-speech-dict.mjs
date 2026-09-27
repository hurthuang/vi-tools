// 用 Hanhan 檢查 NVDA 語音字典（例：會考 NVDA 可攜版 userConfig\speechDicts\default.dic、DictSwitcher 的 my_dict.dic）
// 字典是「原詞 → 同音替換寫法」逐字替換（例：這首曲 → 這首娶），每一條檢查：
//   有效：替換後 Hanhan 在替換的位置念成替換字的讀音（替換字是多音字時，念成它的任一讀音都算）
//   原詞已念對：原詞 Hanhan 在同樣位置已經念對（念法會隨 Windows 版本改變，只供參考，不代表可以刪）
//   需人工確認：替換字在 McBopomofo 查不到讀音，或替換後仍不是預期的讀音
//   資料問題：原詞含 CJK 相容字元（外觀相同、碼位不同，一般文件不會被取代）、重複的條目
//   可能誤傷：McBopomofo 詞庫裡包含這個原詞、但在那個詞裡念法和原詞本身不同的詞（語境不同），
//            套用整份字典後 Hanhan 念錯、不套用時念對；只是標準不同（同一個詞，清單讀音和詞庫不同）的另外計數
// 限制：Hanhan 回報的念法分不出送氣（ㄐ／ㄑ、ㄗ／ㄘ）與零聲母／ㄍ，這幾類互相念錯時抓不到；
//       詞庫讀音來自 McBopomofo，不一定是審訂表標準；詞庫只有詞，句子裡的語境（例：穿著衣服）檢查不到
// 用法（在 vi-tools 根目錄）：node tools/check-speech-dict.mjs <字典.dic> [報告.tsv]
import { readFileSync, writeFileSync } from 'node:fs';
import { readings, words } from './mcb-data.mjs';
import { speak, decode } from './hanhan.mjs';

const [dicPath, outPath = 'speech-dict-check.tsv'] = process.argv.slice(2);
if (!dicPath) { console.error('用法：node tools/check-speech-dict.mjs <字典.dic> [報告.tsv]'); process.exit(1); }

// NVDA SpeechDictEntry：type 0 任意位置、1 正規式、2 整詞（Python 的 \b 認得中文，JS 要自己用 Unicode 字元類別）
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const entries = [];
readFileSync(dicPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).forEach((l, i) => {
  if (!l || l.startsWith('nvda_speech_dict')) return;
  const [pat, rep = '', cs, type] = l.split('\t');
  if (pat === undefined || type === undefined) return;
  const flags = 'gu' + (cs === '1' ? '' : 'i');
  let re;
  try {
    re = type === '1' ? new RegExp(pat, flags.replace('u', ''))
      : new RegExp(type === '2' ? `(?<![\\p{L}\\p{N}_])${esc(pat)}(?![\\p{L}\\p{N}_])` : esc(pat), flags);
  } catch { return; }
  entries.push({ line: i + 1, pat, rep, type, re, r: type === '1' ? rep.replace(/\\(\d)/g, '$$$1') : rep.replace(/\$/g, '$$$$') });
});
// 套用整份字典（照檔案順序）；檢查誤傷時用
const applyAll = s => entries.reduce((t, e) => t.replace(e.re, e.r), s);

const TONE = b => (b.match(/[ˊˇˋ˙]$/) || ['ˉ'])[0];
const BASE = b => b.replace(/[ˊˇˋ˙]$/, '');
const CJK = /^[㐀-鿿豈-﫿]+$/u;
const COMPAT = /[豈-﫿]|[\u{2F800}-\u{2FA1F}]/u;   // CJK 相容字元
const hex = c => 'U+' + c.codePointAt(0).toString(16).toUpperCase();
const compatNote = s => [...s].filter(c => COMPAT.test(c))
  .map(c => `「${c}」是相容字元 ${hex(c)}（一般的字是 ${hex(c.normalize('NFC'))}），文件裡一般的字不會被取代，Hanhan 也不念`).join('；');

// Hanhan 某個位置念的音是否符合預期（預期可有多個）；容許三聲連讀變二聲、輕聲念成其他聲調
function matches(dec, i, wants, nextWant) {
  const got = dec[i] ? dec[i].bpmf : [];
  for (const w of wants) {
    const ok = [w];
    if (TONE(w) === 'ˇ' && nextWant && TONE(nextWant) === 'ˇ') ok.push(BASE(w) + 'ˊ');
    if (TONE(w) === '˙') ['', 'ˊ', 'ˇ', 'ˋ'].forEach(t => ok.push(BASE(w) + t));
    if (got.some(g => ok.includes(g))) return true;
  }
  return false;
}
const show = dec => dec.map(x => x.bpmf.length ? x.bpmf.join('/') : '?').join(' ');

// ── 1. 每一條：原詞、替換後（相容字元先正規化再念，另外標註）
const rows = [];
const seen = new Map();
const checkable = entries.filter(e => e.type !== '1' && CJK.test(e.pat) && CJK.test(e.rep) && [...e.pat].length === [...e.rep].length);
const norm = s => s.normalize('NFC');
const said = speak(checkable.flatMap(e => [norm(e.pat), norm(e.rep)]));
checkable.forEach((e, k) => {
  const P = [...norm(e.pat)], R = [...norm(e.rep)];
  const dO = decode(said[2 * k]), dR = decode(said[2 * k + 1]);
  const pos = P.map((c, i) => c !== R[i] ? i : -1).filter(i => i >= 0);
  const wantAt = i => readings.get(R[i]) || [];
  const nextW = i => wantAt(i + 1)[0];
  const note = [];
  const dup = seen.get(e.pat + '\t' + e.rep);
  if (dup) note.push(`和第 ${dup} 行重複`);
  seen.set(e.pat + '\t' + e.rep, e.line);
  const compat = compatNote(e.pat);
  if (compat) note.push(compat);
  e.want = pos.map(i => `${R[i]}=${wantAt(i).join('/') || '（查不到）'}`).join('、');
  let status;
  if (compat) status = '資料問題';
  else if (pos.some(i => !wantAt(i).length)) { status = '需人工確認'; note.push(`替換字查不到讀音，Hanhan 念成 ${pos.map(i => dR[i] ? dR[i].bpmf.join('/') || '?' : '?').join('、')}`); }
  else if (!pos.every(i => matches(dR, i, wantAt(i), nextW(i)))) status = '需人工確認';
  else if (pos.every(i => matches(dO, i, wantAt(i), nextW(i)))) status = '有效（原詞已念對）';
  else status = '有效';
  if (dup && status !== '資料問題') status = '資料問題';
  rows.push({ e, status, orig: show(dO), rep: show(dR), note: note.join('；'), harm: [], std: [] });
});
for (const e of entries.filter(x => !checkable.includes(x)))
  rows.push({ e, status: '未檢查', orig: '', rep: '', harm: [], std: [],
    note: e.type === '1' ? '正規式' : !CJK.test(e.pat) || !CJK.test(e.rep) ? '不是中文逐字替換' : '原詞和替換字數不同' });

// ── 2. 誤傷：詞庫裡包含原詞的其他詞
const cands = [];
for (const row of rows.filter(r => r.status !== '未檢查')) {
  const { e } = row, pat = norm(e.pat), own = words.get(pat);
  for (const [w, { bpmf, score }] of words) {
    if (w === pat) continue;
    const k = w.indexOf(pat);
    if (k < 0) continue;
    const after = applyAll(w);
    if (after === w) continue;   // 被更長的條目先處理掉，或這個位置沒套到
    const at = [...w.slice(0, k)].length;
    // 單字條目，或原詞本身在詞庫的念法和這個詞裡相同 → 標準不同（清單有意改念法）；不同 → 語境不同；原詞不在詞庫 → 無法判斷
    const sameSense = [...pat].length === 1 || (own && own.bpmf.every((b, i) => bpmf[at + i] === b));
    if (sameSense) { row.std.push({ w, score }); continue; }
    cands.push({ row, w, bpmf, score, after, unknown: !own });
  }
}
console.log(`檢查 ${checkable.length} 條；語境不同的候選 ${cands.length} 個詞，交給 Hanhan 念…`);
const s1 = speak(cands.map(c => c.w)), s2 = speak(cands.map(c => c.after));
cands.forEach((c, k) => {
  const d0 = decode(s1[k]), d1 = decode(s2[k]);
  if (d0.length !== c.bpmf.length || d1.length !== c.bpmf.length) return;
  const okAt = (d, i) => matches(d, i, [c.bpmf[i]], c.bpmf[i + 1]);
  const bad = c.bpmf.map((_, i) => i).filter(i => !okAt(d1, i));
  if (bad.length && bad.every(i => okAt(d0, i)))
    c.row.harm.push({ score: c.score, text: `${c.unknown ? '【原詞不在詞庫，可能只是標準不同】' : ''}${c.w}（應念 ${bad.map(i => [...c.w][i] + c.bpmf[i]).join('、')}，套用後念 ${bad.map(i => d1[i].bpmf.join('/') || '?').join('、')}）` });
});

// ── 報告
const order = ['資料問題', '需人工確認', '有效', '有效（原詞已念對）', '未檢查'];
rows.sort((a, b) => (b.harm.length > 0) - (a.harm.length > 0) || order.indexOf(a.status) - order.indexOf(b.status) || a.e.line - b.e.line);
const tsv = [['行', '原詞', '替換', '結果', '替換字讀音', 'Hanhan 念原詞', 'Hanhan 念替換後', '備註', '可能誤傷的詞（語境不同，常用在前）', '標準不同的詞（清單有意改念法，也可能藏著語境不同，常用在前）'].join('\t')];
for (const r of rows) tsv.push([r.e.line, r.e.pat, r.e.rep, r.status, r.e.want || '', r.orig, r.rep, r.note,
  r.harm.sort((a, b) => b.score - a.score).slice(0, 8).map(h => h.text).join('；') + (r.harm.length > 8 ? `；…共 ${r.harm.length} 個` : ''),
  r.std.sort((a, b) => b.score - a.score).slice(0, 6).map(x => x.w).join('、') + (r.std.length > 6 ? `…共 ${r.std.length} 個` : '')].join('\t'));
writeFileSync(outPath, '﻿' + tsv.join('\r\n') + '\r\n');
const count = s => rows.filter(r => r.status === s).length;
console.log(`共 ${rows.length} 條：${order.map(s => `${s} ${count(s)}`).join('，')}；有可能誤傷的條目 ${rows.filter(r => r.harm.length).length}`);
console.log('報告：' + outPath);
