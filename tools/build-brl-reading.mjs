// 產生 brl-reading-data.js：國語點字音節（含聲調）→ 同音常用字，給「點字讀音」朗讀用
// 語音念不出單獨的注音符號，所以把每個點字音節換成一個念法固定的常用字再念。
// 來源：NVDA-DictSwitcher 的 brl_dict.dic（ASCII 與 Unicode 點字兩種寫法，合併；以 Unicode 點字為鍵）
// ASCII→Unicode 用 braille-to-text.html 裡的 BR_TO_ASCII 表
// 用法（在 vi-tools 根目錄）：node tools/build-brl-reading.mjs <brl_dict.dic 路徑>
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dicPath = process.argv[2] || 'E:/Project/NVDA-DictSwitcher/globalPlugins/brl_dict.dic';

const b2t = readFileSync(join(root, 'braille-to-text.html'), 'utf8');
const BR_TO_ASCII = eval('(' + b2t.match(/const BR_TO_ASCII = (\{[\s\S]*?\});/)[1] + ')');
const ASCII_TO_UNI = {};
for (const [u, a] of Object.entries(BR_TO_ASCII)) ASCII_TO_UNI[a] = u;
const toUni = s => [...s.toLowerCase()].map(c => ASCII_TO_UNI[c] || null);

// vi-tools 自己的補充與修正，以注音為鍵（不改 brl_dict.dic）；優先於字典
// 選字原則：Windows 臺灣中文語音 Hanhan 單獨念這個字時，念法（SAPI PhonemeReached 的音素＋聲調）和同音節的
// 常用字一致；有多個時取只有一個讀音、較常用的字。2026-09-26 用 Hanhan 逐字校對
// 字典沒收、又找不到 Hanhan 念對的字的音節（如 ㄟˇ、ㄓㄨㄞ、ㄎㄨㄞ、ㄆㄞˇ、ㄆㄧㄥˋ）不補，
// 網頁會改用 McBopomofo 候選字並列在狀態列，校對時這類音節通常是點字打錯
const SUPPLEMENT = {
  'ㄏㄞˊ': '孩',   // 字典兩種寫法不同字：ASCII「骸」、Unicode「還」（多音字 ㄏㄨㄢˊ）；「孩」較常用且只有一個讀音
  'ㄔㄨㄞˊ': '膗', 'ㄔㄣˇ': '磣', 'ㄙㄨㄣˋ': '潠', 'ㄒㄧㄣˇ': '伈', 'ㄊㄡˇ': '黈', 'ㄖㄨㄢˊ': '壖',
  'ㄗㄣˋ': '譖', 'ㄗㄤˇ': '駔', 'ㄕㄨㄤˋ': '灀', 'ㄘㄡˋ': '湊', 'ㄘㄨㄛˇ': '脞',
  'ㄎㄣˋ': '掯', 'ㄋㄧㄝˊ': '苶', 'ㄆㄤˇ': '嗙', 'ㄈㄡˊ': '紑',
  'ㄈㄧㄠˋ': '覅', 'ㄣ˙': '嗯',   // 輕聲單獨念不出來，Hanhan 念 ㄣˊ，和字典裡其他輕聲音節一樣
};
globalThis.self = globalThis;   // McBopomofo 是瀏覽器用的打包檔，要有 self
const conv = createRequire(import.meta.url)(join(root, 'mcbopomofo-service.js')).BopomofoBrailleConverter;
const OVERRIDE = {};
for (const [bpmf, ch] of Object.entries(SUPPLEMENT)) {
  const brl = conv.convertBpmfToBraille(bpmf).trim();
  const back = conv.convertBrailleToTokens(brl);
  if (back.length !== 1 || back[0].bpmf !== bpmf) throw new Error(`${bpmf} 轉點字 ${brl} 後解不回同一個注音`);
  OVERRIDE[brl] = ch;
}

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
// 國語點字音節（Unicode 點字，含聲調格）→ 念法固定的同音常用字；來源 NVDA-DictSwitcher 的 brl_dict.dic，加上 tools/build-brl-reading.mjs 的 SUPPLEMENT
// 共 ${entries.length} 筆
window.VITOOLS_BRL_READING = {
${body}
};
`;
writeFileSync(join(root, 'brl-reading-data.js'), out.replace(/\n/g, '\r\n'));
console.log(`寫入 ${entries.length} 筆；兩種寫法對到不同字 ${conflicts.length} 筆：${conflicts.join('，')}`);
