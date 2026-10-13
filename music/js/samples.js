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
      name: '6/8 拍、和弦名稱（划船歌）',
      abc: `X:1
T:划船歌
M:6/8
L:1/8
Q:3/8=60
K:C
"C"C3 C3 | C2 D E3 | E2 D E2 F | G6 |
c c c G G G | E E E C C C | "G7"G2 F E2 D | "C"C6 |]
`,
    },
    {
      name: '小蜜蜂（歌詞）',
      abc: `X:1
T:小蜜蜂
C:德國民謠
M:4/4
L:1/4
Q:1/4=104
K:C
G E E2 | F D D2 | C D E F | G G G2 |
w: 嗡 嗡 嗡 嗡 嗡 嗡 大 家 一 起 勤 做 工
G E E2 | F D D2 | C E G G | E4 |
w: 來 匆 匆 去 匆 匆 做 工 興 味 濃
D D D D | D E F2 | E E E E | E F G2 |
w: 天 暖 花 好 不 做 工 將 來 哪 裡 好 過 冬
G E E2 | F D D2 | C E G G | C4 |]
w: 嗡 嗡 嗡 嗡 嗡 嗡 別 學 懶 惰 蟲
`,
    },
    {
      name: '弱起拍（生日快樂）',
      abc: `X:1
T:生日快樂
M:3/4
L:1/8
Q:1/4=100
K:C
G3/2 G/ | A2 G2 c2 | B4 G3/2 G/ | A2 G2 d2 | c4 G3/2 G/ |
w: 祝 你 生 日 快 樂 祝 你 生 日 快 樂 祝 你
g2 e2 c2 | B2 A2 f3/2 f/ | e2 c2 d2 | c4 |]
w: 生 日 快 樂 _ 祝 你 生 日 快 樂
`,
    },
    {
      name: '小調、臨時記號（綠袖子）',
      abc: `X:1
T:綠袖子
C:英國民謠
M:6/8
L:1/8
Q:3/8=56
K:Am
A | c2 d e3/2 f/ e | d2 B G3/2 A/ B | c2 A A3/2 ^G/ A | B2 ^G E2 A |
c2 d e3/2 f/ e | d2 B =G3/2 A/ B | c3/2 B/ A ^G3/2 ^F/ ^G | A3 A2 |]
`,
    },
    {
      name: '奏法記號（斷音、重音、持續音、延長、換氣）',
      abc: `X:1
T:奏法記號練習
M:4/4
L:1/4
Q:1/4=92
K:F
.F .A .c .A | !accent!F !accent!A !breath!c2 | !tenuto!B !tenuto!A !tenuto!G !tenuto!E | !fermata!F4 |]
`,
    },
    {
      name: '漸強、漸弱與力度變化',
      abc: `X:1
T:力度練習
M:3/4
L:1/4
Q:1/4=100
K:G
!p!G A B | !crescendo(!c d e | d c !crescendo)!B | !f!A3 |
!mf!B A G | !diminuendo(!F E D | E F !diminuendo)!A | !p!G3 |]
`,
    },
    {
      name: 'D.S. al Coda（反覆記號與結尾段）',
      abc: `X:1
T:D.S. al Coda 練習
M:4/4
L:1/4
Q:1/4=104
K:C
C D E F | !segno!G2 E2 | F D E "^To Coda"C | D E C2 !D.S.alcoda!||
!coda!G A B d | c4 |]
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
    {
      name: '聖誕鈴聲（同一譜表兩個聲部）',
      abc: `X:1
T:聖誕鈴聲（二部）
C:Pierpont
M:4/4
L:1/4
Q:1/4=120
K:C
E E E2 & C C C2 | E E E2 & C C C2 | E G C3/2 D/ & C E A,3/2 B,/ | E4 & C4 |
F F F3/2 F/ & D D D3/2 D/ | F E E E/E/ & D C C C/C/ | E D D E & C B, B, C | D2 G2 & B,2 D2 |]
`,
    },
    {
      name: '四部合唱（自編練習）',
      abc: `X:1
T:四部合唱練習
M:4/4
L:1/4
Q:1/4=80
%%score S A T B
V:S clef=treble name="Soprano"
V:A clef=treble name="Alto"
V:T clef=bass name="Tenor"
V:B clef=bass name="Bass"
K:C
V:S
E F G E | F D E2 | G A G F | E D C2 |]
V:A
C C D C | C B, C2 | E F E D | C B, C2 |]
V:T
G, A, B, G, | A, G, G,2 | C C C A, | G, G, E,2 |]
V:B
C, F, G, C, | F, G, C,2 | C, F, C, D, | G, G,, C,2 |]
`,
    },
    {
      name: '歡樂頌（長笛與大提琴二重奏）',
      abc: `X:1
