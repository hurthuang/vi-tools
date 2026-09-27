// 用 Hanhan 檢查、補齊 brl_dict.dic（注音點字字庫），產生修正版與報告
// 1) 檢查：每個音節（Unicode 與 ASCII 點字兩條）的字單獨給 Hanhan 念，解回注音和字典的音節比較
//    念錯的：從所有有這個讀音的字（含多音字）找 Hanhan 念對的，優先 Hanhan 念法沒有歧義、只有一個讀音、較常用的字；
//           找不到 → 注音加聲調（例：ㄋㄧㄡ第四聲）
//    只差送氣分不出來的（例：ㄗ／ㄘ）→ 注音加聲調
//    不處理：輕聲音節（單獨一個字念不出輕聲）、已經是注音的
// 2) 補齊：字典沒有的音節（McBopomofo 字音表、6d-IME Phn.tbl 的讀音，以及字典裡每個基本音節的輕聲）
//    非輕聲 → 同上找 Hanhan 念對的字，找不到就注音加聲調
//    輕聲   → McBopomofo 詞庫裡實際念這個輕聲的字（依詞頻），且 Hanhan 念出的基本音節相同（聲調不論）；
//             找不到 → 字典裡同一個基本音節其他聲調的字；再沒有 → 注音加「輕聲」
//    只有 ASCII 或只有 Unicode 其中一種寫法的音節 → 補上另一種（同一個值）
//    新條目插在同種寫法、同長度區段的最後（DictSwitcher 1.5 起注音點字字庫從左到右切音節，插入位置不影響比對）
// 注音標籤：McBopomofo 把 ⠅⠴／⠚⠴／⠑⠴ 解成 ㄐㄟ／ㄑㄟ／ㄒㄟ（不存在的音節），這裡改正為 ㄍㄟ／ㄘㄟ／ㄙㄟ；
//   ⠴（ㄟ／ㄧㄛ）、⠢（ㄝ／ㄧㄞ）共用點位，看聲調區分（見 real()）
// 用法（在 vi-tools 根目錄）：node tools/fix-brl-dict-hanhan.mjs <brl_dict.dic> <修正版.dic> [報告.tsv]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readings, words, syllableScore } from './mcb-data.mjs';
import { speak, decode, syllables } from './hanhan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [inPath, outPath, reportPath = 'brl-dict-hanhan.tsv'] = process.argv.slice(2);
if (!inPath || !outPath) { console.error('用法：node tools/fix-brl-dict-hanhan.mjs <brl_dict.dic> <修正版.dic> [報告.tsv]'); process.exit(1); }

globalThis.self = globalThis;
const conv = createRequire(import.meta.url)(join(root, 'mcbopomofo-service.js')).BopomofoBrailleConverter;
const b2t = readFileSync(join(root, 'braille-to-text.html'), 'utf8');
const BR_TO_ASCII = eval('(' + b2t.match(/const BR_TO_ASCII = (\{[\s\S]*?\});/)[1] + ')');
const ASCII_TO_UNI = Object.fromEntries(Object.entries(BR_TO_ASCII).map(([u, a]) => [a, u]));
const toAscii = u => [...u].map(c => BR_TO_ASCII[c]).join('');

const TONE_NAME = { 'ˊ': '第二聲', 'ˇ': '第三聲', 'ˋ': '第四聲', '˙': '輕聲' };
const spell = b => { const m = b.match(/[ˊˇˋ˙]$/); return m ? b.slice(0, -1) + TONE_NAME[m[0]] : b + '第一聲'; };
const isSpelled = s => /^[\u3105-\u3129]/.test(s);
const TONE = b => (b.match(/[ˊˇˋ˙]$/) || ['ˉ'])[0];
const BASE = b => b.replace(/[ˊˇˋ˙]$/, '');
const FINALS = 'ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ';
// 比較基本音節：零聲母統一加 ㄍ（Hanhan 的零聲母念法前面有 ㄍ）；loose 再把送氣併入不送氣（Hanhan 分不出來）
const exact = b => { const s = BASE(b); return FINALS.includes(s[0]) ? 'ㄍ' + s : s; };
const loose = b => exact(b).replace(/ㄑ/g, 'ㄐ').replace(/ㄘ/g, 'ㄗ');
// 國語點字共用點位（https://class.kh.edu.tw/19061/bulletin/msg_view/75）：
//   ㄍㄐ、ㄘㄑ、ㄙㄒ 同點位，看後面的韻母；McBopomofo 把 ⠅⠴／⠚⠴／⠑⠴ 解成 ㄐㄟ／ㄑㄟ／ㄒㄟ，改正為 ㄍㄟ／ㄘㄟ／ㄙㄟ
//   ⠴ 是 ㄟ 或 ㄧㄛ、⠢ 是 ㄝ 或 ㄧㄞ，看聲調：ㄟ 只有四聲（欸）、ㄧㄛ 只有一聲（唷）；ㄝ 只有四聲（誒）、ㄧㄞ 只有二聲（崖）
//   McBopomofo 一律解成 ㄟ／ㄝ，這裡把一聲的 ㄟ 改為 ㄧㄛ、二聲的 ㄝ 改為 ㄧㄞ
const real = b => b.replace(/^ㄐ(?![ㄧㄩ])/, 'ㄍ').replace(/^ㄑ(?![ㄧㄩ])/, 'ㄘ').replace(/^ㄒ(?![ㄧㄩ])/, 'ㄙ')
  .replace(/^ㄍ(?=[ㄧㄩ])/, 'ㄐ').replace(/^ㄘ(?=[ㄧㄩ])/, 'ㄑ').replace(/^ㄙ(?=[ㄧㄩ])/, 'ㄒ')
  .replace(/^ㄟ$/, 'ㄧㄛ').replace(/^ㄝˊ$/, 'ㄧㄞˊ');
