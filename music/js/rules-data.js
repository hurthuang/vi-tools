/*
 * 規則對照頁（rules.html）的內容：每一節的說明、符號表與例子。
 *
 * 說明文字為自行撰寫，例子也是自編的，只標註 BANA《Music Braille Code, 2015》的段落編號，
 * 不轉載原文與原書例子。每個例子的 brf 是預期的點字輸出，tests/run.js 會逐一檢查
 * 「ABC → 點字」與「點字 → 再轉回點字」都和這裡一致，說明頁才不會和程式不同步。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});

  MB.rules = [
    {
      id: 'values',
      title: '音符與時值',
      par: '2.1、2.3、2.4',
      body: `
        <p>一個點字音符同時表示<strong>音名</strong>和<strong>時值</strong>：上半部的點 1、2、4、5 決定音名，下半部的點 3、6 決定時值。</p>
        <ul>
          <li>只有音名的點（例如 C 是點 1-4-5 ⠙）是<strong>八分音符</strong>。</li>
          <li>加點 6 是<strong>四分音符</strong>，加點 3 是<strong>二分音符</strong>，加點 3、6 是<strong>全音符</strong>。</li>
          <li>每個符號同時代表兩種時值：全音符與十六分、二分與三十二分、四分與六十四分、八分與一百二十八分。讀者通常可以從小節的拍數判斷是哪一種；容易混淆時，會在前面加「大時值」⠘⠣⠂ 或「小時值」⠠⠣⠂ 記號（2.4）。</li>
          <li><strong>附點</strong>：在音符後面加點 3（⠄），兩個附點就加兩個。音符和附點之間不能夾其他記號（2.3）。</li>
        </ul>`,
      abc: `
        <ul>
          <li>音名用字母 <code>C D E F G A B</code>；<code>L:1/4</code> 表示一個字母預設是四分音符。</li>
          <li>時值寫在字母後面：<code>C2</code> 是兩倍（二分音符）、<code>C4</code> 是四倍（全音符）、<code>C/</code> 是一半（八分音符）、<code>C/4</code> 是四分之一（十六分音符）。</li>
          <li>附點是乘上 1.5 倍：<code>G3/2</code> 是附點四分音符（<code>L:1/4</code> 時）。</li>
        </ul>`,
      tables: ['notes'],
      examples: [
        {
          title: '全音符、二分音符、四分音符',
          abc: 'X:1\nM:4/4\nL:1/4\nK:C\nC4 | D2 E2 | F G A B | c4 |]',
          brf: '                  #D4\n#A "Y OP ]\\[W Y<K',
          note: '第一行置中的 ⠼⠙⠲ 是拍號 4/4。第二行開頭的 ⠼⠁ 是段落編號（單行格式），⠐ 是第 4 音層的音層記號，最後的 ⠣⠅ 是終止線。',
        },
        {
          title: '附點音符與八分音符',
          abc: 'X:1\nM:3/4\nL:1/4\nK:C\nG3/2 A/ B | c2 B | A3 |]',
          brf: "                  #C4\n#A \"\\'IW NW S'<K",
          note: '⠳⠄ 是附點四分音符 G，緊接的 ⠊ 是八分音符 A；最後一小節的 ⠎⠄ 是附點二分音符。',
        },
        {
          title: '十六分音符和全音符用同一個符號',
          abc: 'X:1\nM:2/4\nL:1/4\nK:C\nC/ D/4E/4 F/ G/ | A2 |]',
          brf: '                  #B4\n#A "DZ&GH S<K',
          note: '⠵（D）和 ⠯（E）的形狀就是全音符，但 2/4 拍的小節放不下全音符，所以讀作十六分音符。',
        },
      ],
    },
    {
      id: 'octaves',
      title: '音層記號',
      par: '3.1、3.2、29.3',
      body: `
        <p>點字音符本身不表示高低，要靠<strong>音層記號</strong>寫在音符前面。從鋼琴最低的 C 開始算第 1 音層，每個音層從 C 到下一個 B；<strong>中央 C 在第 4 音層</strong>（3.1）。</p>
        <p>音層記號不是每個音都寫，只在需要時寫（3.2）：</p>
        <ul>
          <li><strong>一定要寫</strong>：每一行點字的第一個音，以及數字記號、文字記號之後的第一個音。</li>
          <li>之後看和前一個音的<strong>旋律音程</strong>：
            <ul>
              <li>二度、三度：<strong>不寫</strong>。</li>
              <li>四度、五度：<strong>換了音層才寫</strong>，在同一個音層裡就不寫。</li>
              <li>六度以上：<strong>一定寫</strong>。</li>
            </ul>
          </li>
          <li>鋼琴譜（bar-over-bar 格式）中，<strong>每一小節的第一個音</strong>都要寫音層記號（29.3）。</li>
        </ul>`,
      abc: `
        <ul>
          <li>ABC 用大小寫和符號表示音層：<code>C</code> 是中央 C（第 4 音層），<code>c</code> 高八度（第 5 音層）。</li>
          <li>再高加撇號 <code>c'</code>（第 6 音層），再低加逗號 <code>C,</code>（第 3 音層）。</li>
        </ul>`,
      tables: ['octaves'],
      examples: [
        {
          title: '每行第一個音要寫音層記號，二度不寫',
          abc: 'X:1\nM:4/4\nL:1/4\nK:C\nG A B c | d4 |]',
          brf: '                  #D4\n#A "\\[W? Z<K',
          note: '只有第一個音 G 前面有 ⠐（第 4 音層）。B 到 c 雖然跨過了音層的分界，但只是二度，所以 c 不寫音層記號。',
        },
        {
          title: '三度以內都不寫',
          abc: 'X:1\nM:4/4\nL:1/4\nK:C\nC D E D | C E G E |]',
          brf: '                  #D4\n#A "?:$: ?$\\$<K',
          note: '全部是二度、三度，整段只有開頭一個音層記號。',
        },
        {
          title: '四度、五度看有沒有換音層',
          abc: 'X:1\nM:4/4\nL:1/4\nK:C\nE A B G | A d G c |]',
          brf: '                  #D4\n#A "$[W\\ [.:"\\.?<K',
          note: 'E 到 A 是四度，兩個音都在第 4 音層，不寫。A 到 d 也是四度，但 d 在第 5 音層，所以寫 ⠨；之後 d 到 G、G 到 c 都是換了音層的四度，都要寫。',
        },
        {
          title: '六度以上一定要寫',
          abc: 'X:1\nM:4/4\nL:1/4\nK:C\nC A G A | c2 C2 |]',
          brf: '                  #D4\n#A "?"[\\[ N"N<K',
          note: 'C 到 A 是六度，所以 A 前面寫 ⠐。A 到 c 是三度不寫；c 往下到 C 是八度，C 前面要寫 ⠐。',
        },
      ],
    },
    {
      id: 'chords',
      title: '音程與和弦',
      par: '9.1、9.1.1、9.2、29.2',
      body: `
        <p>和弦只寫出其中一個音（<strong>寫出音</strong>），其他音用<strong>音程記號</strong>表示它和寫出音的距離（9.1）。</p>
        <ul>
          <li><strong>方向</strong>：高音譜（鋼琴右手）寫最高音，其他音<strong>往下</strong>算；低音譜（鋼琴左手）寫最低音，其他音<strong>往上</strong>算（9.2、29.2）。</li>
          <li>音程一律從<strong>寫出音</strong>算起，不是從前一個音程算起。</li>
          <li>和弦中的音有臨時記號時，記號寫在該音程記號（或它的音層記號）前面。</li>
          <li>寫出音有附點時，音程記號<strong>不加</strong>附點（9.1）。</li>
          <li>音程記號前要加音層記號的情況（9.1.1）：和寫出音同度、第一個（或唯一的）音程和寫出音相距超過八度、相鄰兩個音程相距八度以上、和前面的音程同音。</li>
        </ul>`,
      abc: `
        <ul>
          <li>和弦用方括號：<code>[CEG]</code>；時值寫在括號後面：<code>[CEG]2</code> 是二分音符的和弦。</li>
          <li>鋼琴雙手用兩個聲部：<code>%%score {RH | LH}</code>，再用 <code>V:RH</code>、<code>V:LH</code> 分別寫右手、左手。</li>
        </ul>`,
      tables: ['intervals'],
      examples: [
        {
          title: '單行（高音譜）：寫最高音，往下算',
          abc: 'X:1\nM:4/4\nL:1/4\nK:C\n[CEG]2 [DFA]2 | [EGc]4 |]',
          brf: '                  #D4\n#A "R+9S+9 Y#0<K',
          note: '[CEG] 寫出最高的 G（⠗ 二分音符），⠬ 是往下三度的 E，⠔ 是往下五度的 C。[EGc] 寫出 c（⠽ 全音符），⠼ 是四度 G，⠴ 是六度 E。',
        },
        {
          title: '附點和弦：音程不加附點',
          abc: 'X:1\nM:3/4\nL:1/4\nK:C\n[CEG]3 | [CFA]2 [B,DG] | [CEG]3 |]',
          brf: "                  #C4\n#A \"R'+9 S+0\\#0 R'+9<K",
          note: '⠗⠄ 是附點二分音符的 G，後面的音程 ⠬⠔ 不再加附點。',
        },
        {
          title: '相距超過八度的音程要加音層記號',
          abc: 'X:1\nM:4/4\nL:1/4\nK:C\n[Cc]2 [Ee]2 | [Gc]2 [C,c]2 |]',
          brf: '                  #D4\n#A .N-P- N#N_-<K',
          note: '⠤ 是八度音程。最後的 [C,c] 中，C, 在 c 下方兩個八度，所以八度音程 ⠤ 前面加上第 3 音層的音層記號 ⠸。',
        },
        {
          title: '鋼琴雙手：右手往下、左手往上',
          abc: 'X:1\nM:4/4\nL:1/4\nK:C\n%%score {RH | LH}\nV:RH clef=treble\nV:LH clef=bass\nV:RH\n[EGc]2 [DFB]2 | [EGc]4 |]\nV:LH\n[C,G,]2 [G,,D,]2 | [C,G,]4 |]',
          brf: '                  #D4\nA .>.N#0T#0 .Y#0<K\n  _>_N9^R9  _Y9<K',
          note: '⠨⠜ 是右手記號、⠸⠜ 是左手記號。右手寫最高音 c，往下算；左手寫最低音 C,，往上算（⠔ 五度）。鋼琴譜每小節的第一個音都寫音層記號，所以第 2 小節右手的 c 雖然和前一個 B 只差二度，仍然寫 ⠨。',
        },
      ],
    },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
