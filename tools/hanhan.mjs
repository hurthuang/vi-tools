// Hanhan（Windows 臺灣中文語音）念法 ↔ 注音
//   speak(文字[]) → 每段文字的音素陣列（呼叫 hanhan-phonemes.ps1；結果快取在 %TEMP%\vitools-hanhan）
//   syllables()   → 注音音節 → Hanhan 音素字串（例 'ㄏㄤˊ' → 'ㄏ ㄤ ˊ'）；用每個音節最多 4 個「只有一個讀音」的常用字多數決
//   decode(音素[]) → [{ ph, bpmf: [可能的注音] }]，依聲調記號切成音節
// Hanhan 的音素用注音符號表示但不等於注音（ㄘ 寫成 ㄗ、沒有聲母的音前面加 ㄍ 等），所以一律經對照表比較
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { readings, singleReading, syllableScore } from './mcb-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(tmpdir(), 'vitools-hanhan');
mkdirSync(cacheDir, { recursive: true });
const cacheFile = join(cacheDir, 'phonemes.json');
const cache = existsSync(cacheFile) ? new Map(Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8')))) : new Map();
export const TONES = ['ˉ', 'ˊ', 'ˇ', 'ˋ', '˙'];

export function speak(texts) {
  const todo = [...new Set(texts.filter(t => t && !cache.has(t) && !/[\r\n\t]/.test(t)))];
  if (todo.length) {
    const inF = join(cacheDir, 'in.txt'), outF = join(cacheDir, 'out.tsv');
    writeFileSync(inF, todo.join('\n'));
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'hanhan-phonemes.ps1'), inF, outF], { stdio: 'inherit' });
    for (const l of readFileSync(outF, 'utf8').split(/\r?\n/)) { const i = l.indexOf('\t'); if (i > 0) cache.set(l.slice(0, i), l.slice(i + 1)); }
    writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(cache)));
  }
  return texts.map(t => (cache.get(t) || '').split(' ').filter(x => x && x !== '_'));
}

const toneOf = b => { const m = b.match(/[ˊˇˋ˙]$/); return m ? m[0] : 'ˉ'; };
const baseOf = b => b.replace(/[ˊˇˋ˙]$/, '');

// 依聲調記號切音節
export function split(ph) {
  const out = []; let cur = [];
  for (const p of ph) { cur.push(p); if (TONES.includes(p)) { out.push(cur.join(' ')); cur = []; } }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

let table = null, reverse = null;
export function syllables() {
  if (table) return table;
  const byR = new Map();
  for (const [ch, rs] of readings) if (rs.length === 1) { if (!byR.has(rs[0])) byR.set(rs[0], []); byR.get(rs[0]).push(ch); }
  const all = new Set([...readings.values()].flat());
  const refs = new Map();
  for (const b of all) refs.set(b, (byR.get(b) || []).filter(c => syllableScore.has(c)).sort((x, y) => syllableScore.get(y) - syllableScore.get(x)).slice(0, 4));
  const chars = [...new Set([...refs.values()].flat())];
  const got = new Map(chars.map((c, i) => [c, speak(chars)[i]]));
  // 基本音節（不分聲調）的音素多數決：參考字聲調念對的才採用
  const baseVote = new Map();
  for (const [b, cs] of refs) for (const c of cs) {
    const s = split(got.get(c) || []);
    if (s.length !== 1) continue;
    const p = s[0].split(' ');
    if (p[p.length - 1] !== toneOf(b)) continue;
    const k = baseOf(b), v = p.slice(0, -1).join(' ');
    if (!baseVote.has(k)) baseVote.set(k, new Map());
    baseVote.get(k).set(v, (baseVote.get(k).get(v) || 0) + 1);
  }
  table = new Map();
  for (const b of all) {
    const m = baseVote.get(baseOf(b));
    if (m) table.set(b, [...m].sort((x, y) => y[1] - x[1])[0][0] + ' ' + toneOf(b));
  }
  return table;
}

export function decode(ph) {
  if (!reverse) { reverse = new Map(); for (const [b, p] of syllables()) { if (!reverse.has(p)) reverse.set(p, []); reverse.get(p).push(b); } }
  return split(ph).map(p => ({ ph: p, bpmf: reverse.get(p) || [] }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = syllables();
  console.log(`對照表 ${t.size} 個音節（注音讀音共 ${new Set([...readings.values()].flat()).size} 個）`);
  const amb = new Map();
  for (const [b, p] of t) { if (!amb.has(p)) amb.set(p, []); amb.get(p).push(b); }
  const multi = [...amb].filter(([, bs]) => bs.length > 1);
  console.log(`Hanhan 念法相同、分不出來的注音 ${multi.length} 組，例：` + multi.slice(0, 12).map(([p, bs]) => bs.join('＝')).join('、'));
  for (const w of ['銀行', '這首曲', '這首娶', '酪農']) console.log(w, decode(speak([w])[0]).map(x => x.bpmf.join('/') || `?(${x.ph})`).join(' '));
}