const AMBIGUOUS = () => false;
// Hanhan 沒有這個音（對照表的參考字也被念成別的音，自動判斷會誤判為念對）→ 一律注音
const NO_SOUND = new Set(['ㄧㄞˊ']);   // 崖、厓、睚念 ㄧㄚˊ，啀、嘊念 ㄞˊ
const table = syllables();

// Hanhan 念某個字是否為注音 b：'ok' | 'wrong' | 'unknown'（只差送氣）；anyTone 時不比聲調（輕聲用）
function judge(d, b, anyTone = false) {
  if (!d || d.length !== 1 || NO_SOUND.has(b)) return 'wrong';
  if (!anyTone && d[0].bpmf.includes(b)) return 'ok';
  const ph = d[0].ph.split(' '), tone = ph.pop();
  if (!anyTone && table.has(b)) return 'wrong';
  if (!anyTone && tone !== TONE(b)) return 'wrong';
  const heard = d[0].bpmf.length ? d[0].bpmf : [ph.join('')];   // 對照表沒有的念法直接用音素字串
  if (heard.some(h => exact(h) === exact(b))) return 'ok';
  if (heard.some(h => loose(h) === loose(b))) return 'unknown';
  return 'wrong';
}
const heardText = d => d.length === 1 ? d[0].bpmf.join('/') || d[0].ph.replace(/ /g, '') : d.map(s => s.bpmf.join('/') || '?').join(' ') || '（不出聲）';

const raw = readFileSync(inPath, 'utf8');
const BOM = raw.startsWith('\uFEFF'), EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
const setValue = (i, v) => { const p = lines[i].split('\t'); p[1] = v; lines[i] = p.join('\t'); };

// 音節 → 字典裡的條目（行號）
const bySyl = new Map();
lines.forEach((l, i) => {
  const [key, val, , type] = l.split('\t');
  if (type !== '0' || !key || !val) return;
  const uni = /^[\u2800-\u28ff]+$/.test(key) ? key : [...key.toLowerCase()].map(c => ASCII_TO_UNI[c] || '?').join('');
  if (uni.includes('?')) return;
  let t; try { t = conv.convertBrailleToTokens(uni); } catch { return; }
  if (t.length !== 1 || !t[0] || typeof t[0].bpmf !== 'string') return;
  const b = real(t[0].bpmf);
  if (!bySyl.has(b)) bySyl.set(b, []);
  bySyl.get(b).push(i);
});
const valueOf = b => lines[bySyl.get(b)[0]].split('\t')[1];

// 有這個讀音的字；Hanhan 念對的排前面
const byR = new Map();
for (const [ch, rs] of readings) for (const r of rs) { if (!byR.has(r)) byR.set(r, []); byR.get(r).push(ch); }
function goodChars(b) {
  const cs = byR.get(b) || [];
  const ds = speak(cs).map(decode);
  return cs.map((c, i) => ({ c, d: ds[i] })).filter(x => judge(x.d, b) === 'ok')
    .sort((x, y) => (x.d[0].bpmf.length - y.d[0].bpmf.length) || (readings.get(x.c).length - readings.get(y.c).length)
      || ((syllableScore.get(y.c) ?? -99) - (syllableScore.get(x.c) ?? -99))).map(x => x.c);
}

// ── 1) 檢查現有音節
const todo = [...bySyl.keys()].map(b => ({ b, idx: bySyl.get(b), ch: valueOf(b) }))
  .filter(x => !isSpelled(x.ch) && TONE(x.b) !== '˙' && !AMBIGUOUS(x.b));
