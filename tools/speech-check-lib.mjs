// 語音字典檢查工具共用：讀 NVDA 語音字典並套用、會考試題讀音標注、Hanhan 念法比對
import { readFileSync } from 'node:fs';
import { syllables } from './hanhan.mjs';

// NVDA SpeechDictEntry：type 0 任意位置、1 正規式、2 整詞（Python 的 \b 認得中文，JS 要自己用 Unicode 字元類別）
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function makeEntry(pat, rep, { cs = '0', type = '0', line = 0 } = {}) {
  const flags = 'gu' + (cs === '1' ? '' : 'i');
  const re = type === '1' ? new RegExp(pat, flags)
    : new RegExp(type === '2' ? `(?<![\\p{L}\\p{N}_])${esc(pat)}(?![\\p{L}\\p{N}_])` : esc(pat), flags);
  // 正規式的 \1 → JS 的 $1；其他類型的替換文字要照字面
  const r = type === '1' ? rep.replace(/\$/g, '$$$$').replace(/\\(\d)/g, '$$$1') : rep.replace(/\$/g, '$$$$');
  return { line, pat, rep, type, re, r };
}
export function loadSpeechDict(path) {
  const entries = [];
  readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/).forEach((l, i) => {
    if (!l || l.startsWith('nvda_speech_dict')) return;
    const [pat, rep = '', cs, type] = l.split('\t');
    if (pat === undefined || type === undefined) return;
    try { entries.push(makeEntry(pat, rep, { cs, type, line: i + 1 })); } catch { /* Python 正規式 JS 不支援就略過 */ }
  });
  return entries;
}
export const applyDict = (entries, s) => entries.reduce((t, e) => t.replace(e.re, e.r), s);

// 讀音標注（ㄘㄤ二聲 → ㄘㄤˊ；沒寫聲調是一聲；輕聲寫在後面，同 McBopomofo）
const TONE_WORD = { 一聲: '', 二聲: 'ˊ', 三聲: 'ˇ', 四聲: 'ˋ', 輕聲: '˙' };
export function parseNote(z) {
  if (!/[ㄅ-ㄩ]/.test(z)) return null;   // 圖（一）、表（二）是編號
  z = z.replace(/\s/g, '').replace(/一(?=[ㄠㄢㄣㄤㄥㄚㄛㄝ]|$)/g, 'ㄧ');   // 有些標注把 ㄧ 打成「一」
  const m = z.match(/^˙?([ㄅ-ㄩ]+)([ˊˇˋ˙]?)(.聲)?$/);
  if (!m) return null;
  const tone = z.startsWith('˙') ? '˙' : m[2] || TONE_WORD[m[3]] || '';
  return m[1] + tone;
}
// 去掉讀音標注，回傳乾淨文字與標注位置（位置 → 注音）
const ANN = /[（(]([ㄅ-ㄩ一˙ˊˇˋ\s]{1,7}(?:[一二三四輕]聲)?)[）)]/g;
export function stripNotes(raw) {
  let clean = '', last = 0, m; const notes = new Map();
  ANN.lastIndex = 0;
  while ((m = ANN.exec(raw))) {
    const w = parseNote(m[1]);
    if (!w) continue;   // 不是讀音標注（例：圖（一））就留在原文
    clean += raw.slice(last, m.index); last = m.index + m[0].length;
    notes.set(clean.length - 1, w);
  }
  return { clean: clean + raw.slice(last), notes };
}

// Hanhan 某個位置念的音是否符合預期；容許三聲變調（後面的字可能念三聲時，三聲念成二聲）、輕聲念成其他聲調
//   next：後一個字可能的讀音（字串或陣列）。三聲變成二聲後常是不存在的音節（例 ㄙㄨㄛˊ），所以直接比音素
const TONE = b => (b.match(/[ˊˇˋ˙]$/) || ['ˉ'])[0];
const BASE = b => b.replace(/[ˊˇˋ˙]$/, '');
export function matches(dec, i, want, next) {
  const d = dec[i];
  if (!d) return false;
  const ok = [want];
  const nexts = [].concat(next || []);
  if (TONE(want) === 'ˇ' && nexts.some(n => TONE(n) === 'ˇ')) {
    ok.push(BASE(want) + 'ˊ');
    const ph = syllables().get(want);
    if (ph && d.ph === ph.replace(/ˇ$/, 'ˊ')) return true;
  }
  if (TONE(want) === '˙') ['', 'ˊ', 'ˇ', 'ˋ'].forEach(t => ok.push(BASE(want) + t));
  return d.bpmf.some(g => ok.includes(g));
}
export const show = dec => dec.map(x => x.bpmf.length ? x.bpmf.join('/') : '?');
export const HAN = /[㐀-鿿豈-﫿]/u;
