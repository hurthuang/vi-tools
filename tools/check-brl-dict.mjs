// 檢查 NVDA-DictSwitcher 的 brl_dict.dic（國語點字音節 → 同音常用字）涵蓋率，列出缺漏與可疑的項目
// 完整音節清單取自 6d-IME 的 Phn.tbl（每 3 行一組：音節點字、注音大千鍵、可用聲調）；以注音比對（點字寫法可能有變體）
// 用法（在 vi-tools 根目錄）：node tools/check-brl-dict.mjs [brl_dict.dic] [Phn.tbl] > 缺漏清單.tsv
// 已知問題（2026-09-25）：ㄏㄞˊ 的 Unicode 寫法對到多音字「還」（ASCII 寫法是「骸」）；約 60 個罕見音節沒收
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dicPath = process.argv[2] || 'E:/Project/NVDA-DictSwitcher/globalPlugins/brl_dict.dic';
const phnPath = process.argv[3] || 'E:/Project/6d-IME/globalPlugins/sixdIME/Phn.tbl';
globalThis.self = globalThis;   // McBopomofo 是瀏覽器用的打包檔，要有 self
const mcb = createRequire(import.meta.url)(join(root, 'mcbopomofo-service.js'));
const conv = mcb.BopomofoBrailleConverter;

// ASCII→Unicode 用 braille-to-text.html 的 BR_TO_ASCII
const b2t = readFileSync(join(root, 'braille-to-text.html'), 'utf8');
const BR_TO_ASCII = eval('(' + b2t.match(/const BR_TO_ASCII = (\{[\s\S]*?\});/)[1] + ')');
const ASCII_TO_UNI = {};
for (const [u, a] of Object.entries(BR_TO_ASCII)) ASCII_TO_UNI[a] = u;

// 字典：以注音為鍵；記下 ASCII 與 Unicode 兩種寫法各自對到的字
const byBpmf = new Map();   // 注音 → { ascii, uni }
const lines = readFileSync(dicPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
for (const line of lines) {
  const [key, ch] = line.split('\t');
  const isUni = /^[\u2800-\u28ff]+$/.test(key);
  const uni = isUni ? key : [...key.toLowerCase()].map(c => ASCII_TO_UNI[c] || '?').join('');
  let t;
  try { t = conv.convertBrailleToTokens(uni); } catch (e) { continue; }
  if (t.length !== 1 || !t[0] || typeof t[0].bpmf !== 'string') continue;
  const e = byBpmf.get(t[0].bpmf) || {};
  e[isUni ? 'uni' : 'ascii'] = e[isUni ? 'uni' : 'ascii'] || ch;
  byBpmf.set(t[0].bpmf, e);
}

// 完整清單：Phn.tbl 的注音（大千鍵）＋聲調（McBopomofo 的輕聲記號在後面，例 ㄉㄜ˙）
const DAQIAN = { '1':'ㄅ','q':'ㄆ','a':'ㄇ','z':'ㄈ','2':'ㄉ','w':'ㄊ','s':'ㄋ','x':'ㄌ','e':'ㄍ','d':'ㄎ','c':'ㄏ','r':'ㄐ','f':'ㄑ','v':'ㄒ',
  '5':'ㄓ','t':'ㄔ','g':'ㄕ','b':'ㄖ','y':'ㄗ','h':'ㄘ','n':'ㄙ','u':'ㄧ','j':'ㄨ','m':'ㄩ','8':'ㄚ','i':'ㄛ','k':'ㄜ',',':'ㄝ',
  '9':'ㄞ','o':'ㄟ','l':'ㄠ','.':'ㄡ','0':'ㄢ','p':'ㄣ',';':'ㄤ','/':'ㄥ','-':'ㄦ' };
const MARK = { 1: '', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '˙' };
const phn = readFileSync(phnPath, 'utf8').split(/\r?\n/);
const all = new Set();
for (let i = 0; i + 2 < phn.length; i += 3)
  for (const t of phn[i + 2]) if (MARK[t] !== undefined) all.add([...phn[i + 1]].map(c => DAQIAN[c] || c).join('') + MARK[t]);

const missing = [], conflict = [];
for (const s of all) {
  let b;
  try { b = conv.convertBrailleToTokens(conv.convertBpmfToBraille(s).trim())[0].bpmf; } catch (e) { b = s; }
  const e = byBpmf.get(b);
  if (!e) missing.push(s);
  else if (e.ascii && e.uni && e.ascii !== e.uni) conflict.push(`${s}\tASCII 寫法「${e.ascii}」／Unicode 寫法「${e.uni}」`);
}
console.error(`Phn.tbl ${all.size} 個音節＋聲調：字典有 ${all.size - missing.length}（${((all.size - missing.length) / all.size * 100).toFixed(1)}%），缺 ${missing.length}；兩種寫法不同字 ${conflict.length}`);
console.log('類別\t注音\t說明');
for (const c of conflict) console.log('寫法不同字\t' + c);
for (const m of missing) {
  let brl = '';
  try { brl = conv.convertBpmfToBraille(m).trim(); } catch (e) {}
  console.log(`缺漏\t${m}\t點字 ${brl}`);
}
