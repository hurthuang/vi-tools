/*
 * 自動測試：node tests/run.js
 * 範例點字取自 BANA《Music Braille Code 2015》（BRF 格式）。
 */
const MB = require('./load.js');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) pass++;
  else {
    fail++;
    console.log('✗ ' + name + (detail ? '\n' + detail : ''));
  }
}

/** 取出模型的音樂內容（音高、時值）供比較。 */
function summary(score) {
  return score.parts
    .map((p) =>
      p.measures
        .map((m) =>
          m.voices
            .map((v) =>
              v
                .map((e) => {
                  const d = e.measureRest ? 'M' : e.value + '.'.repeat(e.dots || 0) + (e.tuplet ? 't' + e.tuplet.n : '');
                  if (e.kind === 'rest') return 'z' + d;
                  return (
                    e.notes.map((n) => n.step + n.octave + (n.alter ? (n.alter > 0 ? '#'.repeat(n.alter) : 'b'.repeat(-n.alter)) : '') + (n.tie ? '~' : '')).join('+') + '/' + d
                  );
                })
                .join(' ')
            )
            .join(' & ')
        )
        .join(' | ')
    )
    .join(' || ');
}

function abcBody(abc) {
  return abc
    .split('\n')
    .filter((l) => l && !/^[A-Za-z]:|^%%/.test(l))
    .join('\n');
}

// ---------- 1. BRF / Unicode ----------
{
  const s = '#A "[.FIDI ];DGIG \\.HJE.G $EF?<K';
  const u = MB.brf.toUnicode(s);
  check('BRF→Unicode→BRF', MB.brf.toBrf(u) === s, u);
  check('Unicode 中央 C 八分音符', MB.brf.toUnicode('"D') === '⠐⠙');
}

// ---------- 2. 規範範例：點字 → 模型 ----------
const EX = [
  {
    name: 'Ex 3.3-1（八度記號）',
    brl: '       #C4\n#A "[.FIDI ];DGIG \\.HJE.G $EF?<K',
    abc: "A2 e a c' a | f2 c' f' a' f' | g'2 g b d' f | e2 d e c2 |]",
    same: true,
  },
  {
    name: 'Ex 8.1-1（分組、休止符開頭的分組、拍號改變）',
    brl: '                 #C4\n#A "!JDJMDJI.ODJIRGFE #F8 "YEFGHI\\X\n  "&G.ED"EF?X<K',
  },
  {
    name: 'Ex 6.1-1（臨時記號）',
    brl: '              #F8\n#A "[%H<JI*H G<.FE%?\' *?<E*JD*E\n  .F%"G*H%\\I S\'<K',
  },
  {
    name: 'Ex 10.1-1（弱起、連結線）',
    brl: '             %#C4\n#J .:@C :\\$ :??@C ?.[.?@C ?W<K',
    abc: "K:G\nd2- | d2 g2 e2 | d2 c2 c2- | c2 a2 c2- |\nc2 B2 |]",
  },
  {
    name: 'Ex 9.1-1（右手和弦，向下的音程）',
    brl: '             <<<#C4\n.>.?0*W0?- "[\'+H*+[+ .$93:*+0?#0\n  .O*+9-V<K',
  },
  {
    name: 'Ex 9.2-2（左手和弦，向上的音程）',
    opts: { intervalDir: 'up' },
    brl: '           #C4\n_>^$0+\\+3I+9%G90 ^\\#0R+9<K',
  },
  {
    name: 'Ex 29.3-1（鋼琴雙手）',
    brl: '                  <#B4\nA .>"Q     "P     X"EFG "HEFG "FEDJ _S<K\n  _>\'X_HIJ "D_HIJ "N    _W\'I  _HJIH _Q<K',
    same: true,
  },
  {
    name: 'Ex 17.1-1（反覆記號）',
    brl: '                   <#B4\n#A "GIID G&ZYJIH IJIH<2\n#D "I===FGH [X" <7.YY "G(!)DEF =(IX<2',
  },
  {
    name: 'Ex 17.1.1-1（房號）',
    brl: '              <<#C4\n#A ^WW] _??^] #1\'%^]\\[ RV<2 #2^]\\[ T\'<K',
  },
  {
    name: 'Ex 13.4-1（短圓滑線交會 ⠠⠉）',
    brl: '                   <<<#F8\n#A "WCE,CDCJCI HCFCH]CF,C ECFCGC$\'<K',
    same: true,
  },
  {
    name: 'Ex 13.4-2(b)（括號式圓滑線交會 ⠰⠃⠘⠆）',
    brl: '                     %#C4\n#J "JCICHC ;B]FEFG HI;B^2JJDE P\'^2<K',
    same: true,
  },
  {
    name: 'Ex 8.4-1（三連音）',
    brl: '             <<#B4\n#A "T 2_W:] JI2DJI 2JIH22!HG(GF\n  "=FE2&ZYED T<K',
  },
];

