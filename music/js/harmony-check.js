/*
 * 四部和聲檢查（MB.harmony）：照一般和聲學教本（四部、共通慣例時期）的聲部進行規則。
 * 不碰畫面，可以在 Node 測試（tests/harmony-test.js；平行、反向五八度以 music21 的 VoiceLeadingQuartet 核對）。
 *
 * 輸入：chords = [{notes: [S, A, T, B]（Note，由高到低）, figure: '65'|null, label: 'V65'|null}]、key = {tonic, mode}
 * 輸出：[{level: 'error'|'warn'|'info', at: 和弦索引, to: 下一個和弦索引（進行的問題）, voices: [0..3], rule, msg}]
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const T = MB.theory;

  const VOICE = ['高音部（S）', '中音部（A）', '次中音部（T）', '低音部（B）'];
  const VOICE_SHORT = ['S', 'A', 'T', 'B'];
  // 音域（MIDI）：一般教本的範圍，稍微超出只提醒
  const RANGE = [
    [60, 79], // S：C4–G5
    [55, 74], // A：G3–D5
    [48, 67], // T：C3–G4
    [40, 62], // B：E2–D4
  ];
  const zh = (n) => T.nameZh(n, { octave: true });

  // ---------- 文字格式 ----------
  /**
   * 一行一個和弦：四個音（高音部到低音部），可以加數字低音 [6/4] 與自己標的級數。
   * 例：「Eb5 Ab4 C4 Ab2 I」「C5 G4 E4 C3 [6] I6」。// 之後是註解。
   * 回傳 {chords, errors: [{line, msg}]}
   */
  function parseText(text) {
    const chords = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, li) => {
        const line = raw.replace(/\/\/.*$/, '').trim();
        if (!line) return;
        let figure = null;
        const body = line.replace(/\[([^\]]*)\]/, (m, f) => {
          figure = f.trim();
          return ' ';
        });
        const notes = [];
        const other = [];
        for (const tok of body.split(/[\s,，、|]+/).filter(Boolean)) {
          const n = /^[A-Ga-g](##|#|x|bb|b|♯|♭)?-?\d+$/.test(tok) ? T.parseNote(tok) : null;
          if (n) notes.push(n);
          else other.push(tok);
        }
        if (notes.length !== 4) {
          errors.push({ line: li + 1, msg: '第 ' + (li + 1) + ' 行要有四個音（高音部、中音部、次中音部、低音部，例如 C5 G4 E4 C3），現在有 ' + notes.length + ' 個' });
          return;
        }
        chords.push({ notes, figure, label: other.length ? other.join('') : null, line: li + 1 });
      });
    return { chords, errors };
  }

  // ---------- 數字低音 ----------
  /**
   * 數字低音 → 低音上方的音程與升降：[{num, acc: '#'|'b'|'n'|null, optional}]。
   * 省略寫法照慣例：空白＝5/3、6＝6/3、7＝7/5/3、6/5＝6/5/3、4/3＝6/4/3、4/2 或 2＝6/4/2；單獨的 # b ♮ 是三度。
   */
  function parseFigure(fig) {
    const s = String(fig || '')
      .replace(/♯|\+/g, '#')
      .replace(/♭/g, 'b')
      .replace(/♮/g, 'n');
    const items = [];
    const re = /([#bn]?)(\d)([#bn]?)|([#bn])/g;
    // 「7/#」「7 #」是 7 上下疊 #（三度升），「7#」才是升七度：先依空白、斜線分組，再各自讀
    for (const part of s.split(/[\s/]+/).filter(Boolean)) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(part))) {
        if (m[4]) items.push({ num: 3, acc: m[4] });
        else items.push({ num: +m[2], acc: m[1] || m[3] || null });
      }
    }
    const nums = items.map((x) => x.num).sort((a, b) => b - a).join('');
    const full = {
      '': [5, 3], 5: [5, 3], 3: [5, 3], 53: [5, 3], 6: [6, 3], 63: [6, 3], 64: [6, 4], 7: [7, 5, 3], 75: [7, 5, 3], 73: [7, 5, 3], 753: [7, 5, 3],
      65: [6, 5, 3], 653: [6, 5, 3], 43: [6, 4, 3], 643: [6, 4, 3], 42: [6, 4, 2], 2: [6, 4, 2], 642: [6, 4, 2],
    }[nums];
    if (!full) return { ok: false, items };
    const written = new Set(items.map((x) => x.num));
    const out = full.map((num) => {
      const it = items.find((x) => x.num === num);
      // 沒寫出來的五度可以省略（三和弦、七和弦原位常見）
      return { num, acc: it ? it.acc : null, optional: num === 5 && !written.has(5) };
    });
    return { ok: true, intervals: out };
  }

  const keyAlterOf = (key) => {
    const f = T.fifthsOf(key.tonic, key.mode);
    const alt = {};
    for (const n of T.keySignatureNotes(f || 0)) alt[n.step] = n.alter;
    return alt;
  };

  /** 依數字低音與調號，低音上方應有的音（音名，不含八度）。 */
  function figureTones(bass, fig, key) {
    const p = parseFigure(fig);
    if (!p.ok) return null;
    const ka = keyAlterOf(key);
    return p.intervals.map(({ num, acc, optional }) => {
      const step = T.STEPS[(T.STEPS.indexOf(bass.step) + num - 1) % 7];
      let alter = ka[step] || 0;
      if (acc === '#') alter += 1;
      else if (acc === 'b') alter -= 1;
      else if (acc === 'n') alter = 0;
      return { num, step, alter, optional };
    });
  }

  // ---------- 級數寫法 ----------
  /** 學生寫的級數換成統一寫法：V6/5、V⁶₅、Ⅴ65 → V65；viio、vii° → vii°；V7/V。 */
  function normalizeLabel(s) {
    if (!s) return '';
    const sup = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7' };
    const roman = { Ⅰ: 'I', Ⅱ: 'II', Ⅲ: 'III', Ⅳ: 'IV', Ⅴ: 'V', Ⅵ: 'VI', Ⅶ: 'VII', ⅰ: 'i', ⅱ: 'ii', ⅲ: 'iii', ⅳ: 'iv', ⅴ: 'v', ⅵ: 'vi', ⅶ: 'vii' };
    let t = String(s).replace(/[⁰-⁹₀-₉¹²³]/g, (c) => sup[c] || c).replace(/[Ⅰ-Ⅶⅰ-ⅶ]/g, (c) => roman[c]);
    t = t.replace(/\s/g, '').replace(/[oO0](?=\d|$|\/)/g, '°').replace(/ø|%/g, 'ø');
    // 轉位數字之間的斜線：V6/5 → V65（但 V/V 的斜線保留）
    t = t.replace(/(\d)\/(\d)/g, '$1$2');
    t = t.replace(/(\d)\/(\d)/g, '$1$2');
    // 三和弦原位寫 53、七和弦原位寫 753 → 省略
    t = t.replace(/53(?=$|\/)/, '').replace(/7(53|5)(?=$|\/)/, '7');
    t = t.replace(/42(?=$|\/)/, '42').replace(/(^|[^\d])2(?=$|\/)/, '$142');
    return t;
  }

  // ---------- 檢查 ----------
  const simpleIv = (lo, hi) => T.interval(lo, hi);
  /** 兩音的音程類別：'P5'、'P8'（含同度、複音程）、其他回傳 null。 */
  function perfectClass(lo, hi) {
    const iv = simpleIv(lo, hi);
    if (iv.quality !== 'P') return null;
    const s = ((iv.number - 1) % 7) + 1;
    if (s === 5) return 'P5';
    if (s === 1) return iv.number === 1 ? 'P1' : 'P8';
    return null;
  }
  const dir = (a, b) => Math.sign(T.midi(b) - T.midi(a));

  function check(chords, key) {
    const out = [];
    const add = (level, at, to, voices, rule, msg) => out.push({ level, at, to, voices, rule, msg });
    const info = chords.map((c) => {
      const ch = T.identifyChord(c.notes);
      const rn = ch ? T.romanNumeral(ch, key) : null;
      return { ch, rn };
    });
    const sc = T.scale({ ...key.tonic, octave: 4 }, key.mode === 'minor' ? 'harmonic' : 'major');
    const leading = sc[6];
    const tonic = sc[0];
    const isLeading = (n) => T.same(n, leading) && T.midi(leading) % 12 !== (T.midi(tonic) + 10) % 12;

    chords.forEach((c, i) => {
      const N = c.notes;
      const where = '第 ' + (i + 1) + ' 個和弦';
      // 音域
      N.forEach((n, v) => {
        const m = T.midi(n);
        if (m < RANGE[v][0] - 2 || m > RANGE[v][1] + 2) add('error', i, null, [v], 'range', where + '：' + VOICE[v] + ' ' + zh(n) + ' 超出音域太多');
        else if (m < RANGE[v][0] || m > RANGE[v][1]) add('warn', i, null, [v], 'range', where + '：' + VOICE[v] + ' ' + zh(n) + ' 在常用音域之外');
      });
      // 聲部交錯
      for (let v = 0; v < 3; v++)
        if (T.midi(N[v]) < T.midi(N[v + 1])) add('error', i, null, [v, v + 1], 'crossing', where + '：聲部交錯，' + VOICE[v] + ' ' + zh(N[v]) + ' 比' + VOICE[v + 1] + ' ' + zh(N[v + 1]) + ' 低');
      // 間距
      if (T.midi(N[0]) - T.midi(N[1]) > 12) add('error', i, null, [0, 1], 'spacing', where + '：高音部和中音部相距超過八度');
      if (T.midi(N[1]) - T.midi(N[2]) > 12) add('error', i, null, [1, 2], 'spacing', where + '：中音部和次中音部相距超過八度');
      if (T.midi(N[2]) - T.midi(N[3]) > 19) add('warn', i, null, [2, 3], 'spacing', where + '：次中音部和低音部相距超過十二度');
      // 和弦
      const { ch, rn } = info[i];
      if (!ch) {
        add('error', i, null, [], 'chord', where + '：' + N.map(zh).join('、') + ' 不是三和弦或七和弦（可能少了三音，或有和弦外音）');
      } else {
        if (!ch.seventh && !ch.tones.fifth) add('warn', i, null, [], 'omit5', where + '：省略了五音（可以，但通常根音重複三次）');
        const count = (tone) => N.filter((n) => T.same(n, tone)).length;
        if (ch.seventh && count(ch.tones.seventh) > 1) add('error', i, null, [], 'double7', where + '：七音 ' + T.nameZh(ch.tones.seventh) + ' 重複了');
        const lt = N.filter((n) => isLeading(n)).length;
        if (lt > 1 && rn && (rn.degree === 5 || rn.degree === 7)) add('error', i, null, [], 'doubleLT', where + '：導音 ' + T.nameZh(leading) + ' 重複了');
        if (!ch.seventh && ch.inversion === 0 && ch.tones.fifth && count(ch.root) < 2 && rn && rn.degree !== 7)
          add('info', i, null, [], 'doubling', where + '：原位三和弦通常重複根音（這裡重複的是' + (count(ch.tones.third) > 1 ? '三音' : '五音') + '）');
        if (!ch.seventh && ch.inversion === 2 && count(ch.tones.fifth) < 2) add('warn', i, null, [], 'doubling64', where + '：四六和弦通常重複低音（五音）');
        // 自己標的級數
        if (c.label && rn) {
          const mine = normalizeLabel(c.label);
          // 副屬和弦也可以照根音寫級數（小調結尾的大三和弦＝皮卡第三度 I，不一定是 V/iv）
          const right = [rn.symbol, rn.secondary, rn.secondary ? rn.prefix + rn.roman + rn.qual + rn.figure : null].filter(Boolean);
          // 屬七和弦第三轉位也常寫成 V2
          if (!right.some((r) => r === mine || r.replace(/42(?=$|\/)/, '2') === mine)) add('error', i, null, [], 'label', where + '：級數寫 ' + c.label + '，應該是 ' + rn.symbol + '（' + T.speakRoman(rn.symbol) + '）');
        }
      }
      // 數字低音
      if (c.figure != null && c.figure !== undefined) {
        const ft = figureTones(N[3], c.figure, key);
        if (!ft) add('warn', i, null, [], 'figure', where + '：看不懂數字低音「' + c.figure + '」');
        else {
          const upper = N.slice(0, 3);
          for (const t of ft) {
            const has = upper.some((n) => n.step === t.step);
            const exact = upper.some((n) => n.step === t.step && (n.alter || 0) === t.alter);
            if (has && !exact) add('error', i, null, [], 'figure', where + '：數字低音 [' + c.figure + '] 的 ' + t.num + ' 度音應該是 ' + T.nameZh(t) + '（注意升降）');
            else if (!has && !t.optional) add('error', i, null, [], 'figure', where + '：數字低音 [' + c.figure + '] 要有低音上方 ' + t.num + ' 度的 ' + T.nameZh(t));
          }
          const allowed = new Set([N[3].step].concat(ft.map((t) => t.step)));
          for (const n of upper) if (!allowed.has(n.step)) add('error', i, null, [], 'figure', where + '：' + zh(n) + ' 不在數字低音 [' + c.figure + '] 的和弦裡');
        }
      }
    });

    // 進行
    for (let i = 0; i + 1 < chords.length; i++) {
      const A = chords[i].notes;
      const Bn = chords[i + 1].notes;
      const where = '第 ' + (i + 1) + ' 到第 ' + (i + 2) + ' 個和弦';
      // 每個聲部的旋律
      for (let v = 0; v < 4; v++) {
        if (T.same(A[v], Bn[v]) && A[v].octave === Bn[v].octave) continue;
        const iv = simpleIv(A[v], Bn[v]);
        if (iv.quality === 'A' || iv.quality === 'AA') add('error', i, i + 1, [v], 'melodicAug', where + '：' + VOICE[v] + ' ' + zh(A[v]) + ' 到 ' + zh(Bn[v]) + ' 是' + iv.name + '，不要用增音程進行');
        else if (iv.semitones > 12) add('error', i, i + 1, [v], 'leap', where + '：' + VOICE[v] + ' 跳進超過八度');
        else if (iv.number === 7) add('warn', i, i + 1, [v], 'leap7', where + '：' + VOICE[v] + ' 跳了七度，不好唱');
      }
      // 兩兩聲部
      for (let u = 0; u < 4; u++)
        for (let l = u + 1; l < 4; l++) {
          const p1 = perfectClass(A[l], A[u]);
          const p2 = perfectClass(Bn[l], Bn[u]);
          const du = dir(A[u], Bn[u]);
          const dl = dir(A[l], Bn[l]);
          const pair = VOICE[u] + '與' + VOICE[l];
          const notes = '（' + zh(A[u]) + '→' + zh(Bn[u]) + '、' + zh(A[l]) + '→' + zh(Bn[l]) + '）';
          const kind = (p) => (p === 'P5' ? '五度' : p === 'P1' ? '同度' : '八度');
          const sameClass = p1 && p2 && (p1 === p2 || (p1 !== 'P5' && p2 !== 'P5'));
          if (sameClass && du !== 0 && dl !== 0) {
            if (du === dl) add('error', i, i + 1, [u, l], 'parallel', where + '：' + pair + '平行' + kind(p2) + notes);
            else add('error', i, i + 1, [u, l], 'contrary', where + '：' + pair + '反向' + kind(p2) + notes + '，和平行' + kind(p2) + '一樣要避免');
          } else if (!p1 && p2 && du === dl && du !== 0 && u === 0 && l === 3) {
            // 隱伏五度、八度：外聲部同向進入完全音程，而且高音部是跳進
            const leap = Math.abs(T.dia(Bn[0]) - T.dia(A[0])) > 1;
            if (leap) add('warn', i, i + 1, [u, l], 'hidden', where + '：外聲部同向進入' + kind(p2) + '，高音部又是跳進：隱伏' + kind(p2) + notes);
          }
          // 減五度到完全五度（含低音部）
          if (l === 3 && p2 === 'P5' && simpleIv(A[l], A[u]).quality === 'd' && ((simpleIv(A[l], A[u]).number - 1) % 7) + 1 === 5 && du === dl)
            add('warn', i, i + 1, [u, l], 'unequal5', where + '：' + pair + '由減五度進行到完全五度' + notes);
        }
      // 聲部超越：某聲部走到相鄰聲部前一個音的另一邊
      for (let v = 0; v < 3; v++) {
        if (T.midi(Bn[v]) < T.midi(A[v + 1]) || T.midi(Bn[v + 1]) > T.midi(A[v]))
          add('warn', i, i + 1, [v, v + 1], 'overlap', where + '：' + VOICE[v] + '與' + VOICE[v + 1] + '聲部超越（走過相鄰聲部前一個音）');
      }
      // 導音與七音的解決
      const r1 = info[i].rn;
      const r2 = info[i + 1].rn;
      const c1 = info[i].ch;
      if (r1 && r2 && c1 && (r1.degree === 5 || r1.degree === 7) && !r1.secondary && (r2.degree === 1 || r2.degree === 6) && !r2.secondary) {
        for (let v = 0; v < 4; v++) {
          if (!isLeading(A[v])) continue;
          const up = T.same(Bn[v], tonic) && T.midi(Bn[v]) - T.midi(A[v]) === 1;
          if (up) continue;
          // 內聲部的導音在 V–I 可以下行到五音（課本允許），外聲部一定要上行
          if (v === 0 || v === 3) add('error', i, i + 1, [v], 'leading', where + '：' + VOICE[v] + '的導音 ' + zh(A[v]) + ' 要上行小二度解決到主音');
          else add('warn', i, i + 1, [v], 'leading', where + '：' + VOICE[v] + '的導音 ' + zh(A[v]) + ' 沒有上行解決到主音（內聲部可以下行到五音，但上行比較好）');
        }
      }
      if (c1 && c1.seventh) {
        for (let v = 0; v < 4; v++) {
          if (!T.same(A[v], c1.tones.seventh)) continue;
          const steps = T.dia(Bn[v]) - T.dia(A[v]);
          const stay = steps === 0 && T.midi(Bn[v]) === T.midi(A[v]);
          if (steps === -1 || stay) continue;
          add('error', i, i + 1, [v], 'seventh', where + '：' + VOICE[v] + '的七音 ' + zh(A[v]) + ' 要下行級進解決');
        }
      }
    }
    out.sort((a, b) => a.at - b.at || (a.to == null ? -1 : 1) - (b.to == null ? -1 : 1));
    return { issues: out, info };
  }

  /** 四部和聲 → ABC（四個聲部，給點字樂譜 Sec. 37 合唱格式與五線譜）。value：每個和弦的時值（L 的倍數）。 */
  function toAbc(chords, key, opts) {
    const o = opts || {};
    const f = T.fifthsOf(key.tonic, key.mode) || 0;
    const k = T.keyFromFifths(f);
    const t = key.mode === 'minor' ? k.minor : k.major;
    const kname = t.step + (t.alter > 0 ? '#' : t.alter < 0 ? 'b' : '') + (key.mode === 'minor' ? 'm' : '');
    const ka = {};
    for (const n of T.keySignatureNotes(f)) ka[n.step] = n.alter;
    const per = o.perBar || 4;
    const voiceLine = (v) => {
      const mem = {};
      let s = '';
      const rest = chords.length % per;
      chords.forEach((c, i) => {
        if (i && i % per === 0) {
          s += '| ';
          // 最後一小節不滿：改拍號，不補休止符
          if (rest && i === chords.length - rest) s += '[M:' + rest + '/4] ';
          for (const x in mem) delete mem[x];
        }
        const n = c.notes[v];
        const keyA = ka[n.step] || 0;
        const memKey = n.step + n.octave;
        const cur = memKey in mem ? mem[memKey] : keyA;
        let acc = '';
        if ((n.alter || 0) !== cur) acc = { '-2': '__', '-1': '_', 0: '=', 1: '^', 2: '^^' }[n.alter || 0];
        mem[memKey] = n.alter || 0;
        let name = n.octave >= 5 ? n.step.toLowerCase() : n.step;
        if (n.octave > 5) name += "'".repeat(n.octave - 5);
        if (n.octave < 4) name += ','.repeat(4 - n.octave);
        s += acc + name + ' ';
      });
      return s.trim() + ' |]';
    };
    const first = chords.length < per ? chords.length : per;
    const lines = ['X:1', 'M:' + first + '/4', 'L:1/4', 'K:' + kname];
    const names = ['Soprano', 'Alto', 'Tenor', 'Bass'];
    names.forEach((nm, v) => lines.push('V:' + 'SATB'[v] + ' name="' + nm + '"' + (v >= 2 ? ' clef=bass' : '')));
    names.forEach((nm, v) => lines.push('[V:' + 'SATB'[v] + '] ' + voiceLine(v)));
    return lines.join('\n');
  }

  MB.harmony = { VOICE, VOICE_SHORT, parseText, parseFigure, figureTones, normalizeLabel, check, toAbc };
})(typeof window !== 'undefined' ? window : globalThis);
