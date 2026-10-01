/* 內建範例（皆為公共領域旋律或自編練習）。 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  MB.samples = [
    {
      name: '小星星（單聲部）',
      abc: `X:1
T:小星星
M:4/4
L:1/4
Q:1/4=96
K:C
C C G G | A A G2 | F F E E | D D C2 |
G G F F | E E D2 | G G F F | E E D2 |
C C G G | A A G2 | F F E E | D D C2 |]
`,
    },
    {
      name: '歡樂頌（附點、連結線）',
      abc: `X:1
T:歡樂頌
C:貝多芬
M:4/4
L:1/4
Q:1/4=108
K:D
F F G A | A G F E | D D E F | F3/2 E/ E2 |
F F G A | A G F E | D D E F | E3/2 D/ D2 |]
`,
    },
    {
      name: '反覆與房號、三連音',
      abc: `X:1
T:反覆練習
M:3/4
L:1/8
K:G
|: G2 B2 d2 | (3cBA G2 B2 |1 A2 F2 D2 | G6 :|2 A2 d2 F2 | G6 |]
`,
    },
    {
      name: '十六分音符、力度、圓滑線',
      abc: `X:1
T:音階練習
M:2/4
L:1/16
K:C
!p!(CDEF GABc) | !f!c4 z4 | (cBAG FEDC) | C8 |]
`,
    },
    {
      name: '小步舞曲（鋼琴雙手，改編）',
      abc: `X:1
T:小步舞曲 G 大調（改編）
C:Petzold
M:3/4
L:1/8
Q:1/4=100
%%score {RH | LH}
V:RH clef=treble name="R.H."
V:LH clef=bass name="L.H."
K:G
V:RH
d2 G A B c | d2 G2 G2 | e2 c d e f | g2 G2 G2 |
V:LH
[G,B,D]4 A,2 | B,6 | C6 | B,6 |
V:RH
c2 d c B A | B2 c B A G | F2 G A B G | A6 |]
V:LH
A,6 | G,6 | D,4 B,,2 | D,6 |]
`,
    },
    {
      name: '指法、裝飾音、踏板、D.C.（鋼琴雙手）',
      abc: `X:1
T:記號示範
M:3/4
L:1/4
Q:1/4=96
%%score {RH | LH}
V:RH clef=treble name="R.H."
V:LH clef=bass name="L.H."
K:F
V:RH
!1!F !2!G !3!A | {/c}!4!B !trill!A !2!G | !uppermordent!!1!F2 !fine!z |
!5!c !4!B !3!A | !turn!!2!G2 !D.C.alfine!z |]
V:LH
!ped!F,,3 | !ped-up!!ped!C,3 | F,,2 !ped-up!z |
!ped!A,,3 | !ped-up!!ped!C,2 !ped-up!z |]
`,
    },
    {
      name: '和弦練習（鋼琴雙手）',
      abc: `X:1
T:和弦練習
M:4/4
L:1/4
%%score {RH | LH}
V:RH clef=treble
V:LH clef=bass
K:C
V:RH
[CEG]2 [CFA]2 | [B,DG]2 [CEG]2 | [EGc]4 |]
V:LH
C,2 F,2 | G,2 C,2 | [C,,C,]4 |]
`,
    },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