for (const ex of EX) {
  const r = MB.parseBraille(ex.brl, ex.opts);
  const abc = MB.toAbc(r.score).abc;
  check(ex.name + '：警告數', r.warnings.length === (ex.warns || 0), r.warnings.map((w) => '  ' + w.msg).join('\n'));
  if (ex.abc) {
    const want = ex.abc.split('\n');
    const got = abc;
    const ok = want.every((line) => got.includes(line));
    check(ex.name + '：ABC 內容', ok, 'want:\n' + ex.abc + '\ngot:\n' + abcBody(abc));
  }
  // 重新產生點字並再次解析，音樂內容應相同
  const b = MB.toBraille(r.score);
  const r2 = MB.parseBraille(b.brf, ex.opts);
  check(ex.name + '：點字來回一致', summary(r2.score) === summary(r.score), 'orig:\n' + ex.brl + '\nregen:\n' + b.brf + '\n' + summary(r.score) + '\n' + summary(r2.score));
  if (ex.same) {
    const norm = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    check(ex.name + '：與規範範例逐字相同', norm(b.brf) === norm(ex.brl), 'want:\n' + ex.brl + '\ngot:\n' + b.brf);
  }
  // ABC 來回
  const r3 = MB.parseAbc(abc);
  check(ex.name + '：ABC 來回一致', summary(r3.score) === summary(r.score), abc + '\n' + summary(r.score) + '\n' + summary(r3.score));
}

// ---------- 3. ABC → 點字 ----------
const ABC_CASES = [
  {
    name: '小星星（C 大調 4/4）',
    abc: 'X:1\nT:小星星\nM:4/4\nL:1/4\nK:C\nC C G G | A A G2 | F F E E | D D C2 |]',
    brl: '#A "??\\\\ [[R ]]$$ ::N<K',
  },
  {
    name: '八度記號：四度、五度跨八度才標',
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\nG c B e | c G2 z |]',
    brl: '#A "\\.?W.$ ?"RV<K',
  },
  {
    name: '六度以上一定標八度',
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\nC A c C |]',
    brl: '#A "?"[?"?<K',
  },
  {
    name: '附點與休止符',
    abc: 'X:1\nM:3/4\nL:1/8\nK:F\nF3 G A2 | z2 c4 |]',
    brl: '#A "]\'H[ VN<K',
  },
  {
    name: '和弦（高音譜向下）',
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\n[CEG]2 [DFA]2 |]',
    brl: '#A "R+9S+9<K',
  },
  {
    name: '臨時記號',
    abc: 'X:1\nM:2/4\nL:1/4\nK:C\n^F G | _B =B |]',
    brl: '#A %"]\\ <W*W<K',
  },
  {
    name: '三連音',
    abc: 'X:1\nM:2/4\nL:1/8\nK:C\n(3CDE (3FGA | c2 z2 |]',
    brl: '#A 2"DEF2GHI ?V<K',
  },
  {
    name: '16 分音符分組',
    abc: 'X:1\nM:2/4\nL:1/16\nK:C\nCDEF GABc | c8 |]',
    brl: '#A "YEFG(IJD N<K',
  },
  {
    name: '反覆與房號',
    abc: 'X:1\nM:2/4\nL:1/4\nK:C\n|: C D |1 E F :|2 G2 |]',
    brl: '#A <7"?: #1"$]<2 #2"R<K',
  },
  {
    name: '連結線與圓滑線',
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\n(C D) E2- | E4 |]',
    brl: '#A "?C:P@C &<K',
  },
  {
    name: '整小節休止一律寫全休止符',
    abc: 'X:1\nM:3/4\nL:1/4\nK:C\nC D E | z3 |]',
    brl: '#A "?:$ M<K',
  },
  {
    name: '指法與換指（Par. 15）',
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\n!1!C !2!D !3!E !4!!3!F |]',
    brl: '#A "?A:B$L]1CL<K',
  },
  {
    name: '和弦指法（指法在音符與各音程之後）',
    abc: 'X:1\nM:2/4\nL:1/4\nK:C\n[!1!C!3!E!5!G]2 |]',
    brl: '#A "RK+L9A<K',
  },
  {
    name: '短倚音與長倚音（Par. 16.2）',
    abc: 'X:1\nM:2/4\nL:1/4\nK:C\n{/B}c {d}c |]',
    brl: '#A 5"J?"5E?<K',
  },
  {
    name: '顫音、漣音、迴音（Par. 16.3–16.5）',
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\n!trill!c !uppermordent!d !lowermordent!e !turn!f |]',
    brl: '#A 6.?"6:"6L$,4]<K',
  },
  {
    name: '踏板：緊接著再踩時省略放開、結尾省略放開（Par. 29.10）',
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\n!ped!C D !ped-up!E !ped!!ped-up!F |]',
    brl: '#A <C"?:$<C]<K',
  },
  {
    name: '踏板：換踏板與放開',
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\n!ped!C !ped-up!!ped!D !ped-up!E F |]',
    brl: '#A <C"?*<C:$*C]<K',
  },
  {
    name: 'Segno、Fine、D.S. al Fine（Par. 20）',
    abc: 'X:1\nM:2/4\nL:1/4\nK:C\nC D | !segno!E F | G A "^Fine"| c2 "^D.S. al Fine"|]',
    brl: '#A "?:\n#B + "$] \\[ >FINE> .N<K >D\'S\' AL FINE>',
  },
  {
    name: 'To Coda、D.C. al Coda、Coda 段落',
    abc: 'X:1\nM:2/4\nL:1/4\nK:C\nC D | E F "^To Coda"| G2 "^D.C. al Coda"|| "^Coda"c2 |]',
    brl: "#A \"?: $] +L \"R<K' >D'C' AL CODA>\n>CODA>\n#D .N<K",
  },
  {
    name: '琶音（Table 22）',
    abc: 'X:1\nM:2/4\nL:1/4\nK:C\n!arpeggio![CEG]2 |]',
    brl: '#A >K"R+9<K',
  },
  {
    name: '力度與斷奏',
    abc: 'X:1\nM:4/4\nL:1/4\nK:C\n!p!C .D !f!E F |]',
    brl: '#A >P"?8:>F"$]<K',
  },
];
for (const c of ABC_CASES) {
  const r = MB.parseAbc(c.abc);
  check(c.name + '：ABC 無警告', r.warnings.length === 0, r.warnings.map((w) => '  ' + w.msg).join('\n'));
  const b = MB.toBraille(r.score);
  const body = b.brf.split('\n').slice(1).join('\n');
  if (!c.skipExact) check(c.name + '：點字', body === c.brl, 'want: ' + c.brl + '\ngot:  ' + body + '\n' + MB.brf.toUnicode(body));
  const r2 = MB.parseBraille(b.brf);
  check(c.name + '：點字來回一致', summary(r2.score) === summary(r.score), b.brf + '\n' + summary(r.score) + '\n' + summary(r2.score) + '\n' + r2.warnings.map((w) => w.msg).join('\n'));
  check(c.name + '：記號來回一致（點字、MusicXML、ABC）',
    fullSummary(r2.score) === fullSummary(r.score) &&
      fullSummary(MB.parseMusicXML(MB.toMusicXML(r.score)).score) === fullSummary(r.score) &&
      fullSummary(MB.parseAbc(MB.toAbc(r.score).abc).score) === fullSummary(r.score),
    firstDiff(fullSummary(r.score), fullSummary(r2.score)) + '\n' +
      firstDiff(fullSummary(r.score), fullSummary(MB.parseMusicXML(MB.toMusicXML(r.score)).score)) + '\n' +
      firstDiff(fullSummary(r.score), fullSummary(MB.parseAbc(MB.toAbc(r.score).abc).score)));
}