const cur = speak(todo.map(x => x.ch)).map(decode);
const wrong = [], unknown = [];
todo.forEach((x, k) => {
  x.heard = heardText(cur[k]);
  const r = judge(cur[k], x.b);
  if (r === 'wrong') wrong.push(x); else if (r === 'unknown') unknown.push(x);
});
for (const x of wrong) { x.good = goodChars(x.b); x.fix = x.good[0] || spell(x.b); }
for (const x of unknown) { x.good = []; x.fix = spell(x.b); }
for (const x of [...wrong, ...unknown]) for (const i of x.idx) setValue(i, x.fix);
// 已經是注音的（輕聲除外）：有 Hanhan 念對的字就改用字；標籤錯的改正（例：ㄒㄟ第一聲 → ㄙㄟ第一聲）
const relabeled = [], toChar2 = [];
for (const [b, idx] of bySyl) {
  const v = valueOf(b);
  if (!isSpelled(v)) continue;
  const g = TONE(b) === '˙' ? [] : goodChars(b);
  const nv = g[0] || spell(b);
  if (nv === v) continue;
  (g[0] ? toChar2 : relabeled).push(`${b} ${v}→${nv}`);
  for (const i of idx) setValue(i, nv);
}

// ── 2) 補齊缺少的音節
const DAQIAN = { '1':'ㄅ','q':'ㄆ','a':'ㄇ','z':'ㄈ','2':'ㄉ','w':'ㄊ','s':'ㄋ','x':'ㄌ','e':'ㄍ','d':'ㄎ','c':'ㄏ','r':'ㄐ','f':'ㄑ','v':'ㄒ',
  '5':'ㄓ','t':'ㄔ','g':'ㄕ','b':'ㄖ','y':'ㄗ','h':'ㄘ','n':'ㄙ','u':'ㄧ','j':'ㄨ','m':'ㄩ','8':'ㄚ','i':'ㄛ','k':'ㄜ',',':'ㄝ',
  '9':'ㄞ','o':'ㄟ','l':'ㄠ','.':'ㄡ','0':'ㄢ','p':'ㄣ',';':'ㄤ','/':'ㄥ','-':'ㄦ' };
const MARK = { 1: '', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '˙' };
const phn = readFileSync('E:/Project/6d-IME/globalPlugins/sixdIME/Phn.tbl', 'utf8').split(/\r?\n/);
const universe = new Set([...readings.values()].flat());
for (let i = 0; i + 2 < phn.length; i += 3) for (const t of phn[i + 2]) if (MARK[t] !== undefined) universe.add([...phn[i + 1]].map(c => DAQIAN[c] || c).join('') + MARK[t]);
for (const b of [...bySyl.keys(), ...universe]) universe.add(BASE(b) + '˙');
const canon = b => { try { const u = conv.convertBpmfToBraille(b).trim(); const t = conv.convertBrailleToTokens(u); return t.length === 1 && real(t[0].bpmf) === b ? u : null; } catch { return null; } };
const missing = [...new Set([...universe].map(real))].filter(b => !bySyl.has(b) && !AMBIGUOUS(b) && canon(b));
// 輕聲：詞庫裡實際念這個輕聲的字，依詞頻加總
const neutralUse = new Map();
for (const [w, { bpmf, score }] of words) [...w].forEach((c, i) => {
  if (TONE(bpmf[i]) !== '˙') return;
  const b = real(bpmf[i]);
  if (!neutralUse.has(b)) neutralUse.set(b, new Map());
  const m = neutralUse.get(b); m.set(c, (m.get(c) || 0) + Math.pow(10, score));
});
const neutralCands = new Map(missing.filter(b => TONE(b) === '˙')
  .map(b => [b, [...(neutralUse.get(b) || new Map())].sort((x, y) => y[1] - x[1]).map(x => x[0]).slice(0, 5)]));