T:歡樂頌（二重奏）
C:貝多芬
M:4/4
L:1/4
Q:1/4=108
%%score Fl Vc
V:Fl clef=treble name="Flute"
V:Vc clef=bass name="Cello"
K:D
V:Fl
F F G A | A G F E | D D E F | F3/2 E/ E2 |
V:Vc
D,4 | D,2 A,,2 | D,2 B,,2 | A,,4 |
V:Fl
F F G A | A G F E | D D E F | E3/2 D/ D2 |]
V:Vc
D,4 | D,2 A,,2 | D,2 B,,2 | A,,2 D,2 |]
`,
    },
    {
      name: '兩隻老虎（三部輪唱）',
      abc: `X:1
T:兩隻老虎（輪唱）
C:法國民謠
M:4/4
L:1/4
Q:1/4=112
%%score V1 V2 V3
V:V1 clef=treble name="第一部"
V:V2 clef=treble name="第二部"
V:V3 clef=treble name="第三部"
K:C
V:V1
C D E C | C D E C | E F G2 | E F G2 |
w: 兩 隻 老 虎 兩 隻 老 虎 跑 得 快 跑 得 快
G/A/G/F/ E C | G/A/G/F/ E C | C G, C2 | C G, C2 |
w: 一 隻 沒 有 耳 朵 一 隻 沒 有 尾 巴 真 奇 怪 真 奇 怪
z4 | z4 | z4 | z4 |]
V:V2
z4 | z4 | C D E C | C D E C |
w: 兩 隻 老 虎 兩 隻 老 虎
E F G2 | E F G2 | G/A/G/F/ E C | G/A/G/F/ E C |
w: 跑 得 快 跑 得 快 一 隻 沒 有 耳 朵 一 隻 沒 有 尾 巴
C G, C2 | C G, C2 | z4 | z4 |]
w: 真 奇 怪 真 奇 怪
V:V3
z4 | z4 | z4 | z4 |
C D E C | C D E C | E F G2 | E F G2 |
w: 兩 隻 老 虎 兩 隻 老 虎 跑 得 快 跑 得 快
G/A/G/F/ E C | G/A/G/F/ E C | C G, C2 | C G, C2 |]
w: 一 隻 沒 有 耳 朵 一 隻 沒 有 尾 巴 真 奇 怪 真 奇 怪
`,
    },
    {
      name: '小星星（人聲與鋼琴伴奏）',
      abc: `X:1
T:小星星（人聲與鋼琴）
M:4/4
L:1/4
Q:1/4=96
%%score Voice {RH LH}
V:Voice clef=treble name="Voice"
V:RH clef=treble name="Piano"
V:LH clef=bass
K:C
V:Voice
z4 | z4 | C C G G | A A G2 | F F E E | D D C2 |
w: 一 閃 一 閃 亮 晶 晶 滿 天 都 是 小 星 星
V:RH
[EGc]2 [FAc]2 | [DGB]2 [EGc]2 | [CEG]4 | [CFA]2 [CEG]2 | [CFA]2 [CEG]2 | [B,DG]2 [CEG]2 |
V:LH
C,2 F,2 | G,2 C,2 | C,4 | F,2 C,2 | F,2 C,2 | G,2 C,2 |
V:Voice
G G F F | E E D2 | G G F F | E E D2 |
w: 掛 在 天 上 放 光 明 好 像 許 多 小 眼 睛
V:RH
[CEG]2 [CFA]2 | [CEG]2 [B,DG]2 | [CEG]2 [CFA]2 | [CEG]2 [B,DG]2 |
V:LH
C,2 F,2 | C,2 G,2 | C,2 F,2 | C,2 G,2 |
V:Voice
C C G G | A A G2 | F F E E | D D C2 |]
w: 一 閃 一 閃 亮 晶 晶 滿 天 都 是 小 星 星
V:RH
[CEG]4 | [CFA]2 [CEG]2 | [CFA]2 [CEG]2 | [B,DG]2 [CEG]2 |]
V:LH
C,4 | F,2 C,2 | F,2 C,2 | G,2 C,2 |]
`,
    },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
