/*
 * 四部和聲檢查測試：node tests/harmony-test.js
 * 平行、反向五八度另以 music21 核對：node tests/harmony-test.js --cases > hcases.json; python tests/harmony_m21.py hcases.json
 */
const MB = require('./load.js');
require('../js/theory.js');
require('../js/harmony-check.js');
const T = MB.theory;
const H = MB.harmony;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('✗ ' + name + (detail ? '\n  ' + detail : '')); } };
const C = { tonic: T.parseNote('C'), mode: 'major' };
const run = (text, key) => { const p = H.parseText(text); return H.check(p.chords, key || C).issues; };
const rules = (iss, level) => iss.filter((x) => !level || x.level === level).map((x) => x.rule);

if (process.argv.includes('--cases')) {
  // 隨機的兩個和弦，輸出每一對聲部的平行／反向判斷給 music21 核對
  let seed = 99;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), Math.floor(seed / 65536) % n);
  const rn = (lo, hi) => { const m = lo + rnd(hi - lo + 1); const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']; return T.parseNote(names[m % 12] + (Math.floor(m / 12) - 1)); };
  const cases = [];
  for (let i = 0; i < 3000; i++) {
    const a = [rn(60, 79), rn(55, 74), rn(48, 67), rn(40, 62)].sort((x, y) => T.midi(y) - T.midi(x));
    const b = a.map((n) => { const m = T.midi(n) + rnd(25) - 12; return rn(m, m); }).sort((x, y) => T.midi(y) - T.midi(x));
    const iss = H.check([{ notes: a }, { notes: b }], C).issues.filter((x) => x.to != null);
    for (let u = 0; u < 4; u++) for (let l = u + 1; l < 4; l++) {
      const has = (r) => iss.some((x) => x.rule === r && x.voices[0] === u && x.voices[1] === l);
      cases.push({ u1: T.nameEn(a[u], { octave: true }), u2: T.nameEn(b[u], { octave: true }), l1: T.nameEn(a[l], { octave: true }), l2: T.nameEn(b[l], { octave: true }), parallel: has('parallel'), contrary: has('contrary') });
    }
  }
  console.log(JSON.stringify(cases));
  process.exit(0);
}

