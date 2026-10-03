/*
 * 點字樂譜 → 內部模型。
 * 接受 Unicode 點字（⠁⠃…）或 BRF（ASCII 點字）。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const M = MB.model;
  const B = MB.brf;
  const D = MB.durations;
  const S = MB.brailleSigns;

  const NOTE_INFO = {};
  for (const step in S.NOTE) S.NOTE[step].forEach((ch, cls) => (NOTE_INFO[ch] = { step, cls }));
  const REST_INFO = { M: 0, U: 1, V: 2, X: 3 };
  const INTERVAL_INFO = { '/': 2, '+': 3, '#': 4, '9': 5, '0': 6, '3': 7, '-': 8 };
  const OCT_INFO = { '@': 1, '^': 2, _: 3, '"': 4, '.': 5, ';': 6, ',': 7 };
  const FINGER_IN = { A: '1', B: '2', L: '3', 1: '4', K: '5' };
  // 不規則連音常見的「佔幾個」比例（依常見程度排序）
  const TUPLET_OF = { 2: [3], 3: [2, 4], 4: [3, 6], 5: [4, 6, 3], 6: [4, 2, 3], 7: [4, 8, 6], 8: [6, 3], 9: [8, 6], 10: [8], 11: [8], 12: [8], 13: [8], 14: [8], 15: [8, 16], 16: [12] };
  const DYNAMICS = ['PPPP', 'PPP', 'PP', 'P', 'MP', 'MF', 'F', 'FF', 'FFF', 'FFFF', 'SFZ', 'SF', 'FP', 'FZ', 'RFZ'];

  const isNote = (c) => c !== undefined && c in NOTE_INFO;
  const isInterval = (c) => c !== undefined && c in INTERVAL_INFO;
  const isNoteOrInterval = (c) => isNote(c) || isInterval(c);

  // ---------- 標記（簽名）解析 ----------
  // 調號（可先有取消用的還原記號，如 ⠡⠣⠣⠣）＋拍號
  const SIG_RE = /^((?:\*{1,3}|#[A-J]+\*)?(?:%{1,3}|<{1,3}|#[A-J]+[%<])?)(#[A-J]+[0-9]+|\.C|_C)?$/;
  const TEMPO_RE = /^([YNZ?DOE:&P$F=Q\]G(R\\H!S\[I)TWJ])('*)7#([A-J]+)$/;

  function parseSig(tok) {
    if (!tok) return null;
    const m = SIG_RE.exec(tok);
    if (!m || (!m[1] && !m[2])) return null;
    const out = {};
    if (m[1]) {
      // 去掉前面取消用的還原記號，剩下的就是新調號；只有還原記號表示回到 C 大調
      const k = m[1].replace(/^(\*{1,3}|#[A-J]+\*)(?=.)/, '');
      let n;
      let ch;
      if (k[0] === '#') {
        n = B.parseUpperNumber(k.slice(1, -1));
        ch = k[k.length - 1];
      } else {
        n = k.length;
        ch = k[0];
      }
      out.key = { fifths: ch === '%' ? n : ch === '<' ? -n : 0, mode: 'major' };
    }
    if (m[2]) {
      const t = m[2];
      if (t === '.C') out.meter = { num: 4, den: 4, symbol: 'C' };
      else if (t === '_C') out.meter = { num: 2, den: 2, symbol: 'C|' };
      else {
        const mm = /^#([A-J]+)([0-9]+)$/.exec(t);
        out.meter = { num: B.parseUpperNumber(mm[1]), den: B.parseLowerNumber(mm[2]), symbol: null };
      }
    }
    return out;
  }

  function parseTempo(tok) {
    const m = TEMPO_RE.exec(tok);
    if (!m) return null;
    const cls = NOTE_INFO[m[1]].cls;
    return { value: D.LARGE[cls], dots: m[2].length, bpm: B.parseUpperNumber(m[3]) };
  }

  // ---------- 小節內的符號 ----------
  /**
   * 將一個小節的點字（BRF）拆成原始事件。
   * pos: 每個字元在原始輸入中的位置（用於同步高亮）。
   */
  function tokenizeMeasure(s, pos, warn) {
    const res = { voices: [[]], startRepeat: false, endRepeat: false, volta: null, barline: 'single', repeatPrev: false };
    let voice = res.voices[0];
    let pre = newPre();
    let last = null; // 目前的事件
    let lastKind = null; // 'note' | 'rest' | 'dot' | 'interval' | 'finger' | 'grace' | null
    let fingerTarget = null; // 指法要套用的音（主音或最後一個音程）
    let fingerSet = 'main'; // 目前在第一組（main）或替代組（alt）
    let fingerChange = false; // 剛讀到換指記號 ⠉
    let graces = []; // 等待附加到下一個音的倚音
    let graceRun = false; // ⠢⠢：連續四個以上倚音的加倍記號，直到下一個單獨的 ⠢（最後一個倚音）為止（Par. 16.2）
    let i = 0;
    const n = s.length;

    function newPre() {
      return { acc: null, oct: null, tuplet: null, hint: null, dynamic: null, artic: [], open: 0, hairpinStart: null, start: -1, grace: null, ornaments: [], pedalDown: false, pedalChange: false };
    }
    function mark(k) {
      if (pre.start < 0) pre.start = k;
    }
    function target() {
      // 連結線等要套用的音：和弦中最後一個音程，否則主音
      if (!last || last.kind !== 'note') return null;
      return last.intervals.length ? last.intervals[last.intervals.length - 1] : last;
    }

    while (i < n) {
      const c = s[i];
      const c1 = s[i + 1];
      const c2 = s[i + 2];
      const at = i;
      // ---- 踏板（Par. 29.10） ----
      if (c === '<' && c1 === 'C') { mark(at); pre.pedalDown = true; i += 2; lastKind = null; continue; }
      if (c === '*' && c1 === '<' && c2 === 'C') { mark(at); pre.pedalChange = true; i += 3; lastKind = null; continue; }
      if (c === '*' && c1 === 'C') { if (last) last.pedalUp = true; i += 2; continue; }
      if ((c === ',' || c === '"') && c1 === '<' && c2 === 'C') { mark(at); pre.pedalDown = true; i += 3; lastKind = null; continue; }
      if (c === '"' && c1 === '*' && c2 === 'C') { if (last) last.pedalUp = true; i += 3; continue; }
      // ---- 倚音（Par. 16.2）：⠐⠢ 長倚音、⠢ 短倚音 ----
      if (c === '"' && c1 === '5') { mark(at); pre.grace = 'long'; i += 2; lastKind = null; continue; }
      if (c === '5' && c1 === '5') { mark(at); pre.grace = 'short'; graceRun = true; i += 2; lastKind = null; continue; }
      if (c === '5') { mark(at); pre.grace = 'short'; graceRun = false; i++; lastKind = null; continue; }
      // ---- 裝飾音（Par. 16.3–16.5） ----
      const orn = (name, len) => {
        mark(at);
        if (pre.acc && pre.oct == null) pre.acc = null; // 裝飾音前的臨時記號屬於輔助音，不影響主音
        pre.ornaments.push(name);
        i += len;
        lastKind = null;
      };
      if (c === '6') { orn('trill', 1); continue; }
      if ((c === '"' || c === ';') && c1 === '6') { if (c2 === 'L') orn('mordent', 3); else orn('uppermordent', 2); continue; }
      if (c === ',' && c1 === '4') { if (c2 === 'L') orn('invertedturn', 3); else orn('turn', 2); continue; }
      if (c === '4') { if (c1 === 'L') orn('invertedturn', 2); else orn('turn', 1); continue; }
      // ---- 指法（Par. 15）：緊接在音符、附點或音程之後；⠉ 表示換指；
      //      兩個指法並列為替代指法（Par. 15.4），點 6／點 3 為省略的佔位 ----
      const afterNote = fingerTarget && (lastKind === 'note' || lastKind === 'dot' || lastKind === 'interval');
      if (c === ',' && afterNote && FINGER_IN[c1]) {
        fingerTarget.finger = '';
        fingerSet = 'alt';
        fingerTarget.fingerAlt = '';
        lastKind = 'finger';
        i++;
        continue;
      }
      if (FINGER_IN[c] && fingerTarget && (afterNote || lastKind === 'finger')) {
        if (afterNote) fingerSet = 'main';
        else if (!fingerChange) {
          // 並列的第二組：替代指法
          fingerSet = 'alt';
          if (fingerTarget.fingerAlt === undefined) fingerTarget.fingerAlt = '';
        }
        if (fingerSet === 'alt') fingerTarget.fingerAlt += FINGER_IN[c];
        else fingerTarget.finger = (fingerTarget.finger || '') + FINGER_IN[c];
        fingerChange = false;
        last.src[1] = pos[i] + 1;
        lastKind = 'finger';
        i++;
        continue;
      }
      if (c === 'C' && lastKind === 'finger' && FINGER_IN[c1]) { fingerChange = true; i++; continue; }
      if (c === "'" && lastKind === 'finger' && fingerSet === 'main') {
        // 第二組（替代指法）省略的佔位
        fingerTarget.fingerAlt = 'x';
        lastKind = 'finger'; // 之後仍可接音程（和弦）
        fingerSet = 'done';
        i++;
        continue;
      }
      if (c === '<') {
        if (c1 === 'K') {
          if (c2 === "'") { res.barline = 'double'; i += 3; } else { res.barline = 'final'; i += 2; }
          continue;
        }
        if (c1 === '7') {
          if (voice.length) warn('小節中途的反覆起始記號，目前只能放在小節開頭', pos[at]);
          res.startRepeat = true;
          i += 2;
          continue;
        }
        if (c1 === '2') { res.endRepeat = true; i += 2; continue; }
        if (c1 === '1') { i += c2 === "'" ? 3 : 2; continue; } // 音樂逗號
        if (c1 === '>') {
          voice = [];
          res.voices.push(voice);
          last = null;
          lastKind = null;
          pre = newPre();
          i += 2;
          continue;
        }
        if (c1 === 'L') {
          if (last) (last.artic = last.artic || []).push('fermata');
          i += 2;
          continue;
        }
        mark(at);
        if (c1 === '<') { pre.acc = 'dflat'; i += 2; } else { pre.acc = 'flat'; i++; }
        lastKind = null;
        continue;
      }
      if (c === '%') {
        mark(at);
        if (c1 === '%') { pre.acc = 'dsharp'; i += 2; } else { pre.acc = 'sharp'; i++; }
        lastKind = null;
        continue;
      }
      if (c === '*') {
        mark(at);
        pre.acc = 'natural';
        i++;
        lastKind = null;
        continue;
      }
      if (c === '@') {
        if (c1 === 'C') {
          const t = target();
          if (t) t.tie = true;
          i += 2;
          continue;
        }
        if (c1 === '@' && isNoteOrInterval(c2)) { mark(at); pre.oct = 0; i += 2; continue; }
        if (c1 === '8') { mark(at); pre.artic.push('accent'); i += 2; continue; }
        if (isNoteOrInterval(c1)) { mark(at); pre.oct = 1; i++; continue; }
        i += c1 === 'L' ? 2 : 1;
        continue;
      }
      if (c === '.') {
        if (c1 === 'C') {
          if (last && last.kind === 'note') { last.tie = true; last.chordTie = true; last.intervals.forEach((x) => (x.tie = true)); }
          i += 2;
          continue;
        }
        if (c1 === '>' || c1 === 'K') { i += 2; lastKind = null; continue; }
        if (c1 === '8') { mark(at); pre.artic.push('accent'); i += 2; continue; }
        if (isNoteOrInterval(c1)) { mark(at); pre.oct = 5; i++; continue; }
        i++;
        continue;
      }
      if (c === '_') {
        if (c1 === '>') { i += 2; lastKind = null; continue; }
        const tm = /^_([0-9]+)'/.exec(s.slice(i));
        if (tm) {
          mark(at);
          const nn = +tm[1];
          // 點字只寫音符個數（Par. 8.5），「佔幾拍」稍後依小節長度推斷
          pre.tuplet = { n: nn, of: TUPLET_OF[nn] ? TUPLET_OF[nn][0] : 2 ** Math.floor(Math.log2(nn)), infer: true };
          i += tm[0].length;
          lastKind = null;
          continue;
        }
        if (c1 === '8') { mark(at); pre.artic.push('tenuto'); i += 2; continue; }
        if (isNoteOrInterval(c1)) { mark(at); pre.oct = 3; i++; continue; }
        i += c1 === 'C' ? 2 : 1;
        continue;
      }
      if (c === '^') {
        if (c1 === '<' && c2 === '1') { mark(at); pre.hint = 'large'; i += 3; continue; }
        if (c1 === '2') {
          // ⠰⠃⠘⠆：兩條括號式圓滑線在下一個音交會（Par. 13.4）
          if (pre.open > 0) {
            pre.open--;
            pre.converge = (pre.converge || 0) + 1;
          } else if (last) last.close = (last.close || 0) + 1;
          i += 2;
          continue;
        }
        if (c1 === '8') { mark(at); pre.artic.push('accent'); i += 2; continue; }
        if (isNoteOrInterval(c1)) { mark(at); pre.oct = 2; i++; continue; }
        i += c1 === 'C' ? 2 : 1;
        continue;
      }
      if (c === ',') {
        if (c1 === '<' && c2 === '1') { mark(at); pre.hint = 'small'; i += 3; continue; }
        if (c1 === "'") { i += 2; continue; } // 音樂括號
        if (c1 === 'C' && last) {
          // ⠠⠉：兩條短圓滑線在下一個音交會（Par. 13.4）
          last.short = true;
          last.conv = true;
          i += 2;
          continue;
        }
        if (c1 === '8') { mark(at); pre.artic.push('staccatissimo'); i += 2; continue; }
        if (c1 === ',' && isNoteOrInterval(c2)) { mark(at); pre.oct = 8; i += 2; continue; }
        if (isNoteOrInterval(c1)) { mark(at); pre.oct = 7; i++; continue; }
        i += c1 === 'C' ? 2 : 1;
        continue;
      }
      if (c === ';') {
        if (c1 === 'B') { mark(at); pre.open++; i += 2; continue; }
        if (c1 === '8') { mark(at); pre.artic.push('accent'); i += 2; continue; }
        if (isNoteOrInterval(c1)) { mark(at); pre.oct = 6; i++; continue; }
        i += 2;
        continue;
      }
      if (c === '"') {
        if (isNoteOrInterval(c1)) { mark(at); pre.oct = 4; i++; continue; }
        // 音樂連字號或轉譯者加註前綴
        i++;
        continue;
      }
      if (c === '8') { mark(at); pre.artic.push('staccato'); i++; continue; }
      if (c === '>' && c1 === 'K') {
        // 琶音（Table 22）：⠜⠅ 向上、⠜⠅⠅ 向下
        mark(at);
        pre.artic.push('arpeggio');
        i += c2 === 'K' ? 3 : 2;
        continue;
      }
      if (c === '>') {
        const wm = /^>([A-Z]+|[34])('?)/.exec(s.slice(i));
        if (!wm) { i++; continue; }
        const w = wm[1];
        if (DYNAMICS.includes(w)) { mark(at); pre.dynamic = w.toLowerCase(); }
        else if (w === 'C') { mark(at); pre.hairpinStart = 'cresc'; }
        else if (w === 'D') { mark(at); pre.hairpinStart = 'dim'; }
        else if (w === '3') { if (last) last.hairpinEnd = 'cresc'; }
        else if (w === '4') { if (last) last.hairpinEnd = 'dim'; }
        else if (w !== 'K' && w !== 'KK') warn('文字表情記號「' + w.toLowerCase() + '」目前不轉換，已略過', pos[at]);
        i += wm[0].length;
        lastKind = null;
        continue;
      }
      if (c === '2') {
        // 「22」= 連續三連音的開始（Par. 8.4），直到單一「2」標示最後一組
        mark(at);
        const dbl = c1 === '2';
        pre.tuplet = { n: 3, of: 2, double: dbl };
        i += dbl ? 2 : 1;
        continue;
      }
      if (c === '#') {
        if (!voice.length && !last && /^#[0-9]/.test(s.slice(i))) {
          const vm = /^#([0-9]+)'?/.exec(s.slice(i));
          res.volta = String(+vm[1]);
          i += vm[0].length;
          continue;
        }
        // 音符之後（含音程前的臨時記號、音層記號）的 ⠼ 是四度音程，不是數字記號
        const intervalCtx = last && last.kind === 'note' && (lastKind === 'note' || lastKind === 'dot' || lastKind === 'interval' || lastKind === 'finger' || pre.acc || pre.oct != null);
        if (!intervalCtx && /^#[A-J]/.test(s.slice(i))) {
          const nm = /^#[A-J]+[0-9]*/.exec(s.slice(i));
          warn('小節中的數字記號「' + nm[0] + '」目前不轉換，已略過', pos[at]);
          i += nm[0].length;
          continue;
        }
      }
      if (isInterval(c)) {
        if (last && last.kind === 'note' && (lastKind === 'note' || lastKind === 'dot' || lastKind === 'interval' || lastKind === 'finger' || pre.acc || pre.oct != null)) {
          const iv = { size: INTERVAL_INFO[c], oct: pre.oct, acc: pre.acc, tie: false };
          last.intervals.push(iv);
          fingerTarget = iv;
          last.src[1] = pos[i] + 1;
          pre.acc = null;
          pre.oct = null;
          pre.start = -1;
          lastKind = 'interval';
        } else warn('音程記號「' + B.toUnicode(c) + '」前面沒有音符', pos[at]);
        i++;
        continue;
      }
      if (isNote(c) && (pre.grace || graceRun)) {
        // 倚音：記下來，附加到下一個音（不計入小節時值）
        graces.push({ step: NOTE_INFO[c].step, cls: NOTE_INFO[c].cls, dots: 0, oct: pre.oct, acc: pre.acc, long: pre.grace === 'long', hint: pre.hint, run: graceRun || graces.length > 0 });
        pre.acc = null;
        pre.oct = null;
        pre.grace = null;
        pre.hint = null;
        lastKind = 'grace';
        i++;
        continue;
      }
      if (isNote(c) || c in REST_INFO) {
        const note = isNote(c);
        const ev = {
          kind: note ? 'note' : 'rest',
          step: note ? NOTE_INFO[c].step : null,
          cls: note ? NOTE_INFO[c].cls : REST_INFO[c],
          dots: 0,
          oct: pre.oct,
          acc: pre.acc,
          intervals: [],
          tie: false,
          tuplet: pre.tuplet,
          hint: pre.hint,
          dynamic: pre.dynamic,
          artic: pre.artic.length ? pre.artic : null,
          open: pre.open,
          hairpinStart: pre.hairpinStart,
          converge: pre.converge || 0,
          ornaments: pre.ornaments.length ? pre.ornaments : null,
          graces: graces.length ? graces : null,
          pedalDown: pre.pedalDown,
          pedalChange: pre.pedalChange,
          src: [pos[pre.start >= 0 ? pre.start : i], pos[i] + 1],
        };
        graces = [];
        voice.push(ev);
        last = ev;
        fingerTarget = note ? ev : null;
        lastKind = note ? 'note' : 'rest';
        pre = newPre();
        i++;
        continue;
      }
      if (c === "'") {
        if (lastKind === 'grace' && graces.length) {
          graces[graces.length - 1].dots++;
          i++;
          continue;
        }
        if (last && (lastKind === 'note' || lastKind === 'rest' || lastKind === 'dot')) {
          last.dots++;
          last.src[1] = pos[i] + 1;
          lastKind = 'dot';
        }
        i++;
        continue;
      }
      if (c === 'C') {
        // ⠉⠉：加倍的圓滑線，從這個音開始的長圓滑線（Par. 13.3）
        if (c1 === 'C' && last) {
          last.dbl = true;
          i += 2;
          continue;
        }
        if (last) last.short = true;
        i++;
        continue;
      }
      // 小節重複記號 ⠶（Par. 18.2）：後面可以接最後一個音的連結線、反覆結束、雙縱線、終止線（18.1.2、18.1.6）
      if (c === '7' && !voice.length && /^'?7(@C)?(<K'?|<2)?$/.test(s.trim())) {
        res.repeatPrev = true;
        res.repeatSrc = [pos[at], pos[at] + 1];
        if (c1 === '@' && c2 === 'C') {
          res.repeatTie = true;
          i += 3;
        } else i++;
        continue;
      }
      // 部分小節重複 ⠶（Par. 18.3）：先放一個佔位，重複的範圍等時值判讀時再決定（見 expandPartRepeats）
      if (c === '7' && voice.length) {
        if (pre.oct != null) warn('不同音層的重複（⠶ 前加音層記號，Par. 18.1.1）目前不轉換，已照原音層重複', pos[at]);
        const ph = { kind: 'repeat', src: [pos[at], pos[at] + 1], tie: false, short: false, close: 0 };
        voice.push(ph);
        last = ph;
        lastKind = null;
        pre = newPre();
        i++;
        if (c1 === '@' && c2 === 'C') {
          ph.tie = true;
          i += 2;
        }
        continue;
      }
      warn('無法辨識的點字「' + B.toUnicode(c) + '」（點 ' + B.dotsOf(c) + '）', pos[at]);
      i++;
    }
    res.voices = res.voices.filter((v) => v.length);
    return res;
  }

  // ---------- 主程式 ----------
  /**
   * opts.intervalDir: 單聲部時和弦音程的方向 'down'（高音譜，預設）或 'up'（低音譜）。
   * 點字單行格式本身不記載譜號，方向依規範應在轉譯者註記中說明（Par. 9.2）。
   */
  function parseBraille(input, options) {
    const opts = options || {};
    const warnings = [];
    const warn = (msg, pos) => warnings.push({ msg, pos });
    const brf = B.toBrf(input.replace(/\r/g, ''));
    const rawLines = brf.split('\n');
    const lines = [];
    {
      let off = 0;
      rawLines.forEach((t) => {
        lines.push({ text: t.replace(/\s+$/, ''), off });
        off += t.length + 1;
      });
    }
    const HAND_LINE = /^(\s*)([A-J]*)('?)(\s*)(\.>|_>)/;
    const keyboard = lines.some((l) => {
      const m = HAND_LINE.exec(l.text);
      return m && (m[2] || m[1].length || l.text.trimStart().startsWith('.>') || l.text.trimStart().startsWith('_>'));
    });

    const score = { title: '', composer: '', tempo: null, keyboard, parts: [] };
    let headKey = null;
    let headMeter = null;

    /** 判斷是否為標頭行（速度、調號、拍號）。 */
    function tryHeading(text) {
      const toks = text.trim().split(/\s+/);
      if (!toks[0]) return false;
      const found = {};
      for (const t of toks) {
        const tp = parseTempo(t);
        if (tp) { found.tempo = tp; continue; }
        const sg = parseSig(t);
        if (sg) { Object.assign(found, sg); continue; }
        return false;
      }
      return found;
    }

    // 把一串「行內片段」合併成 {text, pos}，處理行尾連字號
    function Buffer() {
      this.text = '';
      this.pos = [];
    }
    Buffer.prototype.append = function (str, off, joinDirect) {
      if (this.text.length && !joinDirect) {
        this.text += ' ';
        this.pos.push(off - 1);
      }
      for (let k = 0; k < str.length; k++) {
        this.text += str[k];
        this.pos.push(off + k);
      }
    };
    Buffer.prototype.stripHyphen = function () {
      const m = /("|\.K)$/.exec(this.text);
      if (m) {
        this.text = this.text.slice(0, -m[0].length);
        this.pos.length = this.text.length;
      }
    };
    /** 以空白切成片段。 */
    Buffer.prototype.tokens = function () {
      const out = [];
      // 獨立的文字指示（如 >D'C' AL FINE>）內含空白：先把空白保護起來，整段當一個片段
      const text = this.text.replace(/(^|\s)(>[A-Z'][A-Z' ]*>)(?=\s|$)/g, (all, pre, w) => pre + w.replace(/ /g, '\u0003'));
      const re = /\S+/g;
      let m;
      while ((m = re.exec(text))) out.push({ text: m[0].replace(/\u0003/g, ' '), pos: this.pos.slice(m.index, m.index + m[0].length) });
      return out;
    };

    const heads = []; // 標頭中的換調／換拍號（依位置）
    let musicStarted = false;

    // ---------- 單行格式 ----------
    const vocalStarts = []; // 歌曲：每個平行段音樂行的開頭位置
    function collectSingle() {
      const buf = new Buffer();
      // 歌曲「一行歌詞、一行音樂」格式（Par. 35.1）：沒有段落編號，歌詞從行首寫起，音樂行從第 3 方開始，續行從第 5 方開始。
      // 歌詞行目前無法讀回（中文同音字無法還原），先略過，只讀音樂；記下每個平行段從哪裡開始
      const vocalFmt =
        !lines.some((l) => /^#[A-J]+'?\s/.test(l.text)) &&
        lines.some((l, k) => k > 0 && /^ {2}\S/.test(l.text) && /^\S/.test(lines[k - 1].text));
      let block = null;
      let lyricLines = 0;
      let pendingStart = false;
      for (const l of lines) {
        if (!l.text.trim()) continue;
        if (vocalFmt) {
          if (/^\S/.test(l.text)) {
            block = 'lyric';
            lyricLines++;
            pendingStart = true;
            continue;
          }
          if (/^ {4}\S/.test(l.text) && block === 'lyric') continue; // 歌詞的續行
          if (/^ {2}\S/.test(l.text) && block !== null) {
            block = 'music';
            if (pendingStart) vocalStarts.push(l.off + 2);
            pendingStart = false;
          }
        }
        const seg = /^#([A-J]+)('?)\s+/.exec(l.text);
        if (!musicStarted && !seg) {
          const h = tryHeading(l.text);
          if (h) {
            if (h.tempo) score.tempo = h.tempo;
            if (h.key) headKey = h.key;
            if (h.meter) headMeter = h.meter;
            continue;
          }
          // 置中的行視為標題文字；靠左的行視為沒有小節編號的音樂
          if (/^\s{3,}/.test(l.text) || !looksLikeMusic(l.text)) {
            warn('第一行音樂前的文字行已略過：「' + B.toUnicode(l.text.trim()) + '」', l.off);
            continue;
          }
        }
        if (musicStarted && !seg && /^\s{3,}/.test(l.text)) {
          const h = tryHeading(l.text);
          if (h && (h.key || h.meter)) {
            // 段落標頭：換調或換拍號
            const tok = l.text.trim();
            buf.append(tok, l.off + l.text.indexOf(tok), false);
            continue;
          }
        }
        musicStarted = true;
        if (seg) appendLine(buf, l.text.slice(seg[0].length), l.off + seg[0].length);
        else {
          const lead = /^\s*/.exec(l.text)[0].length;
          appendLine(buf, l.text.slice(lead), l.off + lead);
        }
      }
      if (lyricLines) warn('歌詞行（' + lyricLines + ' 行）已略過：目前無法從點字讀回歌詞，只讀入音樂', null);
      return expandRepeats(expandMultiRests(buf.tokens()));
    }
    /** 連續三次以上的小節重複（Par. 18.2.1）：⠶ 加數字（例如 ⠶⠼⠉）展開成一小節一個 ⠶。 */
    function expandRepeats(toks) {
      const out = [];
      for (const t of toks) {
        // 手號後的點 3 分隔（⠨⠜⠄⠶⠼⠉）也算
        const m = /^'?7#([A-J]+)(<K'?|<2)?$/.exec(t.text);
        const n = m ? B.parseUpperNumber(m[1]) : 0;
        if (!(n >= 2)) {
          out.push(t);
          continue;
        }
        const tail = m[2] || '';
        for (let k = 0; k < n; k++) {
          const last = k === n - 1 && tail;
          const at7 = t.text.indexOf('7');
          out.push({ text: '7' + (last ? tail : ''), pos: [t.pos[at7]].concat(last ? t.pos.slice(t.pos.length - tail.length) : []) });
        }
      }
      return out;
    }
    /** 連續休止（Par. 5.3）：⠍⠍、⠍⠍⠍ 與「數字記號＋小節數＋⠍」展開成一小節一個整小節休止。 */
    function expandMultiRests(toks) {
      const out = [];
      for (const t of toks) {
        const m = /^(?:(M{2,3})|#([A-J]+)M)(<K'?|<2)?$/.exec(t.text);
        const n = m ? (m[1] ? m[1].length : B.parseUpperNumber(m[2])) : 0;
        if (!(n >= 2)) {
          out.push(t);
          continue;
        }
        const tail = m[3] || '';
        for (let k = 0; k < n; k++) {
          const at = m[1] ? k : m[2].length + 1; // 這一小節對應的 ⠍ 位置
          const last = k === n - 1 && tail;
          out.push({ text: 'M' + (last ? tail : ''), pos: [t.pos[at]].concat(last ? t.pos.slice(t.pos.length - tail.length) : []) });
        }
      }
      return out;
    }
    function appendLine(buf, text, off) {
      let join = /("|\.K)$/.test(buf.text) && buf.text.length > 0;
      // 連字號兩側是反覆記號等：這是被拆開的小節，保留連字號、當作兩段
      if (join && barLike(buf.text.replace(/("|\.K)$/, ''), text)) join = false;
      else if (join) buf.stripHyphen();
      buf.append(text, off, join);
    }
    function looksLikeMusic(text) {
      const t = text.trim();
      return /[YNZ?DOE:&P$F=Q\]G(R\\H!S\[I)TWJMUVX]/.test(t) && /[@^_".;,]/.test(t);
    }

    // ---------- 鍵盤格式 ----------
    function collectKeyboard() {
      const parallels = [];
      let cur = null;
      let lastHand = null;
      for (const l of lines) {
        if (!l.text.trim()) continue;
        const hm = HAND_LINE.exec(l.text);
        if (hm) {
          const hand = hm[5] === '.>' ? 'R' : 'L';
          if (hm[2] || !cur || (cur[hand] && cur[hand].text)) {
            cur = { R: new Buffer(), L: new Buffer(), number: hm[2] ? B.parseUpperNumber(hm[2]) : null, sig: null };
            if (pendingSig) { cur.sig = pendingSig; pendingSig = null; }
            parallels.push(cur);
          }
          musicStarted = true;
          let start = hm[0].length;
          if (l.text[start] === "'") start++; // 手號後的分隔點 3
          cur[hand].append(l.text.slice(start), l.off + start, false);
          lastHand = hand;
          continue;
        }
        const h = tryHeading(l.text);
        if (h) {
          if (!musicStarted) {
            if (h.tempo) score.tempo = h.tempo;
            if (h.key) headKey = h.key;
            if (h.meter) headMeter = h.meter;
          } else pendingSig = l.text.trim(); // 段落標頭（換調、換拍號）原文
          continue;
        }
        if (cur && lastHand && /^\s/.test(l.text)) {
          // run-over 行
          const b = cur[lastHand];
          const lead = /^\s*/.exec(l.text)[0].length;
          const join = /("|\.K)$/.test(b.text);
          if (join) b.stripHyphen();
          b.append(l.text.slice(lead), l.off + lead, join);
          continue;
        }
        if (!musicStarted) warn('第一行音樂前的文字行已略過：「' + B.toUnicode(l.text.trim()) + '」', l.off);
        else warn('無法辨識的行：「' + B.toUnicode(l.text.trim()) + '」', l.off);
      }
      // 各手的小節（處理跨 parallel 的分割小節）
      const hands = { R: [], L: [] };
      const sigAt = {};
      for (const hand of ['R', 'L']) {
        let carry = null;
        parallels.forEach((p) => {
          // 換調、換拍號的標頭直接插入片段序列（不用索引對應，避免被 Segno 等片段影響）
          if (p.sig) hands[hand].push({ text: p.sig, pos: [] });
          const b = p[hand];
          const divided = /("|\.K)$/.test(b.text);
          if (divided) b.stripHyphen();
          const toks = b.tokens().filter((t) => !/^'+$/.test(t.text));
          toks.forEach((t, k) => {
            if (k === 0 && carry) {
              if (barLike(carry.text, t.text)) {
                // 被反覆記號拆開的小節：兩半分開，後半標記為延續
                hands[hand].push(carry);
                carry = null;
                t.cont = true;
              } else {
                carry.text += t.text;
                carry.pos = carry.pos.concat(t.pos);
                if (!(divided && k === toks.length - 1)) {
                  hands[hand].push(carry);
                  carry = null;
                }
                return;
              }
            }
            if (divided && k === toks.length - 1) carry = t;
            else hands[hand].push(t);
          });
        });
        if (carry) hands[hand].push(carry);
        hands[hand] = expandRepeats(hands[hand]); // 兩手都重複三次以上時寫 ⠶ 加次數（Par. 18.2.2）
      }
      return { hands, sigAt };
    }
    let pendingSig = null;

    // ---------- 建立各聲部 ----------
    const partsTokens = [];
    if (keyboard) {
      const { hands, sigAt } = collectKeyboard();
      if (!hands.R.length || !hands.L.length) {
        // 只有一手：當作單一聲部，但保留該手的音程方向
        score.keyboard = false;
        const hand = hands.R.length ? 'R' : 'L';
        partsTokens.push({ hand, toks: hands[hand], sigAt, single: true });
      } else {
        // 只計算小節（不含反覆指示、換調換拍號）
        const countM = (ts) => ts.filter((t) => !navToken(t.text) && !(parseSig(t.text) || {}).meter && !(parseSig(t.text) || {}).key).length;
        const nR = countM(hands.R);
        const nL = countM(hands.L);
        if (nR !== nL) warn('右手與左手的小節數不同（' + nR + ' / ' + nL + '）', null);
        partsTokens.push({ hand: 'R', toks: hands.R, sigAt });
        partsTokens.push({ hand: 'L', toks: hands.L, sigAt });
      }
    } else {
      partsTokens.push({ hand: null, toks: collectSingle(), sigAt: {} });
    }

    for (const pt of partsTokens) {
      // 行中的音樂連字號（例如小節中途的反覆記號前）：與下一段合併成同一小節
      const merged = [];
      for (const t of pt.toks) {
        const prevTok = merged[merged.length - 1];
        if (prevTok && prevTok._open && !barLike(prevTok.text, t.text)) {
          prevTok.text += t.text;
          prevTok.pos = prevTok.pos.concat(t.pos);
          prevTok._open = /("|\.K)$/.test(prevTok.text);
          if (prevTok._open) stripTail(prevTok);
          continue;
        }
        const c = { text: t.text, pos: t.pos.slice(), cont: !!t.cont || !!(prevTok && prevTok._open) };
        if (prevTok) prevTok._open = false;
        c._open = /[^'"]("|\.K)$/.test(c.text) && !parseSig(c.text);
        if (c._open) stripTail(c);
        merged.push(c);
      }
      pt.toks = merged;
      const measures = [];
      let pendKey = null;
      let pendMeter = null;
      let pendNav = {};
      for (const t of pt.toks) {
        const sg = parseSig(t.text);
        if (sg && (sg.key || sg.meter)) {
          if (sg.key) pendKey = sg.key;
          if (sg.meter) pendMeter = sg.meter;
          continue;
        }
        // 反覆指示（Par. 20）
        const nav = navToken(t.text);
        if (nav) {
          const lastM = measures[measures.length - 1];
          if (nav === 'segno' || nav === 'codaStart') pendNav[nav] = true;
          else if (nav === 'skip') {
            /* 點字專用的段落結束記號等：略過 */
          } else if (lastM) {
            if (typeof nav === 'object') lastM.jump = nav;
            else lastM[nav] = true;
          }
          continue;
        }
        const idx = measures.length;
        if (pt.sigAt[idx]) {
          if (pt.sigAt[idx].key) pendKey = pt.sigAt[idx].key;
          if (pt.sigAt[idx].meter) pendMeter = pt.sigAt[idx].meter;
        }
        const r = tokenizeMeasure(t.text, t.pos, warn);
        const m = { voices: r.voices, startRepeat: r.startRepeat, endRepeat: r.endRepeat, volta: r.volta, barline: r.barline, _repeatPrev: r.repeatPrev, _repeatTie: r.repeatTie, _repeatSrc: r.repeatSrc };
        if (t.cont && measures.length) m.splitCont = true;
        // 歌曲：平行段的第一小節（寫回點字時照原本分段）
        if (vocalStarts.length && t.pos.length && t.pos[0] >= vocalStarts[0]) {
          m.lineStart = true;
          while (vocalStarts.length && vocalStarts[0] <= t.pos[0]) vocalStarts.shift();
        }
        Object.assign(m, pendNav);
        pendNav = {};
        if (pendKey) { m.key = pendKey; pendKey = null; }
        if (pendMeter) { m.meter = pendMeter; pendMeter = null; }
        measures.push(m);
      }
      if (!measures.length) measures.push({ voices: [], barline: 'final' });
      if (!measures[0].meter && !headMeter && pt === partsTokens[0]) warn('找不到拍號，預設為 4/4', null);
      measures[0].key = measures[0].key || headKey || { fifths: 0, mode: 'major' };
      measures[0].meter = measures[0].meter || headMeter || { num: 4, den: 4, symbol: null };
      score.parts.push({ id: pt.hand || '1', hand: pt.hand, clef: pt.hand === 'L' ? 'bass' : 'treble', measures });
    }

    // 反覆指示在各手同步（任一手有就算）
    M.syncNav(score);

    // ---------- 音高、時值 ----------
    for (const part of score.parts) buildEvents(part, warn, opts.intervalDir);
    if (!score.keyboard) {
      // 單聲部：依音程方向或音域選擇譜號
      const part = score.parts[0];
      const ds = [];
      M.forEachEvent(score, (ev) => ev.notes.forEach((n) => ds.push(M.diatonic(n))));
      if (part.hand === 'L' || (!part.hand && opts.intervalDir === 'up')) part.clef = 'bass';
      else if (!part.hand && !opts.intervalDir && ds.length && ds.reduce((a, b) => a + b, 0) / ds.length < 4 * 7 - 2) part.clef = 'bass';
      part.hand = null;
    }
    // 鍵盤：兩手的調號、拍號同步
    if (score.keyboard && score.parts.length === 2) {
      const [a, b] = score.parts;
      a.measures.forEach((m, i) => {
        const o = b.measures[i];
        if (!o) return;
        if (m.key && !o.key) o.key = m.key;
        if (m.meter && !o.meter) o.meter = m.meter;
      });
      while (b.measures.length < a.measures.length)
        b.measures.push({ voices: [[restMeasure()]], barline: 'single' });
      while (a.measures.length < b.measures.length)
        a.measures.push({ voices: [[restMeasure()]], barline: 'single' });
    }
    M.resolveAlters(score);
    return { score, warnings };
  }

  /**
   * 反覆指示片段（Par. 20）：⠬ Segno、⠬⠇ Coda 記號、>FINE>、>D'C' AL FINE>、>CODA> 等。
   * 回傳 'segno' | 'toCoda' | 'codaStart' | 'fine' | {type, to} | 'skip' | null
   */
  function navToken(t) {
    if (t === '+L') return 'toCoda'; // 必須在「⠬ + 字母」（點字專用 Segno）之前判斷
    if (t === '+' || /^\+[A-Z]$/.test(t)) return 'segno';
    if (/^"\+[A-Z]$/.test(t)) return { type: 'DS', to: null };
    if (t === '*') return 'skip';
    if (/^,CODA4?$/.test(t)) return 'codaStart';
    const m = /^>([A-Z' ]+)>$/.exec(t);
    if (!m) return null;
    const w = m[1].replace(/'/g, '.').toLowerCase().trim();
    if (w === 'fine') return 'fine';
    if (w === 'coda') return 'codaStart';
    if (w === 'to coda') return 'toCoda';
    const j = /^(d\.?\s*c\.?|dc\.|da capo|d\.?\s*s\.?|dal segno)(?:\s*al\s*(fine|coda))?\.?$/.exec(w);
    if (j) return { type: /^(d\.?\s*c|dc|da)/.test(j[1]) ? 'DC' : 'DS', to: j[2] || null };
    return null;
  }

  /**
   * 連音記號只寫「幾連音」，不寫包含幾個音。預設取接下來 n 個音；
   * 時值混合時（例如三連音內有附點八分＋三個 16 分），改為取到「時值總和 = n × 某個音符時值」為止。
   */
  function regroupTuplets(raw, values) {
    const unit = new Set([1, 2, 4, 8, 16, 32, 64, 128].map((v) => M.valueTicks(v, 0)));
    let changed = false;
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      if (!r._tupStart || !r._factor || values[i] === 'measure') continue;
      const f = r._factor;
      const n = f.n;
      let curEnd = i;
      while (curEnd + 1 < raw.length && raw[curEnd + 1]._factor === f && !raw[curEnd + 1]._tupStart) curEnd++;
      let sum = 0;
      let found = -1;
      for (let j = i; j < raw.length && j < i + n + 6; j++) {
        if (j > i && raw[j]._tupStart) break;
        sum += M.valueTicks(values[j], raw[j].dots || 0);
        if (j - i + 1 >= n && sum % n === 0 && unit.has(sum / n)) {
          found = j;
          break;
        }
      }
      if (found < 0 || found === curEnd) continue;
      for (let j = i; j <= Math.max(found, curEnd); j++) {
        if (j <= found) {
          raw[j]._factor = f;
          raw[j]._tupEnd = j === found;
        } else {
          delete raw[j]._factor;
          delete raw[j]._tupEnd;
        }
      }
      changed = true;
    }
    return changed;
  }

  /** 連字號兩側若有反覆、複縱線或房號，代表同一小節被拆成兩半（Par. 17.1）。 */
  function barLike(a, b) {
    return /(<2|<K'?)$/.test(a) || /^(<7|#[0-9])/.test(b.trimStart());
  }

  function stripTail(t) {
    const m = /("|\.K)$/.exec(t.text);
    t.text = t.text.slice(0, -m[0].length);
    t.pos.length = t.text.length;
  }

  function restMeasure() {
    return { id: M.newId(), kind: 'rest', measureRest: true, value: 1, dots: 0, notes: [], src: {} };
  }

  function buildEvents(part, warn, intervalDir) {
    const dir = part.hand === 'L' ? 'up' : part.hand === 'R' ? 'down' : intervalDir === 'up' ? 'up' : 'down';
    let prev = null;
    let run = null;
    const doubled = {}; // 各聲部正在「重複」中的記號（Par. 22.1.1）
    const N = part.measures.length;
    // 連音範圍（連續三連音可跨小節）：先整首掃過一次
    part.measures.forEach((m) => {
      if (m._repeatPrev) return;
      m.voices.forEach((raw, vi) => {
        let left = 0;
        let tup = null;
        raw.forEach((r) => {
          if (r.kind === 'repeat') return;
          if (r.tuplet) {
            tup = r.tuplet;
            left = tup.n;
            r._tupStart = true;
            if (vi === 0) {
              if (tup.double) run = tup;
              else if (run) run = null; // 單一記號：連續三連音的最後一組
            }
          } else if (left === 0 && run && vi === 0) {
            tup = run;
            left = tup.n;
            r._tupStart = true;
          }
          if (left > 0) {
            r._factor = tup;
            left--;
            r._tupEnd = left === 0;
          }
        });
      });
    });
    const chainVals = new Map(); // 被拆開小節的後半：時值與前半一起判讀
    const itemsOf = (raw) => raw.map((r) => ({ cls: r.cls, rest: r.kind === 'rest', dots: r.dots, factor: r._factor || null, hint: r.hint }));
    /**
     * 解一個小節（或被拆開小節的各段）的時值：
     * 1. 不規則連音的比例逐一嘗試，取能剛好填滿小節的；
     * 2. 填不滿時，若全部取較長時值已超過小節（過滿的小節），就照較長時值，不縮短音符來湊；
     *    否則視為不完整的小節。
     */
    const solveRaws = (raws, target, partial, warnAt) => {
      const tups = [];
      raws.forEach((raw) => raw.forEach((r) => r._factor && r._factor.infer && !tups.includes(r._factor) && tups.push(r._factor)));
      const ns = [...new Set(tups.map((t) => t.n))];
      const combos = [[]];
      for (const n of ns) {
        const opts = TUPLET_OF[n] || [tups.find((t) => t.n === n).of];
        const next = [];
        for (const c of combos) for (const o of opts) next.push(c.concat([[n, o]]));
        combos.splice(0, combos.length, ...next.slice(0, 64));
      }
      const apply = (c) => c.forEach(([n, o]) => tups.forEach((t) => t.n === n && (t.of = o)));
      const items = () => [].concat(...raws.map(itemsOf));
      // 每種比例都試，取最合理（需要縮短成小時值的音最少）的解
      let best = null;
      for (const c of combos) {
        apply(c);
        const res = D.solve(items(), target, false);
        if (res && (!best || res.cost < best.res.cost)) best = { c, res };
      }
      if (best) {
        apply(best.c);
        return best.res.values;
      }
      apply(combos[0]);
      const its = items();
      const large = its.map((it) => (it.hint === 'small' ? D.SMALL[it.cls] : D.LARGE[it.cls]));
      const largeTotal = its.reduce((s, it, k) => s + D.ticksOf(large[k], it), 0);
      // 小節開頭有大時值記號（拍數不符的小節，寫出端會這樣標明）：照記號讀取，不縮短音符來湊
      if (its[0] && its[0].hint === 'large' && largeTotal !== target) return large;
      if (partial) {
        const res = D.solve(its, target, true);
        if (res) return res.values;
      }
      if (warnAt != null) warn('第 ' + warnAt + ' 個小節的時值加總與拍號不符，已盡量推算', null);
      const res = D.solve(its, target, true);
      return res ? res.values : large;
    };
    /**
     * 部分小節重複（Par. 18.3）：把 ⠶ 佔位換成被重複的音。點字只寫 ⠶，不寫重複多少，
     * 所以逐一嘗試「重複前面幾個音」：能剛好填滿小節、重複的長度是後半小節、一拍或半拍且從該單位的開頭開始
     * （或是重複一個用音程寫的和弦），而且重複出來的音時值和原來相同，就採用。
     */
    const expandPartRepeats = (raw, meter, partial, mi) => {
      if (!raw.some((r) => r.kind === 'repeat')) return raw;
      const target = M.meterTicks(meter);
      const runs = [];
      raw.forEach((r, i) => {
        if (r.kind !== 'repeat') return;
        const lastRun = runs[runs.length - 1];
        if (lastRun && lastRun.at + lastRun.len === i) lastRun.len++;
        else runs.push({ at: i, len: 1 });
      });
      const compound = meter.den === 8 && meter.num % 3 === 0 && meter.num > 3;
      const beat = compound ? (3 * M.TPW) / 8 : M.TPW / meter.den;
      const units = [target / 2, beat, compound ? M.TPW / 8 : beat / 2];
      const build = (ks) => {
        const out = [];
        const segs = [];
        let ri = 0;
        for (let i = 0; i < raw.length; ) {
          if (raw[i].kind !== 'repeat') {
            out.push(raw[i++]);
            continue;
          }
          const run = runs[ri];
          const k = ks[ri++];
          const orig = out.slice(out.length - k);
          if (orig.length < k) return null;
          const seg = { start: out.length - k, k, copies: [] };
          for (let c = 0; c < run.len; c++) {
            const ph = raw[i + c];
            seg.copies.push(out.length);
            orig.forEach((o, j) => {
              // _copyOf：重複出來的音，音高照抄原來的音（不再依前一個音推算音層）
              const cp = Object.assign({}, o, { src: ph.src, _copyOf: o._copyOf || o });
              if (o.intervals) cp.intervals = o.intervals.map((iv) => Object.assign({}, iv));
              // 最後一個音的連結線、圓滑線不屬於重複的內容，看 ⠶ 後面有沒有寫（18.1.2、18.1.3）
              if (j === k - 1) {
                cp.tie = ph.tie;
                if (cp.intervals) cp.intervals.forEach((iv) => (iv.tie = false));
                cp.short = ph.short;
                cp.close = ph.close;
              }
              out.push(cp);
            });
          }
          segs.push(seg);
          i += run.len;
        }
        return { out, segs };
      };
      const valid = (b, exact) => {
        const values = solveRaws([b.out], target, partial && !exact, null);
        const ticks = values.map((v, k) => (typeof v === 'number' ? D.ticksOf(v, itemsOf([b.out[k]])[0]) : 0));
        const total = ticks.reduce((a, x) => a + x, 0);
        if (total !== target && !(partial && !exact && total < target)) return false;
        const offs = [];
        ticks.reduce((t, x, k) => ((offs[k] = t), t + x), 0);
        return b.segs.every((s) => {
          const U = ticks.slice(s.start, s.start + s.k).reduce((a, x) => a + x, 0);
          const chord = s.k === 1 && b.out[s.start].intervals && b.out[s.start].intervals.length > 0;
          // 單一個音（非和弦）不會寫成 ⠶（寫出端也不這樣寫），避免音符分組造成的錯誤解讀
          if (s.k === 1 && !chord) return false;
          if (!chord && !(units.includes(U) && offs[s.start] % U === 0)) return false;
          return s.copies.every((c) => {
            for (let j = 0; j < s.k; j++) if (values[c + j] !== values[s.start + j]) return false;
            return true;
          });
        });
      };
      // 依序嘗試每段 ⠶ 重複前面幾個音：從多到少，和寫出端「先找較大的單位」一致
      const maxK = Math.min(16, raw.length);
      // 先找能剛好填滿小節的解讀；都不行時（弱起或最後一小節）才接受不完整的小節
      const tryKs = (ks, exact) => {
        if (ks.length === runs.length) {
          const b = build(ks);
          return b && valid(b, exact) ? b.out : null;
        }
        for (let k = maxK; k >= 1; k--) {
          const r = tryKs(ks.concat([k]), exact);
          if (r) return r;
        }
        return null;
      };
      // 寫出端一個小節只用一種單位，所以先試「每段 ⠶ 重複的音數都相同」；不行再逐段組合（最多三段）
      const sameK = (exact) => {
        for (let k = maxK; k >= 1; k--) {
          const b = build(runs.map(() => k));
          if (b && valid(b, exact)) return b.out;
        }
        return null;
      };
      const search = (exact) => sameK(exact) || (runs.length <= 3 ? tryKs([], exact) : null);
      const out = search(true) || (partial ? search(false) : null);
      if (out) return out;
      warn('第 ' + (mi + 1) + ' 小節的部分小節重複 ⠶ 無法判斷重複的範圍，已略過', raw.find((r) => r.kind === 'repeat').src[0]);
      return raw.filter((r) => r.kind !== 'repeat');
    };
    part.measures.forEach((m, mi) => {
      const meter = M.meterAt(part, mi);
      if (m._repeatPrev) {
        // 複製前一小節；同步標示對應到 ⠶。最後一個音的連結線不屬於重複的內容，看 ⠶ 後面有沒有寫（Par. 18.1.2）
        const p = part.measures[mi - 1];
        m.voices = p ? p.voices.map((v) => v.map(M.cloneEvent)) : [];
        m.voices.forEach((v) =>
          v.forEach((ev, k) => {
            ev.src = { brl: m._repeatSrc };
            if (k === v.length - 1) (ev.notes || []).forEach((n) => (n.tie = !!m._repeatTie));
          })
        );
        delete m._repeatPrev;
        delete m._repeatTie;
        delete m._repeatSrc;
        return;
      }
      delete m._repeatPrev;
      m.voices = m.voices.map((raw, vi) => {
        raw = expandPartRepeats(raw, meter, mi === N - 1 || M.mayBeIncomplete(part, mi), mi);
        // 時值
        const target = M.meterTicks(meter);
        let values;
        const ck = mi + ':' + vi;
        const chain = [mi];
        while (part.measures[chain[chain.length - 1] + 1] && part.measures[chain[chain.length - 1] + 1].splitCont) chain.push(chain[chain.length - 1] + 1);
        const raws = chain.map((j) => (j === mi ? raw : part.measures[j].voices[vi]));
        if (chainVals.has(ck)) {
          values = chainVals.get(ck);
        } else if (raw.length === 1 && raw[0].kind === 'rest' && raw[0].cls === 0 && !raw[0].dots && !raw[0].hint && !m.splitCont && chain.length === 1) {
          values = ['measure'];
        } else if (chain.length > 1 && raws.every((x) => x && x.length && !part.measures[chain[0]]._repeatPrev)) {
          const partial = mi === 0 || chain[chain.length - 1] === N - 1;
          const all = solveRaws(raws, target, partial, partial ? null : mi + 1);
          let off = 0;
          raws.forEach((x, k) => {
            const vals = all.slice(off, off + x.length);
            off += x.length;
            if (k === 0) values = vals;
            else chainVals.set(chain[k] + ':' + vi, vals);
          });
        } else {
          const partial = mi === N - 1 || chain.length > 1 || M.mayBeIncomplete(part, mi);
          values = solveRaws([raw], target, partial, partial || !raw.length ? null : mi + 1);
          // 混合時值的連音（如三連音內有附點八分＋16 分）：依時值重新判斷每組包含幾個音，必要時再解一次
          if (regroupTuplets(raw, values)) values = solveRaws([raw], target, partial, null);
        }
        // 音高
        return raw.map((r, k) => {
          const ev = { id: M.newId(), kind: r.kind, notes: [], src: { brl: r.src } };
          if (values[k] === 'measure') {
            ev.measureRest = true;
            ev.value = 1;
            ev.dots = 0;
          } else {
            ev.value = values[k];
            ev.dots = r.dots;
          }
          if (r._factor) ev.tuplet = { n: r._factor.n, of: r._factor.of, start: !!r._tupStart, end: !!r._tupEnd };
          if (r.dynamic) ev.dynamic = r.dynamic;
          // 斷奏、重音等的重複（Par. 22.1.1）：記號寫兩次表示連續數個音都有，
          // 最後一個音再寫一次表示結束；中間的音不寫
          {
            const dbl = (doubled[vi] = doubled[vi] || new Set());
            const arts = [];
            const counts = {};
            for (const a of r.artic || []) counts[a] = (counts[a] || 0) + 1;
            for (const a in counts) {
              if (counts[a] >= 2 && a !== 'fermata') dbl.add(a);
              else if (dbl.has(a)) dbl.delete(a);
              arts.push(a);
            }
            if (r.kind === 'note') for (const a of dbl) if (!counts[a]) arts.push(a);
            if (arts.length) ev.articulations = arts;
          }
          if (r.hairpinStart) ev.hairpinStart = r.hairpinStart;
          if (r.hairpinEnd) ev.hairpinEnd = r.hairpinEnd;
          if (r.ornaments) ev.ornaments = r.ornaments.slice();
          if (r.pedalDown) ev.pedalDown = true;
          if (r.pedalChange) ev.pedalChange = true;
          if (r.pedalUp) ev.pedalUp = true;
          // 倚音：依序推算八度，時值取常見值（全/16 分類取 16 分）
          if (r.graces) {
            ev.graces = r.graces.map((gr) => {
              let octave;
              if (gr.oct != null) octave = gr.oct;
              else if (prev == null) octave = 4;
              else octave = inferOctave(prev, gr.step, warn, r.src[0]);
              const gn = { step: gr.step, octave, accidental: gr.acc };
              prev = M.diatonic(gn);
              // 倚音不計入小節時值，無法靠小節長度判斷：長倚音取較長時值，短倚音（含多個倚音）取較短時值
              const gv = gr.hint ? (gr.hint === 'small' ? D.SMALL : D.LARGE)[gr.cls] : gr.long ? [16, 2, 4, 8][gr.cls] : [16, 32, 4, 8][gr.cls];
              return { notes: [gn], value: gv, dots: gr.dots, slash: r.graces.length === 1 && !gr.long };
            });
          }
          if (r.kind === 'note') {
            let octave;
            if (r._copyOf && r._copyOf._octave != null) octave = r._copyOf._octave;
            else if (r.oct != null) octave = r.oct;
            else if (prev == null) {
              warn('第一個音缺少音層記號，假設為第 4 音層', r.src[0]);
              octave = 4;
            } else octave = inferOctave(prev, r.step, warn, r.src[0]);
            r._octave = octave;
            const written = { step: r.step, octave, accidental: r.acc, tie: r.tie };
            if (r.finger !== undefined) written.finger = r.finger;
            if (r.fingerAlt !== undefined) written.fingerAlt = r.fingerAlt;
            const wd = M.diatonic(written);
            const notes = [written];
            let pd = wd;
            const sign = dir === 'down' ? -1 : 1;
            for (const iv of r.intervals) {
              const letter = (((wd + sign * (iv.size - 1)) % 7) + 7) % 7;
              let d;
              if (iv.oct != null) d = iv.oct * 7 + letter;
              else {
                // 在前一個和弦音的同方向、一個八度以內
                d = pd + sign;
                while ((((d % 7) + 7) % 7) !== letter) d += sign;
              }
              const nn = M.fromDiatonic(d);
              const inote = { step: nn.step, octave: nn.octave, accidental: iv.acc, tie: iv.tie };
              if (iv.finger !== undefined) inote.finger = iv.finger;
              if (iv.fingerAlt !== undefined) inote.fingerAlt = iv.fingerAlt;
              notes.push(inote);
              pd = d;
            }
            notes.sort((a, b) => M.diatonic(a) - M.diatonic(b));
            ev.notes = notes;
            prev = wd;
          }
          ev._chordTie = r.chordTie;
          ev._short = r.short;
          ev._dbl = r.dbl;
          ev._conv = r.conv;
          ev._open = r.open;
          ev._close = r.close;
          ev._converge = r.converge;
          return ev;
        });
      });
    });
    // 和弦連結線 ⠨⠉：只有下一個和弦中也有的音才算連結（Par. 10.2）
    {
      const maxV = Math.max(1, ...part.measures.map((m) => m.voices.length));
      for (let vi = 0; vi < maxV; vi++) {
        const st = [];
        part.measures.forEach((m) => (m.voices[vi] || []).forEach((ev) => st.push(ev)));
        st.forEach((ev, k) => {
          if (!ev._chordTie) return;
          const next = st[k + 1];
          const has = new Set(next && next.kind === 'note' ? next.notes.map((n) => n.step + n.octave) : []);
          ev.notes.forEach((n) => {
            if (!has.has(n.step + n.octave)) n.tie = false;
          });
        });
      }
      part.measures.forEach((m) => m.voices.forEach((v) => v.forEach((ev) => delete ev._chordTie)));
    }
    // 踏板：省略的「放開」記號補回來（Par. 29.10.1 (b)）
    {
      const st = [];
      part.measures.forEach((m) => (m.voices[0] || []).forEach((ev) => st.push(ev)));
      let down = false;
      st.forEach((ev, k) => {
        if (ev.pedalDown && down && k > 0) st[k - 1].pedalUp = true; // 緊接著再踩下：前一音放開
        if (ev.pedalDown || ev.pedalChange) down = true;
        if (ev.pedalUp) down = false;
      });
      if (down && st.length) st[st.length - 1].pedalUp = true; // 樂曲結尾
    }
    // 圓滑線：短圓滑線 C 連到下一個音；括號式 ;B … ^2
    const stream = [];
    part.measures.forEach((m) => (m.voices[0] || []).forEach((ev) => stream.push(ev)));
    let inShort = false;
    let convPending = false;
    // 加倍寫法：⠉⠉ 開始；之後單一個 ⠉ 標在倒數第二個音，圓滑線到下一個音結束
    let inDouble = false;
    let doubleEndNext = false;
    stream.forEach((ev) => {
      if (inDouble && ev.kind === 'note') {
        if (doubleEndNext) {
          ev.slurEnd = (ev.slurEnd || 0) + 1;
          inDouble = doubleEndNext = false;
        } else if (ev._short) {
          doubleEndNext = true;
          ev._short = false;
        }
      }
      if (ev._dbl && ev.kind === 'note') {
        ev.slurStart = (ev.slurStart || 0) + 1;
        inDouble = true;
        doubleEndNext = false;
      } else if (ev._short && ev.kind === 'note') {
        if (inShort && convPending) {
          // 交會音：前一條在此結束，新的一條從此開始
          ev.slurEnd = (ev.slurEnd || 0) + 1;
          ev.slurStart = (ev.slurStart || 0) + 1;
        } else if (!inShort) ev.slurStart = (ev.slurStart || 0) + 1;
        inShort = true;
        convPending = !!ev._conv;
      } else if (inShort && ev.kind === 'note') {
        ev.slurEnd = (ev.slurEnd || 0) + 1;
        inShort = false;
        convPending = false;
      }
      if (ev._converge) {
        ev.slurEnd = (ev.slurEnd || 0) + ev._converge;
        ev.slurStart = (ev.slurStart || 0) + ev._converge;
      }
      if (ev._open) ev.slurStart = (ev.slurStart || 0) + ev._open;
      if (ev._close) ev.slurEnd = (ev.slurEnd || 0) + ev._close;
    });
    part.measures.forEach((m) =>
      m.voices.forEach((v) =>
        v.forEach((ev) => {
          delete ev._short;
          delete ev._dbl;
          delete ev._conv;
          delete ev._open;
          delete ev._close;
          delete ev._converge;
        })
      )
    );
  }

  /** 沒有音層記號時，依前一音推算八度（Par. 3.2.2 的反向）。 */
  function inferOctave(prevD, step, warn, pos) {
    const po = Math.floor(prevD / 7);
    const idx = M.STEPS.indexOf(step);
    let best = null;
    for (const o of [po - 1, po, po + 1]) {
      const d = o * 7 + idx;
      const dist = Math.abs(d - prevD);
      if (dist <= 2) return o;
      if (dist <= 4 && o === po) best = o;
    }
    if (best != null) return best;
    warn('此處應有音層記號（音程超過五度），已取最接近的音層', pos);
    let o2 = po;
    let bd = 99;
    for (const o of [po - 1, po, po + 1]) {
      const dist = Math.abs(o * 7 + idx - prevD);
      if (dist < bd) { bd = dist; o2 = o; }
    }
    return o2;
  }

  MB.parseBraille = parseBraille;
  MB.brailleParseUtil = { tokenizeMeasure, parseSig, parseTempo, inferOctave };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
