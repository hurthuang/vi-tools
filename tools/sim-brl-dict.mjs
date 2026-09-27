// 模擬 NVDA-DictSwitcher 套用 brl_dict.dic：照檔案順序逐條取代（同 NVDA SpeechDictEntry），比較兩份字典
//   1) Phn.tbl 的每個音節單獨出現（Unicode 與 ASCII 點字）：換成字典給的字、原樣留下、被別條規則取代一部分、或換錯
//   2) 兩個音節相連：跨過音節交界的規則搶先取代（只完整模擬交界處剛好是某條規則的組合），兩版輸出相同／不同
// --tokenize：修正版改用 DictSwitcher 1.5 起的做法——字典開頭連續的字面條目（音節、標點）從左到右、
//             每個位置先試最長的鍵（最長 3 格）；其餘條目（數字、數學的正規式等）照檔案順序逐條套用
// 用法（在 vi-tools 根目錄）：node tools/sim-brl-dict.mjs <現行版.dic> [修正版.dic] [--tokenize]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const tokenizeNew = argv.includes('--tokenize');
const [oldPath, newPath] = argv.filter(a => !a.startsWith('--'));
if (!oldPath) { console.error('用法：node tools/sim-brl-dict.mjs <現行版.dic> [修正版.dic] [--tokenize]'); process.exit(1); }
const phnPath = 'E:/Project/6d-IME/globalPlugins/sixdIME/Phn.tbl';

globalThis.self = globalThis;   // McBopomofo 是瀏覽器用的打包檔，要有 self
const conv = createRequire(import.meta.url)(join(root, 'mcbopomofo-service.js')).BopomofoBrailleConverter;
const b2t = readFileSync(join(root, 'braille-to-text.html'), 'utf8');
const BR_TO_ASCII = eval('(' + b2t.match(/const BR_TO_ASCII = (\{[\s\S]*?\});/)[1] + ')');
const toAscii = u => [...u].map(c => BR_TO_ASCII[c]).join('');

// NVDA SpeechDictEntry：type 0 任意位置（字面）、1 正規式、2 整詞；caseSensitive 0 = 不分大小寫
// 不用 u 旗標：Python 允許 \# 這類跳脫，JS 的 u 模式不允許（點字都在 BMP，不影響）
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function load(path, tokenize = false) {
  const rules = [];
  readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).forEach((l, i) => {
    if (!l || l.startsWith('#')) return;
    const [pat, rep = '', cs, type] = l.split('\t');
    const flags = 'g' + (cs === '1' ? '' : 'i');
    if (type === '1') rules.push({ pat, rep, cs, type, re: new RegExp(pat, flags), r: rep.replace(/\\(\d)/g, '$$$1') });
    else rules.push({ pat, rep, cs, type, re: new RegExp(type === '2' ? `\\b${esc(pat)}\\b` : esc(pat), flags), r: rep.replace(/\$/g, '$$$$') });
  });
  if (tokenize) {
    // \u958B\u982D\u9023\u7E8C\u7684\u300C\u4EFB\u610F\u4F4D\u7F6E\u3001\u5206\u5927\u5C0F\u5BEB\u300D\u5B57\u9762\u689D\u76EE \u2192 \u67E5\u8868\uFF08\u540C\u4E00\u500B\u9375\u4EE5\u7B2C\u4E00\u689D\u70BA\u6E96\uFF09
    let n = 0;
    const lit = new Map();
    while (n < rules.length && rules[n].type === '0' && rules[n].cs === '1') { if (!lit.has(rules[n].pat)) lit.set(rules[n].pat, rules[n].rep); n++; }
    rules.tok = { lit, maxLen: Math.max(...[...lit.keys()].map(k => k.length)), rest: rules.slice(n) };
  }
  return rules;
}
function tokenizeText({ lit, maxLen }, s) {
  let out = '';
  for (let i = 0; i < s.length;) {
    let L = Math.min(maxLen, s.length - i);
    for (; L > 0; L--) { const v = lit.get(s.substr(i, L)); if (v !== undefined) { out += v; break; } }
    if (L > 0) i += L; else out += s[i++];
  }
  return out;
}
const apply = (rules, s) => rules.tok
  ? rules.tok.rest.reduce((t, x) => t.replace(x.re, x.r), tokenizeText(rules.tok, s))
  : rules.reduce((t, x) => t.replace(x.re, x.r), s);

// 音節清單：Phn.tbl（6d-IME）每 3 行一組：音節點字、注音大千鍵、可用聲調
const DAQIAN = { '1':'ㄅ','q':'ㄆ','a':'ㄇ','z':'ㄈ','2':'ㄉ','w':'ㄊ','s':'ㄋ','x':'ㄌ','e':'ㄍ','d':'ㄎ','c':'ㄏ','r':'ㄐ','f':'ㄑ','v':'ㄒ',
  '5':'ㄓ','t':'ㄔ','g':'ㄕ','b':'ㄖ','y':'ㄗ','h':'ㄘ','n':'ㄙ','u':'ㄧ','j':'ㄨ','m':'ㄩ','8':'ㄚ','i':'ㄛ','k':'ㄜ',',':'ㄝ',
  '9':'ㄞ','o':'ㄟ','l':'ㄠ','.':'ㄡ','0':'ㄢ','p':'ㄣ',';':'ㄤ','/':'ㄥ','-':'ㄦ' };