// ---------- 4. 鋼琴 ABC → 點字 → ABC ----------
{
  const abc = [
    'X:1', 'T:Minuet', 'M:3/4', 'L:1/8', '%%score {RH | LH}', 'V:RH clef=treble', 'V:LH clef=bass', 'K:G',
    'V:RH', "d2 G A B c | d2 G2 G2 | e2 c d e f | g2 G2 G2 |",
    'V:LH', '[G,B,D]4 A,2 | B,6 | C6 | B,6 |',
  ].join('\n');
  const r = MB.parseAbc(abc);
  check('鋼琴：解析為雙手', r.score.keyboard && r.score.parts.length === 2);
  const b = MB.toBraille(r.score);
  check('鋼琴：有右手與左手記號', /\.>/.test(b.brf) && /_>/.test(b.brf), b.brf);
  const r2 = MB.parseBraille(b.brf);
  check('鋼琴：點字來回一致', summary(r2.score) === summary(r.score), b.brf + '\n' + summary(r.score) + '\n' + summary(r2.score));
  const lines = b.brf.split('\n');
  check('鋼琴：左手和弦向上', lines.some((l) => l.includes('_>_R+9[')), b.brf);
}

// ---------- 4b. 被反覆記號拆開的小節 ----------
{
  const abc = [
    'X:1', 'M:2/4', 'L:1/8', '%%score {1|2}', 'V:1', 'V:2 clef=bass', 'K:C',
    'V:1', 'c | G G G c | A A A d | B3/c/ d B | c2 z :|', '|: c | B3/c/ d B | c2 z |]',
    'V:2', 'z | C E C E | F A F A | G B G B | C2 z :|', '|: z | G B G B | C2 z |]',
  ].join('\n');
  const r = MB.parseAbc(abc);
  const m = r.score.parts[0].measures;
  check('拆開的小節：辨識出後半', m[5].splitCont && !m[4].splitCont && r.score.parts[1].measures[5].splitCont);
  check('拆開的小節：小節編號不重複計算', MB.model.measureNumbers(r.score).join(',') === '0,1,2,3,4,4,5,6', MB.model.measureNumbers(r.score).join(','));
  const b = MB.toBraille(r.score, { width: 20 });
  check('拆開的小節：沒有拍數警告', b.warnings.length === 0, b.warnings.map((w) => w.msg).join('\n'));
  check('拆開的小節：反覆記號後加音樂連字號', /<2"/.test(b.brf) && /<7/.test(b.brf), b.brf);
  check('拆開的小節：從後半開始的行，編號後加點 3', /^D'\.>/m.test(b.brf), b.brf);
  const r2 = MB.parseBraille(b.brf);
  check('拆開的小節：點字讀回無警告', r2.warnings.length === 0, r2.warnings.map((w) => w.msg).join('\n') + '\n' + b.brf);
  check('拆開的小節：點字來回一致', summary(r2.score) === summary(r.score) && r2.score.parts[0].measures[5].splitCont, b.brf + '\n' + summary(r.score) + '\n' + summary(r2.score));
  const single = MB.parseAbc('X:1\nM:3/4\nL:1/4\nK:C\nG | c2 e | d2 :|\n|: G | e2 c |]');
  const bs = MB.toBraille(single.score);
  check('拆開的小節（單行格式）：連字號與反覆', /<2" <7/.test(bs.brf) && bs.warnings.length === 0, bs.brf);
  const rs = MB.parseBraille(bs.brf);
  check('拆開的小節（單行格式）：來回一致', summary(rs.score) === summary(single.score) && rs.warnings.length === 0, bs.brf + '\n' + rs.warnings.map((w) => w.msg).join('\n'));
}

// ---------- 4b2. 斷奏等記號的重複（Par. 22.1.1） ----------
{
  const r = MB.parseBraille('                       #D4\n#a 88"HGF8E.8.8DFH.8J 88DFED.8.8JED8.8J\n  _8_8"IHGF_8:: *\'N\'@cdx<K');
  const marks = r.score.parts[0].measures.map((m) =>
    m.voices[0].map((e) => ['staccato', 'accent', 'tenuto'].filter((a) => (e.articulations || []).includes(a)).map((a) => a[0]).join('') || '-').join(' ')
  );
  const want = ['s s s s a a a a', 's s s s sa sa sa sa', 't t t t t -', '- - -'];
  check('Ex 22.1.1-1：重複的斷奏、重音、持音', JSON.stringify(marks) === JSON.stringify(want) && !r.warnings.length, JSON.stringify(marks));
}

// ---------- 4b3. 輸出的 ABC 裝飾記號都是 abcjs 能顯示的 ----------
{
  // abcjs 6.7.1 的 legalAccents、volumeDecorations、dynamicDecorations
  const abcjsOk = new Set(['trill', 'trillh', 'lowermordent', 'uppermordent', 'mordent', 'pralltriller', 'accent', 'fermata', 'invertedfermata', 'tenuto', '0', '1', '2', '3', '4', '5', '+', 'wedge', 'open', 'thumb', 'snap', 'turn', 'roll', 'breath', 'shortphrase', 'mediumphrase', 'longphrase', 'segno', 'coda', 'D.S.', 'D.C.', 'fine', 'slide', 'marcato', 'upbow', 'downbow', 'turnx', 'invertedturn', 'invertedturnx', 'trill(', 'trill)', 'arpeggio', 'D.C.alcoda', 'D.C.alfine', 'D.S.alcoda', 'D.S.alfine',
    'p', 'pp', 'f', 'ff', 'mf', 'mp', 'ppp', 'pppp', 'fff', 'ffff', 'sfz', 'crescendo(', 'crescendo)', 'diminuendo(', 'diminuendo)']);
  const allowedExtra = new Set(['ped', 'ped-up']); // ABC 標準，abcjs 不畫但其他軟體支援
  const src = 'X:1\nM:4/4\nL:1/4\nK:C\n!segno!!mf!!crescendo(!.C !accent!D !tenuto!!crescendo)!E !wedge!F | !fermata!!arpeggio![CEG] !trill!!3!d !uppermordent!e !lowermordent!!diminuendo(!f | !turn!g !invertedturn!a !ped!b !ped-up!!diminuendo)!!fine!c |]';
  const sc = MB.parseAbc(src).score;
  const outs = [MB.toAbc(sc).abc, MB.toAbc(MB.parseBraille(MB.toBraille(sc).brf).score).abc, MB.toAbc(MB.parseMusicXML(MB.toMusicXML(sc)).score).abc];
  const bad = new Set();
  for (const o of outs) for (const m of o.matchAll(/!([^!\n]*)!/g)) if (!abcjsOk.has(m[1]) && !allowedExtra.has(m[1])) bad.add(m[1]);
  check('輸出的 ABC 裝飾記號 abcjs 都能顯示', bad.size === 0, [...bad].join(', '));
  check('斷奏輸出為「.」', /\.C/.test(outs[0]) && /\.C/.test(outs[1]), outs[0]);
}

// ---------- 4c. 演奏順序（播放與 MIDI 用） ----------
{
  const mk = (flags) => ({ measures: flags.map((f) => Object.assign({ voices: [[]], barline: 'single' }, f)) });
  const t = (name, flags, want) => {
    const o = MB.model.performanceOrder(mk(flags)).join(',');
    check('演奏順序：' + name, o === want, o + '  want ' + want);
  };
  t('反覆', [{}, { endRepeat: true }, {}], '0,1,0,1,2');
  t('房號', [{ startRepeat: true }, { volta: '1', endRepeat: true }, { volta: '2' }, {}], '0,1,0,2,3');
  t('兩段反覆', [{}, { endRepeat: true }, {}, { endRepeat: true }], '0,1,0,1,2,3,2,3');
  t('房號後再反覆', [{}, { volta: '1', endRepeat: true }, { volta: '2' }, { startRepeat: true }, { endRepeat: true }], '0,1,0,2,3,4,3,4');
  t('D.C. al Fine', [{}, { fine: true }, {}, { jump: { type: 'DC', to: 'fine' } }], '0,1,2,3,0,1');
  t('D.C. 有 Fine 但未寫 al Fine', [{}, { fine: true }, {}, { jump: { type: 'DC' } }], '0,1,2,3,0,1');
  t('D.C. 之後不再反覆', [{}, { endRepeat: true, fine: true }, {}, { jump: { type: 'DC', to: 'fine' } }], '0,1,0,1,2,3,0,1');
  t('D.S. al Coda', [{}, { segno: true }, { toCoda: true }, { jump: { type: 'DS', to: 'coda' } }, { codaStart: true }, {}], '0,1,2,3,1,2,4,5');
  t('D.S. al Fine', [{}, { segno: true }, { fine: true }, { jump: { type: 'DS', to: 'fine' } }], '0,1,2,3,1,2');
  const sc = MB.parseAbc('X:1\nM:2/4\nL:1/4\nK:C\nC D | E F "^Fine"| G A "^D.C. al Fine"|]').score;
  const perf = MB.model.performanceScore(sc);
  const abc = MB.toAbc(perf).abc;
  check('演奏順序：展開後的 ABC', /C2 D2 \| E2 F2 \| G2 A2 \| C2 D2 \| E2 F2 \|\]/.test(abc.replace(/\n/g, ' ')), abc);
}

// ---------- 4d. 鋼琴的 Segno 與 Coda 記號 ----------
{
  const abc = [
    'X:1', 'M:2/4', 'L:1/4', '%%score {1|2}', 'V:1', 'V:2 clef=bass', 'K:C',
    'V:1', 'C D | !segno!E F "^To Coda"| G2 "^D.S. al Coda"|| "^Coda"c2 |]',
    'V:2', 'C, D, | E, F, | G,2 || C,2 |]',
  ].join('\n');
  const r = MB.parseAbc(abc);
  const b = MB.toBraille(r.score);
  check('鋼琴：Segno 與手號之間空一方', /\.> \+ /.test(b.brf) && /_> \+ /.test(b.brf), b.brf);
  check('鋼琴：Coda 記號兩手都寫', (b.brf.match(/\+L/g) || []).length === 2, b.brf);
  check('鋼琴：D.S. 文字只寫在右手', (b.brf.match(/>D'S' AL CODA>/g) || []).length === 1, b.brf);
  const r2 = MB.parseBraille(b.brf);
  check('鋼琴反覆指示：點字來回一致', fullSummary(r2.score) === fullSummary(r.score) && !r2.warnings.length, firstDiff(fullSummary(r.score), fullSummary(r2.score)) + '\n' + b.brf);
}

// ---------- 5. 很長的小節會以音樂連字號換行 ----------
{
  const abc = 'X:1\nM:4/4\nL:1/16\nK:C\n' + 'C^DE^FG^AB^c d^cB^AG^FE^D |]';
  const r = MB.parseAbc(abc);
  const b = MB.toBraille(r.score, { width: 20 });
  check('長小節換行：每行不超過寬度', b.brf.split('\n').every((l) => l.length <= 20), b.brf);
  const r2 = MB.parseBraille(b.brf);
  check('長小節換行：來回一致', summary(r2.score) === summary(r.score), b.brf + '\n' + summary(r.score) + '\n' + summary(r2.score));
}

// ---------- 6. 內建範例 ----------
require('../js/samples.js');
require('../js/describe.js');
for (const s of MB.samples) {
  const r = MB.parseAbc(s.abc);
  check('範例「' + s.name + '」：ABC 無警告', r.warnings.length === 0, r.warnings.map((w) => '  ' + w.msg).join('\n'));
  const b = MB.toBraille(r.score);
  check('範例「' + s.name + '」：點字無警告', b.warnings.length === 0, b.warnings.map((w) => '  ' + w.msg).join('\n') + '\n' + b.brf);
  check('範例「' + s.name + '」：每行不超過 40 方', b.brf.split('\n').every((l) => l.length <= 40), b.brf);
  const r2 = MB.parseBraille(b.brf);
  check('範例「' + s.name + '」：點字來回一致', summary(r2.score) === summary(r.score) && r2.warnings.length === 0,
    b.brf + '\n' + summary(r.score) + '\n' + summary(r2.score) + '\n' + r2.warnings.map((w) => w.msg).join('\n'));
  const r3 = MB.parseAbc(MB.toAbc(r2.score).abc);
  check('範例「' + s.name + '」：ABC 來回一致', summary(r3.score) === summary(r.score));
  // 同步標示：每個事件都有 ABC 與點字位置
  const ids = new Set(b.map.map((m) => m.id));
  let missing = 0;
  MB.model.forEachEvent(r.score, (ev) => {
    if (!ids.has(ev.id) || !ev.src.abc) missing++;
  });
  check('範例「' + s.name + '」：同步標示對應完整', missing === 0, missing + ' 個事件沒有對應');
}
{
  const r = MB.parseAbc('X:1\nM:4/4\nL:1/4\nK:G\n!p!F3/2 [CEG]/ z2 |]');
  const d = [];
  MB.model.forEachEvent(r.score, (ev) => d.push(MB.describe.describeEvent(ev, { number: 1 })));
  check('語音描述', d[0] === '第1小節，弱，附點四分音符，升F4' && d[1] === '第1小節，八分音符，和弦 C4、E4、G4' && d[2] === '第1小節，二分休止符', d.join('\n'));
}

// ---------- 7. MusicXML ----------
/** 比 summary 更完整：加上記號、反覆、房號、小節線、調號拍號。 */
function fullSummary(score) {
  const s = [summary(score), score.keyboard ? 'KB' : 'SL', JSON.stringify(score.tempo)];
  score.parts.forEach((p) =>
    p.measures.forEach((m, mi) => {
      const head = [mi, m.startRepeat ? '|:' : '', m.endRepeat ? ':|' : '', m.volta || '', m.barline, m.key ? 'K' + m.key.fifths : '', m.meter ? 'M' + m.meter.num + '/' + m.meter.den + (m.meter.symbol || '') : '',
        m.segno ? 'segno' : '', m.codaStart ? 'coda' : '', m.toCoda ? 'toCoda' : '', m.fine ? 'fine' : '', m.jump ? m.jump.type + (m.jump.to || '') : '', m.splitCont ? 'cont' : ''];
      const evs = [];
      m.voices.forEach((v) =>
        v.forEach((e) =>
          evs.push([e.dynamic || '', (e.articulations || []).join('.'), e.slurStart || 0, e.slurEnd || 0, e.hairpinStart || '', e.hairpinEnd || '', e.tuplet ? (e.tuplet.start ? 'S' : '') + (e.tuplet.end ? 'E' : '') : '',
            (e.ornaments || []).join('.'), e.notes.map((n) => n.finger || '-').join('.'),
            (e.graces || []).map((g) => g.notes[0].step + g.notes[0].octave + '/' + g.value + (g.slash ? 's' : '')).join('.'),
            (e.pedalDown ? 'v' : '') + (e.pedalChange ? '*' : '') + (e.pedalUp ? '^' : '')].join(','))
        )
      );
      s.push(head.join(',') + ' ' + evs.join(';'));
    })
  );
  s.push(p0clef(score));
  return s.join('\n');
}
function p0clef(score) {
  return score.keyboard ? '' : score.parts[0].clef;
}
function firstDiff(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return 'line ' + i + ':\n  ' + x[i] + '\n  ' + y[i];
  return '';
}
{
  const sources = MB.samples.map((s) => ({ name: '範例「' + s.name + '」', score: MB.parseAbc(s.abc).score }));
  for (const ex of EX) sources.push({ name: ex.name, score: MB.parseBraille(ex.brl, ex.opts).score });
  sources.push({
    name: '記號綜合',
    score: MB.parseAbc('X:1\nT:記號\nC:測試\nM:3/4\nL:1/8\nQ:3/8=60\nK:Eb\n|: !mf!(c2 !<(!B A !<)!G2) |1 !accent!F2 !tenuto!E2 !fermata!D2 :|2 (3EFG [CEG]4 || [M:C][K:A] .a8 |]').score,
  });
  for (const src of sources) {
    const xml = MB.toMusicXML(src.score, { date: '2026-10-01' });
    let r;
    try {
      r = MB.parseMusicXML(xml);
    } catch (e) {
      check(src.name + '：MusicXML 可解析', false, e.stack);
      continue;
    }
    check(src.name + '：MusicXML 無警告', r.warnings.length === 0, r.warnings.map((w) => w.msg).join('\n'));
    const a = fullSummary(src.score);
    const b = fullSummary(r.score);
    check(src.name + '：MusicXML 來回一致', a === b, firstDiff(a, b));
  }
}

// 仿 MuseScore 匯出的鋼琴譜：弱起、第二聲部空白休止、和弦、連結線、力度、三連音、反覆與房號
const MUSESCORE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>測試曲</work-title></work>
  <identification><creator type="composer">某人</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes><divisions>4</divisions><key><fifths>1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>
      <direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type><staff>1</staff></direction>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><stem>down</stem><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><rest/><duration>4</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    </measure>
    <measure number="1">
      <barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>8</duration><tie type="start"/><voice>1</voice><type>half</type><staff>1</staff><notations><tied type="start"/><slur type="start" number="1"/></notations></note>
      <note><pitch><step>F</step><alter>1</alter><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><accidental>sharp</accidental><staff>1</staff></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff><notations><slur type="stop" number="1"/></notations></note>
      <backup><duration>12</duration></backup>
      <forward><duration>12</duration><voice>2</voice><staff>1</staff></forward>
      <backup><duration>12</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>5</voice><type>half</type><staff>2</staff></note>
      <note><chord/><pitch><step>D</step><octave>3</octave></pitch><duration>8</duration><voice>5</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>B</step><octave>2</octave></pitch><duration>4</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <barline location="left"><ending number="1" type="start"/></barline>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice><type>quarter</type><staff>1</staff><notations><tied type="stop"/></notations></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><staff>1</staff><notations><tuplet type="start" bracket="yes"/></notations></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><staff>1</staff><notations><tuplet type="stop"/></notations></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff><notations><articulations><staccato/></articulations></notations></note>
      <backup><duration>11</duration></backup>
      <note><rest measure="yes"/><duration>12</duration><voice>5</voice><staff>2</staff></note>
      <barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/></barline>
    </measure>
    <measure number="3">
      <barline location="left"><ending number="2" type="start"/></barline>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><type>half</type><dot/><staff>1</staff><notations><fermata type="upright"/></notations></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>12</duration><voice>5</voice><type>half</type><dot/><staff>2</staff><lyric><text>la</text></lyric></note>
      <barline location="right"><bar-style>light-heavy</bar-style><ending number="2" type="discontinue"/></barline>
    </measure>
  </part>
</score-partwise>`;
{
  const r = MB.parseMusicXML(MUSESCORE_XML);
  const abc = MB.toAbc(r.score).abc;
  check('MuseScore 格式：只有歌詞的警告', r.warnings.length === 1 && /歌詞/.test(r.warnings[0].msg), r.warnings.map((w) => w.msg).join('\n'));
  check('MuseScore 格式：曲名、作曲者、速度', r.score.title === '測試曲' && r.score.composer === '某人' && r.score.tempo && r.score.tempo.bpm === 90);
  const want = [
    'K:G',
    'V:RH',
    "!p!d2 |: (g4- ^f e) |[1 g2 (3d c B .A2 :|[2 !fermata!G6 |]",
    'V:LH',
    'z2 |: [G,,D,]4 B,,2 |[1 z6 :|[2 G,,6 |]',
  ];
  check('MuseScore 格式：轉成 ABC', want.every((l) => abc.includes(l)), abc);
  const b = MB.toBraille(r.score);
  const r2 = MB.parseBraille(b.brf);
  check('MuseScore 格式：轉點字再讀回一致', summary(r2.score) === summary(r.score), b.brf + '\n' + summary(r.score) + '\n' + summary(r2.score));
}

// MusicXML 的 <alter> 是實際音高：調號不影響它；連結線延續音不重寫臨時記號；隱藏的補位休止符
{
  const note = (step, oct, alter, extra) =>
    '<note' + (extra && extra.hidden ? ' print-object="no"' : '') + '>' + (step ? '<pitch><step>' + step + '</step>' + (alter != null ? '<alter>' + alter + '</alter>' : '') + '<octave>' + oct + '</octave></pitch>' : '<rest/>') +
    '<duration>' + ((extra && extra.dur) || 1) + '</duration>' + (extra && extra.tie ? '<tie type="' + extra.tie + '"/>' : '') + '<voice>1</voice><type>' + ((extra && extra.type) || 'quarter') + '</type>' +
    (extra && extra.tie ? '<notations><tied type="' + extra.tie + '"/></notations>' : '') + '</note>';
  const xml = '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1">' +
    '<measure number="1"><attributes><divisions>1</divisions><key><fifths>-2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' +
    note(null, 0, null, { hidden: true, dur: 2, type: 'half' }) + note('B', 4, null) + note('E', 4, -1, { tie: 'start' }) + '</measure>' +
    '<measure number="2">' + note('E', 4, -1, { tie: 'stop' }) + note('B', 4, -1) + note('C', 5, 1) + note(null, 0, null, { hidden: true }) + '</measure></part></score-partwise>';
  const r = MB.parseMusicXML(xml);
  const evs = [];
  MB.model.forEachEvent(r.score, (e) => evs.push(e));
  const notes = evs.filter((e) => e.kind === 'note').map((e) => e.notes[0]);
  check('MusicXML <alter>：降 B 調中沒有 alter 的 B 是還原 B，並補上還原記號', notes[0].alter === 0 && notes[0].accidental === 'natural', JSON.stringify(notes[0]));
  check('MusicXML <alter>：連結線延續的降 E 不重寫臨時記號', notes[2].alter === -1 && !notes[2].accidental, JSON.stringify(notes[2]));
  check('MusicXML <alter>：調號已有的降 B 不加臨時記號', notes[3].alter === -1 && !notes[3].accidental, JSON.stringify(notes[3]));
  check('MusicXML <alter>：升 C 補上升記號', notes[4].alter === 1 && notes[4].accidental === 'sharp');
  check('MusicXML 隱藏的補位休止符：第一小節開頭與結尾都移除（弱起）', evs.length === 5 && evs.every((e) => e.kind === 'note'), evs.map((e) => e.kind).join(','));
  check('MusicXML 隱藏的補位休止符：第一小節成為弱起（編號 0）', MB.model.measureNumbers(r.score)[0] === 0);
}

// 第 3 步（真實樂譜抽樣）發現的問題
{
  const M = MB.model;
  check('調號名稱：5 個升記號的小調是 G#m', M.keyName({ fifths: 5, mode: 'minor' }) === 'G#m' && M.keyName({ fifths: -6, mode: 'minor' }) === 'Ebm' && M.keyName({ fifths: 7, mode: 'major' }) === 'C#');

  // 倚音時值與預設讀法不同時加時值記號
  const g = MB.parseAbc('X:1\nM:2/4\nL:1/8\nK:C\n{/c}B2 {d/c/}B2 | {e/4d/4}c4 |]');
  const gb = MB.toBraille(g.score);
  const g2 = MB.parseBraille(gb.brf);
  const gv = (sc) => {
    const out = [];
    M.forEachEvent(sc, (e) => (e.graces || []).forEach((x) => out.push(x.value)));
    return out.join(',');
  };
  check('倚音時值：8、16、32 分都能正確讀回', gv(g2.score) === gv(g.score) && gv(g.score) === '8,16,16,32,32', gv(g.score) + ' / ' + gv(g2.score) + '\n' + gb.brf);

  // 混合時值的三連音（附點八分＋三個 16 分）
  const t = MB.parseAbc('X:1\nM:2/4\nL:1/16\nK:C\n(3:2:4c3BAG c4 | c8 |]');
  const tb = MB.toBraille(t.score);
  check('混合時值的三連音：點字讀回時正確判斷包含 4 個音', summary(MB.parseBraille(tb.brf).score) === summary(t.score), tb.brf + '\n' + summary(t.score) + '\n' + summary(MB.parseBraille(tb.brf).score));

  // 反覆記號前因弱起而不完整的小節不報錯
  const pick = MB.parseAbc('X:1\nM:4/4\nL:1/8\nK:D\n|:FE|D2FE DEFG|ABdc BAFE|1 D6:|2 D4 d2 de||\n|:fgag fedA|Bcdc BAFD|G2BG FGAF|E6:|');
  check('段落交界的不完整小節不報拍數錯誤', MB.toBraille(pick.score).warnings.length === 0, MB.toBraille(pick.score).warnings.map((w) => w.msg).join('\n'));

  // ~（roll）與 U: 自訂記號
  const u = MB.parseAbc('X:1\nU:w=!staccato!\nM:2/4\nL:1/8\nK:G\n~g2 wB wd |]');
  const ev = [];
  M.forEachEvent(u.score, (e) => ev.push(e));
  check('ABC 的 ~（roll）視為迴音、U: 自訂記號', u.warnings.length === 0 && (ev[0].ornaments || []).includes('turn') && (ev[1].articulations || []).includes('staccato'), JSON.stringify(u.warnings));

  // 多聲部（part）的 MusicXML：可選擇要轉換的聲部
  const two = '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Voice</part-name></score-part><score-part id="P2"><part-name>Piano</part-name></score-part></part-list>' +
    '<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note></measure></part>' +
    '<part id="P2"><measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time><staves>2</staves></attributes><note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note><backup><duration>2</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>5</voice><type>half</type><staff>2</staff></note></measure></part></score-partwise>';
  const p0 = MB.parseMusicXML(two);
  const pp = MB.parseMusicXML(two, { part: 'piano' });
  check('多聲部 MusicXML：預設第一個聲部，可選鋼琴聲部', !p0.score.keyboard && pp.score.keyboard && pp.partIndex === 1 && p0.parts.length === 2 && p0.parts[1].name === 'Piano');
}

// .mxl（壓縮 MusicXML）
async function mxlTests() {
  const zlib = require('zlib');
  const enc = new TextEncoder();
  function zip(entries) {
    const locals = [];
    const centrals = [];
    let off = 0;
    for (const { name, data, deflate } of entries) {
      const nb = enc.encode(name);
      const body = deflate ? zlib.deflateRawSync(data) : data;
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(deflate ? 8 : 0, 8);
      lh.writeUInt32LE(body.length, 18);
      lh.writeUInt32LE(data.length, 22);
      lh.writeUInt16LE(nb.length, 26);
      locals.push(lh, Buffer.from(nb), body);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE(deflate ? 8 : 0, 10);
      ch.writeUInt32LE(body.length, 20);
      ch.writeUInt32LE(data.length, 24);
      ch.writeUInt16LE(nb.length, 28);
      ch.writeUInt32LE(off, 42);
      centrals.push(ch, Buffer.from(nb));
      off += 30 + nb.length + body.length;
    }
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(off, 16);
    return Buffer.concat(locals.concat([cd, end]));
  }
  const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score/song.musicxml"/></rootfiles></container>';
  const z = zip([
    { name: 'mimetype', data: Buffer.from('application/vnd.recordare.musicxml') },
    { name: 'META-INF/container.xml', data: Buffer.from(container), deflate: true },
    { name: 'score/song.musicxml', data: Buffer.from(MUSESCORE_XML), deflate: true },
  ]);
  const ab = z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength);
  const text = await MB.readMusicXMLBytes(ab);
  check('.mxl：解壓並找到樂譜', text === MUSESCORE_XML);
  const plain = await MB.readMusicXMLBytes(enc.encode(MUSESCORE_XML).buffer);
  check('未壓縮 MusicXML：直接讀取', plain === MUSESCORE_XML);
}

mxlTests().then(() => {
  console.log('\n通過 ' + pass + '，失敗 ' + fail);
  process.exit(fail ? 1 : 0);
});
