// 產生 brl-reading-data.js：國語點字音節（含聲調）→ 同音常用字，給「點字讀音」朗讀用
// 語音念不出單獨的注音符號，所以把每個點字音節換成一個念法固定的常用字再念。
// 來源：NVDA-DictSwitcher 的 brl_dict.dic（ASCII 與 Unicode 點字兩種寫法，合併；以 Unicode 點字為鍵）
// ASCII→Unicode 用 braille-to-text.html 裡的 BR_TO_ASCII 表
// 用法（在 vi-tools 根目錄）：node tools/build-brl-reading.mjs <brl_dict.dic 路徑>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dicPath = process.argv[2] || 'E:/Project/NVDA-DictSwitcher/globalPlugins/brl_dict.dic';

const b2t = readFileSync(join(root, 'braille-to-text.html'), 'utf8');
const BR_TO_ASCII = eval('(' + b2t.match(/const BR_TO_ASCII = (\{[\s\S]*?\});/)[1] + ')');
const ASCII_TO_UNI = {};
for (const [u, a] of Object.entries(BR_TO_ASCII)) ASCII_TO_UNI[a] = u;
const toUni = s => [...s.toLowerCase()].map(c => ASCII_TO_UNI[c] || null);

// 同一音節兩種寫法對到不同字時，用這裡指定的字（多音字念法不固定，要避開）
const OVERRIDE = {
  '⠗⠺⠂': '骸',   // ㄏㄞˊ：Unicode 寫法原本是「還」（多音字，可能念成 ㄏㄨㄢˊ）
};

const map = new Map();
const conflicts = [];
const lines = readFileSync(dicPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
for (const line of lines) {
  const [key, ch] = line.split('\t');
  if (!key || !ch) continue;
  let uni;
  if (/^[\u2800-\u28ff]+$/.test(key)) uni = key;
  else {
    const cells = toUni(key);
    if (cells.includes(null)) continue;
    uni = cells.join('');
  }
  if (map.has(uni) && map.get(uni) !== ch) conflicts.push(`${uni} ${map.get(uni)}/${ch}`);
  if (!map.has(uni)) map.set(uni, ch);
}
for (const [k, v] of Object.entries(OVERRIDE)) map.set(k, v);

const entries = [...map.entries()].sort(([a], [b]) => a < b ? -1 : 1);
const body = entries.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n');
const out = `// 自動產生，請勿手改：node tools/build-brl-reading.mjs <brl_dict.dic>
// 國語點字音節（Unicode 點字，含聲調格）→ 念法固定的同音常用字；來源 NVDA-DictSwitcher 的 brl_dict.dic
// 共 ${entries.length} 筆
window.VITOOLS_BRL_READING = {
${body}
};
`;
writeFileSync(join(root, 'brl-reading-data.js'), out.replace(/\n/g, '\r\n'));
console.log(`寫入 ${entries.length} 筆；兩種寫法對到不同字 ${conflicts.length} 筆：${conflicts.join('，')}`);