// 正確的 I–IV–V–I
let iss = run('C5 G4 E4 C3 I\nC5 A4 F4 F3 IV\nB4 G4 D4 G3 V\nC5 G4 E4 C3 I');
check('I–IV–V–I 沒有錯誤', rules(iss, 'error').length === 0 && rules(iss, 'warn').length === 0, iss.map((x) => x.msg).join('\n  '));
// 平行八度、五度
iss = run('C5 G4 E4 C3\nD5 A4 F4 D3');
check('平行八度、五度', rules(iss, 'error').filter((r) => r === 'parallel').length >= 2, iss.map((x) => x.msg).join('\n  '));
check('平行訊息', iss.some((x) => /平行八度/.test(x.msg)) && iss.some((x) => /平行五度/.test(x.msg)));
// 反向八度
iss = run('C5 G4 E4 C3\nG4 G4 D4 G3');
check('反向八度', rules(iss).includes('contrary'), iss.map((x) => x.msg).join('\n  '));
// 聲部交錯、間距
iss = run('E4 G4 C4 C3');
check('聲部交錯', rules(iss).includes('crossing'));
iss = run('C6 G4 E4 C3');
check('間距', rules(iss).includes('spacing'));
// 導音沒有解決（高音部）
iss = run('B4 G4 D4 G3 V\nG4 E4 C4 C3 I');
check('導音', rules(iss, 'error').includes('leading'), iss.map((x) => x.msg).join('\n  '));
// 七音沒有下行
iss = run('F4 D4 B3 G2 V7\nG4 E4 C4 C3 I');
check('七音解決', rules(iss, 'error').includes('seventh'), iss.map((x) => x.msg).join('\n  '));
iss = run('F4 D4 B3 G2 V7\nE4 C4 C4 C3 I');
check('七音解決 OK', !rules(iss).includes('seventh'), iss.map((x) => x.msg).join('\n  '));
// 增二度（a 小調 F→G#）
const am = { tonic: T.parseNote('A'), mode: 'minor' };
iss = run('A4 F4 D4 D3 iv\nB4 G#4 E4 E3 V', am);
check('增二度', rules(iss).includes('melodicAug'), iss.map((x) => x.msg).join('\n  '));
// 隱伏八度
iss = run('E5 G4 C4 C3\nG5 B4 D4 G3');
check('隱伏八度', rules(iss).includes('hidden'), iss.map((x) => x.msg).join('\n  '));
// 級數標錯、標對（各種寫法）
iss = run('F4 D4 B3 G2 V7\nE4 C4 G3 C3 I6');
check('級數標錯', rules(iss).includes('label'));
for (const w of ['V6/5', 'V65', 'V⁶₅', 'Ⅴ65']) {
  iss = run('F4 D4 G3 B2 ' + w);
  check('級數寫法 ' + w, !rules(iss).includes('label'), iss.map((x) => x.msg).join('\n  '));
}
for (const [w, notes] of [['vii°', 'D5 F4 B3 B2'], ['viio6', 'B4 F4 B3 D3'], ['V2', 'G4 D4 B3 F3'], ['V/V', 'F#4 D4 A3 D3'], ['V7/V', 'F#4 C4 A3 D3']]) {
  iss = run(notes + ' ' + w);
  check('級數寫法 ' + w, !rules(iss).includes('label'), iss.map((x) => x.msg).join('\n  '));
}
// 數字低音
iss = run('G4 D4 G3 B2 [6]');
check('數字低音 6 OK', !rules(iss).includes('figure'), iss.map((x) => x.msg).join('\n  '));
iss = run('E4 C4 G3 B2 [6]');
check('數字低音 6 不對', rules(iss).includes('figure'));
iss = run('B4 G#4 E4 E3 [#]', am);
check('數字低音 # OK', !rules(iss).includes('figure'), iss.map((x) => x.msg).join('\n  '));
iss = run('B4 G4 E4 E3 [#]', am);
check('數字低音 # 沒升', rules(iss).includes('figure'));
iss = run('F4 D4 G3 B2 [6/5]');
check('數字低音 6/5', !rules(iss).includes('figure'), iss.map((x) => x.msg).join('\n  '));
iss = run('G4 D4 B3 F3 [4/2]');
check('數字低音 4/2', !rules(iss).includes('figure'), iss.map((x) => x.msg).join('\n  '));
iss = run('B4 F4 D4 G2 [7]');
check('數字低音 7 省略五度', !rules(iss).includes('figure'), iss.map((x) => x.msg).join('\n  '));
// 格式錯誤
check('格式錯誤', H.parseText('C5 G4 E4').errors.length === 1);
// 轉點字
const p = H.parseText('C5 G4 E4 C3\nC5 A4 F4 F3\nB4 G4 D4 G3\nC5 G4 E4 C3\nB4 G4 D4 G3');
const abc = H.toAbc(p.chords, C);
const r = MB.parseAbc(abc, {});
const b = MB.scoreBraille(r, { width: 40, title: false });
check('合唱點字', /⠜⠎/.test(MB.brf.toUnicode(b.brf)) || />S/.test(b.brf), b.brf);

// 114 南區和聲題（二）：d 小調數字低音，「7/#」是 7 疊 #（不是升七度），結尾皮卡第三度寫 I
const dm = { tonic: T.parseNote('D'), mode: 'minor' };
const fig = (f) => H.parseFigure(f).intervals.map((x) => x.num + (x.acc || '')).join(',');
check('7/# 是七度＋升三度', fig('7/#') === '7,5,3#' && fig('7 #') === '7,5,3#', fig('7/#'));
check('7# 是升七度', fig('7#') === '7#,5,3', fig('7#'));
check('6#/4 是升六度＋四度', fig('6#/4') === '6#,4', fig('6#/4'));
iss = run(`F5 A4 D4 D3 i
G5 A4 E4 C#3 [6/5] V65
F5 A4 D4 D3 i
E5 A4 C#4 E3 [6#/4] V64
D5 A4 D4 F3 [6] i6
E5 G4 Bb3 G3 [6] ii°6
C#5 E4 A3 A3 V
D5 D4 A3 F3 i6
C#5 G4 A3 E3 V43
D5 F4 A3 D3 i
D5 E4 Bb3 G3 [6/5] iiø65
D5 F4 A3 A3 [6/4] i64
E5 G4 C#4 A2 [7/#] V7
D5 F#4 D4 D3 [#] I`, dm);
check('114 和聲題（二）沒有錯誤', rules(iss, 'error').length === 0, iss.map((x) => x.msg).join('\n  '));
iss = run('D5 F#4 D4 D3 V/iv', dm);
check('d 小調的 D 大三和弦也可以寫 V/iv', rules(iss, 'error').length === 0, iss.map((x) => x.msg).join('\n  '));
console.log(`通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
