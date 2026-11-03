/*
 * 樂理練習測試：node tests/theory-test.js
 * 每種題型、兩種難度各出 300 題，檢查選項、答案、解說，以及譜例能不能轉成點字。
 * 樂理運算本身另以 music21 核對：node tests/theory-cases.js > cases.json; python tests/theory_m21.py cases.json
 */
const MB = require('./load.js');
require('../js/theory.js');
require('../js/theory-quiz.js');
const T = MB.theory;
const Q = MB.theoryQuiz;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; if (fail < 40) console.log('✗ ' + name + (detail ? '\n  ' + detail : '')); } };

// 固定的例子（照 115 年試題的觀念）
const P = T.parseNote;
check('增四度', T.interval(P('C4'), P('F#4')).name === '增四度');
check('減四度', T.interval(P('C#4'), P('F4')).name === '減四度');
check('屬七第二轉位', T.identifyChord(['D3', 'F3', 'G3', 'B3'].map(P)).figure === '43');
check('降 A 大調 I64', T.romanNumeral(T.identifyChord(['Eb3', 'Ab3', 'C4', 'Ab4'].map(P)), { tonic: P('Ab'), mode: 'major' }).symbol === 'I64');
check('G 大調 ii65', T.romanNumeral(T.identifyChord(['C3', 'E3', 'G3', 'A3'].map(P)), { tonic: P('G'), mode: 'major' }).symbol === 'ii65');
check('全音音階', T.identifyScale(['C', 'D', 'E', 'F#', 'G#', 'A#'].map(P)).some((x) => x.type === 'wholetone'));
check('A 調單簧管', T.nameZh(T.writtenPitch(P('A4'), 'A')) === 'C');
check('降 B 調', T.nameZh(T.writtenPitch(P('C4'), 'Bb')) === 'D');
check('四個降記號', T.keyNameZh(T.keyFromFifths(-4).major, 'major') === '降 A 大調');

Q.seed(20261103);
for (const type of Object.keys(Q.TYPES)) {
  for (const level of [1, 2]) {
    for (let i = 0; i < 300; i++) {
      let q;
      try { q = Q.TYPES[type].make(level); } catch (e) { check(type + ' 出題', false, e.message); continue; }
      const tag = type + ' L' + level + ' #' + i;
      check(tag + ' 四個選項', q.options.length === 4 && new Set(q.options).size === 4, q.options.join(' / '));
      check(tag + ' 答案', q.answer >= 0 && q.answer < 4);
      check(tag + ' 解說', q.explain && !/undefined|NaN/.test(q.explain + q.prompt), q.prompt + ' ' + q.explain);
      const right = q.options[q.answer];
      const d = q.data;
      if (type === 'interval') check(tag + ' 音程', T.interval(d.lo, d.hi).name === right);
      if (type === 'triad' || type === 'seventh') check(tag + ' 和弦', T.identifyChord(d.voiced).name === right);
      if (type === 'roman') {
        check(tag + ' 級數', T.romanNumeral(T.identifyChord(d.voiced), d.key).symbol === right);
        // 干擾選項不能也是對的
        check(tag + ' 干擾', q.options.filter((o) => o === right).length === 1);
      }
      if (type === 'enharmonic') {
        const ens = T.enharmonics(d.n).map((e) => T.nameZh(e));
        check(tag + ' 等音', ens.includes(right));
        check(tag + ' 干擾不是等音', q.options.filter((o) => ens.includes(o) || o === T.nameZh(d.n)).length === 1, q.prompt + ' ' + q.options.join('/'));
      }
      if (type === 'transpose') check(tag + ' 移調', T.nameZh(T.writtenPitch(d.concert, d.inst)) === right);
      if (type === 'scale') {
        const ids = T.identifyScale(d.notes).filter((x) => T.same(x.tonic, d.notes[0])).map((x) => x.name);
        check(tag + ' 音階', ids.includes(right) && q.options.filter((o) => ids.includes(o)).length === 1, ids.join(',') + ' | ' + q.options.join('/'));
      }
      if (type === 'keysig') {
        const k = T.keyFromFifths(d.fifths);
        check(tag + ' 調號', T.keyNameZh(d.mode === 'minor' ? k.minor : k.major, d.mode) === right);
      }
      if (q.abc) {
        try {
          const r = MB.parseAbc(q.abc, {});
          const b = MB.toBraille(r.score, { width: 40, title: false });
          check(tag + ' 點字', b.brf && b.brf.length > 0);
        } catch (e) { check(tag + ' 點字', false, q.abc + ' ' + e.message); }
      }
    }
  }
}
console.log(`通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