const ncs = [...new Set([...neutralCands.values()].flat())];
const nd = new Map(speak(ncs).map((ph, i) => [ncs[i], decode(ph)]));
const added = [];
for (const b of missing) {
  let v, how;
  if (TONE(b) === '˙') {
    v = (neutralCands.get(b) || []).find(c => judge(nd.get(c), b, true) === 'ok');
    how = v ? '詞裡念這個輕聲的字' : '';
    if (!v) {   // 同一個基本音節其他聲調的字
      const other = ['ˋ', '', 'ˊ', 'ˇ'].map(t => BASE(b) + t).find(o => bySyl.has(o) && !isSpelled(valueOf(o)));
      if (other) { v = valueOf(other); how = `同音節 ${other} 的字`; }
    }
    if (!v) { v = spell(b); how = '注音'; }
  } else {
    const g = goodChars(b);
    v = g[0] || spell(b); how = g[0] ? 'Hanhan 念對的字' : '注音';
  }
  added.push({ b, v, how, u: canon(b) });
}
// 只有 ASCII 或只有 Unicode 其中一種寫法的音節：補上另一種（同一個值）
const oneForm = [];
for (const [b, idx] of bySyl) {
  const keys = idx.map(i => lines[i].split('\t')[0]);
  const u = keys.find(k => /^[\u2800-\u28ff]+$/.test(k)) || [...keys[0]].map(c => ASCII_TO_UNI[c]).join('');
  const a = toAscii(u);
  if (!keys.includes(u)) oneForm.push({ b, key: u, kind: 'uni', v: valueOf(b) });
  if (!keys.includes(a)) oneForm.push({ b, key: a, kind: 'ascii', v: valueOf(b) });
}
const kindLen = l => { const p = l.split('\t'); return p[3] === '0' ? (/^[\u2800-\u28ff]+$/.test(p[0]) ? 'uni' : 'ascii') + [...p[0]].length : null; };
const blockEnd = {};
for (let i = 0; i < lines.length; i++) { const k = kindLen(lines[i]); if (k && !(k in blockEnd)) { let j = i; while (j + 1 < lines.length && kindLen(lines[j + 1]) === k) j++; blockEnd[k] = j; } }
const inserts = {};
const put = (kind, key, v) => { const at = blockEnd[kind + [...key].length]; if (at === undefined) throw new Error('找不到區段 ' + kind + [...key].length); (inserts[at] ||= []).push(`${key}\t${v}\t1\t0`); };
for (const a of added) { put('ascii', toAscii(a.u), a.v); put('uni', a.u, a.v); }
for (const o of oneForm) put(o.kind, o.key, o.v);
for (const at of Object.keys(inserts).map(Number).sort((x, y) => y - x)) lines.splice(at + 1, 0, ...inserts[at]);

// ── 寫出
writeFileSync(outPath, (BOM ? '\uFEFF' : '') + lines.join(EOL));
const tsv = [['類別', '注音', '原本的字', 'Hanhan 念成', '改成／補上', '說明'].join('\t'),
  ...wrong.map(x => ['念錯', x.b, x.ch, x.heard, x.fix, x.good.length ? '其他念對的字：' + x.good.slice(1, 6).join(' ') : '沒有 Hanhan 念對的字'].join('\t')),
  ...unknown.map(x => ['只差送氣（改注音）', x.b, x.ch, x.heard, x.fix, 'Hanhan 分不出送氣'].join('\t')),
  ...relabeled.map(r => { const [b, rest] = r.split(' '); const [v, nv] = rest.split('→'); return ['注音標籤改正', b, v, '', nv, '共用點位解錯（ㄍㄐ、ㄘㄑ、ㄙㄒ；ㄟ／ㄧㄛ、ㄝ／ㄧㄞ）'].join('\t'); }),
  ...toChar2.map(r => { const [b, rest] = r.split(' '); const [v, nv] = rest.split('→'); return ['注音改用字', b, v, '', nv, 'Hanhan 念對的字'].join('\t'); }),
  ...oneForm.map(o => ['補另一種寫法', o.b, '', '', o.v, o.kind === 'uni' ? '原本只有 ASCII' : '原本只有 Unicode'].join('\t')),
  ...added.map(a => ['補上', a.b, '', '', a.v, a.how].join('\t'))];
writeFileSync(reportPath, '\uFEFF' + tsv.join('\r\n') + '\r\n');
const toChar = wrong.filter(x => x.good.length).length;
const cnt = f => added.filter(f).length;
console.log(`檢查 ${todo.length} 個音節（不含輕聲、注音）：Hanhan 念對 ${todo.length - wrong.length - unknown.length}，念錯 ${wrong.length}（換字 ${toChar}、改注音 ${wrong.length - toChar}），只差送氣改注音 ${unknown.length}`);
console.log(`  換字：${wrong.filter(x => x.good.length).map(x => `${x.b} ${x.ch}→${x.fix}`).join('、')}`);
console.log(`注音改用字 ${toChar2.length}：${toChar2.join('、')}`);
console.log(`注音標籤改正 ${relabeled.length}：${relabeled.join('、')}；補另一種寫法 ${oneForm.length}：${oneForm.map(o => o.b + '(' + o.kind + ')').join('、')}`);
console.log(`補上 ${added.length} 個音節（輕聲 ${cnt(a => TONE(a.b) === '˙')}，其他 ${cnt(a => TONE(a.b) !== '˙')}；用字 ${cnt(a => a.how !== '注音')}，注音 ${cnt(a => a.how === '注音')}）`);
console.log(`  非輕聲：${added.filter(a => TONE(a.b) !== '˙').map(a => `${a.b}=${a.v}`).join(' ')}`);
console.log(`  輕聲用注音：${added.filter(a => TONE(a.b) === '˙' && a.how === '注音').map(a => a.b).join(' ')}`);
