/*
 * 樂理試題用的點字：數字低音（Par. 30.2）、級數分析（Par. 30.4）、譜例方框（Par. 1.13.1）。node tests/exam-test.js
 * 級數分析的排法對照 BANA Example 30.4-1（第一行：調在邊界、羅馬數字的字母在音名正下方、小節之間 ⠇）。
 */
const MB = require('./load.js');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('✗ ' + name + (detail ? '\n' + detail : '')); } };
const brl = (abc, o) => MB.toBraille(MB.parseAbc(abc, {}).score, Object.assign({ width: 40, title: false }, o));
const body = (b) => b.brf.split('\n').slice(1).join('\n').replace(/\n+$/, '');
const roundAbc = (b) => MB.toAbc(MB.parseBraille(b.brf, {}).score).abc.trim().split('\n').pop();

// 級數分析（同 Ex. 30.4-1 的前兩小節：A 大調 V V2 I6 ii7 | I64 V7）
let b = brl('X:1\nM:4/4\nL:1/4\nK:A clef=bass\n"_A:V"E, "_V2"D, "_I6"C, "_ii7"B,, | "_I64"E, "_V7"E,,3 |]');
check('級數分析排法', body(b) === "#A _$ :   ?   W L  _$   ^P'<K\n,A3,V,V#2,I#6;II#7 ,I#46,V#7", body(b));
// 字母對齊音名
{
  const [m, a] = body(b).split('\n');
  for (const [k, ch] of [...a].entries()) if ((ch === 'V' || ch === 'I') && (a[k - 1] === ',' || a[k - 1] === ';')) check('對齊 ' + k, /[A-Z=(!)?:$\]\[]/.test(m[k]) && m[k] !== 'L', m + '\n' + a);
}
check('級數分析讀回', roundAbc(b) === '"_A:V"E,2 "_V2"D,2 "_I6"C,2 "_ii7"B,,2 | "_I64"E,2 "_V7"E,,6 |]', roundAbc(b));
// 符號：° ø + 、副屬和弦、小寫
const E = MB.brailleAnalysis.encodeAnalysis;
check('vii°7', E('vii°7').brf === ';VII4#7');
check('viiø65', E('viiø65').brf === ";VII4'#56");
check('III+', E('III+').brf === ',III+');
check('V7/V', E('V7/V').brf === ',V#7/,V');
check('Ab: I64', E('Ab:I64').brf === ',A<3,I#46');
check('解碼', JSON.stringify(MB.brailleAnalysis.decodeAnalysis(',V#7/,V;II#56')) === JSON.stringify([{ text: 'V7/V', at: 1 }, { text: 'ii65', at: 8 }]));

// 數字低音（水平式）
b = brl('X:1\nM:4/4\nL:1/4\nK:C clef=bass\n"_6"E, "_6/4"G, "_#"G, "_7"G,|"_b"C "_6/5"B,, "_4/2"F, z|]');
check('數字低音', body(b) === '#A ;>_$#6\\#46\\#%K\\#7 "?#<K^W#56_]#24V<K', body(b));
check('數字低音讀回', roundAbc(b) === '"_6"E,2 "_6/4"G,2 "_#"G,2 "_7"G,2 | "_b"C2 "_6/5"B,,2 "_4/2"F,2 z2 |]', roundAbc(b));
// 鋼琴左手：⠰⠜ 取代左手記號
b = brl('X:1\nM:2/4\nL:1/4\nK:C\nV:1\nc e|\nV:2 clef=bass\n"_6"E, "_5/3"F,|]');
check('左手數字低音記號', /;>/.test(b.brf) && !/_>/.test(b.brf), b.brf);

// 譜例方框
b = brl('X:1\nM:4/4\nL:1/4\nK:C\n"^[A"c d "^[B]"e "^A]"f|]');
check('方框', body(b) === '#A >,A>;1.?:>,B>;;1.$"22]"2<K', body(b));
check('方框讀回', roundAbc(b) === '"^[A"c2 d2 "^[B]"e2 "^A]"f2 |]', roundAbc(b));
const ds = MB.examMarks.describe(MB.parseAbc('X:1\nM:4/4\nL:1/8\nK:G\n"^[A"c2 d e "^A]"f4|"^[B]"g8|]', {}).score).map((x) => x.text);
check('方框說明', ds[0] === '方框 A：第 1 小節第 1 拍到第 4 拍，4 個音：C5、D5、E5、升 F5' && ds[1] === '方框 B：第 2 小節第 1 拍，G5', ds.join('\n'));

// MusicXML 來回
const abc = 'X:1\nM:4/4\nL:1/4\nK:C clef=bass\n"_I6""_6"E, "_6/4"G, "_#"G, "_V7""_7"G,|"_b"C D "_6/5"B,, C|]';
const xs = MB.toMusicXML(MB.parseAbc(abc, {}).score);
const back = MB.parseMusicXML(typeof xs === 'string' ? xs : xs.xml);
const line = MB.toAbc(back.score).abc.trim().split('\n').pop();
check('MusicXML 數字低音、級數', line === '"_I6""_6"E,2 "_6/4"G,2 "_#"G,2 "_V7""_7"G,2 | "_b"C2 D2 "_6/5"B,,2 C2 |]', line);
// 三重奏（小提琴、大提琴、沒寫名稱的鋼琴雙手）：總譜的樂器表叫 Piano（不是沿用前一個樂器），方框說明寫「鋼琴右手」
const trio = `X:1\nM:2/4\nL:1/8\nK:C\n%%score 1 2 {3 4}\nV:1 name="Violin"\nV:2 name="Cello" clef=bass\nV:3\nV:4 clef=bass\n[V:1] z4 |]\n[V:2] z4 |]\n[V:3] "^[A]"c2 d2 |]\n[V:4] C,4 |]`;
const tr = MB.parseAbc(trio, {});
const table = MB.brf.toUnicode(MB.scoreBraille(tr, { width: 40 }).brf);
check('總譜樂器表：沒名稱的鋼琴叫 Piano', /⠠⠏⠊⠁⠝⠕ ⠗⠊⠛⠓⠞/.test(table) && !/⠉⠑⠇⠇⠕ ⠗⠊⠛⠓⠞/.test(table) && /⠜⠏⠗⠄/.test(table), table);
const tm = MB.examMarks.describe(MB.ensembleScore(tr)).map((m) => m.text).join('\n');
check('總譜的方框說明：鋼琴右手', /方框 A：鋼琴右手的第 1 小節/.test(tm), tm);
check('弱起小節', /弱起小節/.test(MB.examMarks.describe(MB.parseAbc('X:1\nM:2/4\nL:1/8\nK:C\n"^[A]"c2 | c4 |]', {}).score).map((m) => m.text).join('')));
console.log(`通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