const MARK = { 1: '', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '˙' };
const phn = readFileSync(phnPath, 'utf8').split(/\r?\n/);
const sylls = new Map();   // 注音 → Unicode 點字
for (let i = 0; i + 2 < phn.length; i += 3)
  for (const t of phn[i + 2]) if (MARK[t] !== undefined) {
    try {
      const u = conv.convertBpmfToBraille([...phn[i + 1]].map(c => DAQIAN[c] || c).join('') + MARK[t]).trim();
      sylls.set(conv.convertBrailleToTokens(u)[0].bpmf, u);
    } catch {}
  }

function evaluate(rules) {
  const own = new Map();   // 鍵完全相同的字面規則（第一條）
  for (const x of rules) if (x.type === '0' && !own.has(x.pat)) own.set(x.pat, x.r);
  const r = { ok: 0, missing: [], partial: [], wrong: [], exp: new Map(), pairs: new Map() };
  for (const [b, u] of sylls) for (const key of [u, toAscii(u)]) {
    const tag = b + (key === u ? '' : '（ASCII）'), got = apply(rules, key);
    if (!own.has(key)) { (got === key ? r.missing : r.partial).push(got === key ? tag : `${tag} ${key}→${got}`); continue; }
    r.exp.set(key, own.get(key));
    if (got === own.get(key)) r.ok++; else r.wrong.push(`${tag} ${key}→${got}（預期 ${own.get(key)}）`);
  }
  return r;
}
// 兩個音節相連、交界處的 2～3 格剛好是某條規則的組合（兩版字典合起來算，才能比較同一批）
function pairCandidates(ruleSets) {
  const pats = new Set(ruleSets.flatMap(rs => rs.filter(x => x.type === '0').map(x => x.pat)));
  const out = [];
  for (const ascii of [false, true]) {
    const keys = [...sylls.values()].map(u => ascii ? toAscii(u) : u);
    for (const p of keys) for (const s of keys) {
      const cp = [...(p + s)], n = [...p].length;
      let hit = false;
      for (let st = Math.max(0, n - 2); st < n && !hit; st++)
        for (let len = 2; len <= 3 && !hit; len++) if (st + len > n && st + len <= cp.length && pats.has(cp.slice(st, st + len).join(''))) hit = true;
      if (hit) out.push([p, s]);
    }
  }
  return out;
}

const A = load(oldPath), B = newPath ? load(newPath, tokenizeNew) : null;
const cands = pairCandidates(B ? [A, B] : [A]);
for (const [name, rules] of [['現行版', A], ['修正版', B]]) {
  if (!rules) continue;
  const r = evaluate(rules);
  const bad = cands.filter(([p, s]) => r.exp.has(p) && r.exp.has(s) && apply(rules, p + s) !== r.exp.get(p) + r.exp.get(s));
  console.log(`【${name}】${sylls.size} 個音節 × 兩種寫法`);
  console.log(`  單獨：正確 ${r.ok}；沒有規則、原樣留下 ${r.missing.length}；沒有規則、被別條規則取代一部分 ${r.partial.length}；換錯 ${r.wrong.length}`);
  if (r.wrong.length) console.log('    換錯：' + r.wrong.join('；'));
  if (r.partial.length) console.log('    取代一部分，例：' + r.partial.slice(0, 6).join('；'));
  console.log(`  兩個音節相連、被跨界搶先取代：${bad.length} 組` + (bad.length ? `，例：${bad.slice(0, 3).map(([p, s]) => `${p + s}→${apply(rules, p + s)}`).join('；')}` : ''));
}
if (B) {
  // 預期：兩個音節各自單獨時修正版給的結果
  const expB = new Map([...sylls.values()].flatMap(u => [u, toAscii(u)]).map(k => [k, apply(B, k)]));
  let same = 0; const better = [], worse = [], other = [];
  for (const [p, s] of cands) {
    const a = apply(A, p + s), b = apply(B, p + s), want = expB.get(p) + expB.get(s);
    if (a === b) same++;
    else (b === want ? better : a === want ? worse : other).push(`${p + s}：${a} → ${b}`);
  }
  console.log(`\n跨界組合 ${cands.length} 個：兩版輸出相同 ${same}；修正版變正確 ${better.length}、變錯 ${worse.length}、都不對但不同 ${other.length}`);
  if (worse.length) console.log('  變錯：\n    ' + worse.join('\n    '));
  if (other.length) console.log('  都不對但不同，例：\n    ' + other.slice(0, 10).join('\n    '));
}
