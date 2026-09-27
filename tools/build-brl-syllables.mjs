// 產生 brl-syllables.js：注音點字音節（Unicode 點字）→ 注音，給「點字轉文字」自己切音節用
// 不直接把整段點字交給 McBopomofo 解（convertBrailleToTokens）：
//   1. 它會把音節後面的 ⠱（ㄦ）當成兒化韻併進前一個音節，例：⠷⠈⠱⠈（偶爾）→ [ㄡˇ(⠷⠈⠱), '⠈']，整個詞被判成英文
//   2. 共用點位解錯：⠅⠴／⠚⠴／⠑⠴ 解成 ㄐㄟ／ㄑㄟ／ㄒㄟ（查不到字，「給」會消失）；⠴、⠢ 一律解成 ㄟ、ㄝ
// 國語點字共用點位（https://class.kh.edu.tw/19061/bulletin/msg_view/75）：
//   ㄍㄐ、ㄘㄑ、ㄙㄒ 看後面的韻母（ㄐㄑㄒ 只接 ㄧ、ㄩ）；⠴ 四聲 ㄟ、一聲 ㄧㄛ；⠢ 四聲 ㄝ、二聲 ㄧㄞ
// 音節來源：聲母×介音×韻母×聲調的所有組合，McBopomofo 能往返轉換（點字 → 注音 → 同樣的點字）的才收。
//   也收辭典沒有、但點字寫法合乎規則的音節（例：ㄙㄟˇ），否則整段會被判成英文；這類音節轉不出字，畫面顯示注音
// 用法（在 vi-tools 根目錄）：node tools/build-brl-syllables.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readings } from './mcb-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.self = globalThis;
const conv = createRequire(import.meta.url)(join(root, 'mcbopomofo-service.js')).BopomofoBrailleConverter;

export const realBpmf = b => b.replace(/^ㄐ(?![ㄧㄩ])/, 'ㄍ').replace(/^ㄑ(?![ㄧㄩ])/, 'ㄘ').replace(/^ㄒ(?![ㄧㄩ])/, 'ㄙ')
  .replace(/^ㄍ(?=[ㄧㄩ])/, 'ㄐ').replace(/^ㄘ(?=[ㄧㄩ])/, 'ㄑ').replace(/^ㄙ(?=[ㄧㄩ])/, 'ㄒ')
  .replace(/^ㄟ$/, 'ㄧㄛ').replace(/^ㄝˊ$/, 'ㄧㄞˊ');

const DAQIAN = { '1':'ㄅ','q':'ㄆ','a':'ㄇ','z':'ㄈ','2':'ㄉ','w':'ㄊ','s':'ㄋ','x':'ㄌ','e':'ㄍ','d':'ㄎ','c':'ㄏ','r':'ㄐ','f':'ㄑ','v':'ㄒ',
  '5':'ㄓ','t':'ㄔ','g':'ㄕ','b':'ㄖ','y':'ㄗ','h':'ㄘ','n':'ㄙ','u':'ㄧ','j':'ㄨ','m':'ㄩ','8':'ㄚ','i':'ㄛ','k':'ㄜ',',':'ㄝ',
  '9':'ㄞ','o':'ㄟ','l':'ㄠ','.':'ㄡ','0':'ㄢ','p':'ㄣ',';':'ㄤ','/':'ㄥ','-':'ㄦ' };
const MARK = { 1: '', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '˙' };
const universe = new Set([...readings.values()].flat());
const phn = readFileSync('E:/Project/6d-IME/globalPlugins/sixdIME/Phn.tbl', 'utf8').split(/\r?\n/);
for (let i = 0; i + 2 < phn.length; i += 3) for (const t of phn[i + 2]) if (MARK[t] !== undefined) universe.add([...phn[i + 1]].map(c => DAQIAN[c] || c).join('') + MARK[t]);
for (const b of [...universe]) universe.add(b.replace(/[ˊˇˋ˙]$/, '') + '˙');
const INITIALS = ['', ...'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ'], MEDIALS = ['', 'ㄧ', 'ㄨ', 'ㄩ'], FINALS = ['', ...'ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ'];
for (const i of INITIALS) for (const m of MEDIALS) for (const f of FINALS) if (i + m + f) for (const t of ['', 'ˊ', 'ˇ', 'ˋ', '˙']) universe.add(i + m + f + t);

const table = new Map();
for (const b of universe) {
  let u, t;
  try { u = conv.convertBpmfToBraille(b).trim(); t = conv.convertBrailleToTokens(u); } catch { continue; }
  if (t.length !== 1 || !t[0] || typeof t[0].bpmf !== 'string' || t[0].braille !== u) continue;
  table.set(u, realBpmf(t[0].bpmf));
}
const entries = [...table].sort(([a], [b]) => a < b ? -1 : 1);
const out = `// 自動產生，請勿手改：node tools/build-brl-syllables.mjs
// 注音點字音節（Unicode 點字）→ 注音（已依國語點字共用點位規則改正），「點字轉文字」自己切音節用；共 ${entries.length} 個
window.VITOOLS_BRL_SYLLABLES = {
${entries.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}
};
`;
writeFileSync(join(root, 'brl-syllables.js'), out.replace(/\n/g, '\r\n'));
console.log(`寫入 ${entries.length} 個音節，最長 ${Math.max(...entries.map(([k]) => k.length))} 格`);
