/*
 * 樂理練習出題（MB.theoryQuiz）：四選一，題型照音樂班「樂理及基礎和聲」術科常考的內容。
 * 每題 {type, prompt, abc, play, options, answer, explain}：
 * - prompt：題目文字；abc：題目的譜例（轉成點字樂譜與五線譜），沒有譜例時為 null
 * - play：播放順序 [[Note...], ...]（每一組同時發聲）
 * - options：四個選項文字；answer：正確選項的索引；explain：解說
 * 不碰畫面，可以在 Node 測試（tests/theory-test.js）。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const T = MB.theory;

  // ---------- 亂數（可以給種子，測試時固定） ----------
  let rand = Math.random;
  function seed(s) {
    if (s == null) return (rand = Math.random);
    let x = s >>> 0 || 1;
    rand = () => {
      // xorshift32
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      return x / 4294967296;
    };
  }
  const ri = (n) => Math.floor(rand() * n);
  const pick = (a) => a[ri(a.length)];
  function shuffle(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = ri(i + 1);
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  /** 正確答案加三個不重複的干擾選項，打亂後回傳 {options, answer}。 */
  function options4(correct, distractors) {
    const seen = new Set([correct]);
    const d = [];
    for (const x of shuffle(distractors)) {
      if (x == null || seen.has(x)) continue;
      seen.add(x);
      d.push(x);
      if (d.length === 3) break;
    }
    if (d.length < 3) throw new Error('干擾選項不足：' + correct);
    const opts = shuffle([correct].concat(d));
    return { options: opts, answer: opts.indexOf(correct) };
  }

  // ---------- 譜例（ABC） ----------
  /** Note → ABC 音符（keyAlt：調號的升降，相同就不寫臨時記號）。 */
  function abcNote(n, keyAlt) {
    const ka = (keyAlt && keyAlt[n.step]) || 0;
    const a = n.alter || 0;
    let acc = '';
    if (a !== ka) acc = { '-2': '__', '-1': '_', 0: '=', 1: '^', 2: '^^' }[a];
    let s = n.octave >= 5 ? n.step.toLowerCase() : n.step;
    if (n.octave > 5) s += "'".repeat(n.octave - 5);
    if (n.octave < 4) s += ','.repeat(4 - n.octave);
    return acc + s;
  }
  function keyAlters(fifths) {
    const alt = {};
    for (const n of T.keySignatureNotes(fifths || 0)) alt[n.step] = n.alter;
    return alt;
  }
  function abcKey(fifths, mode) {
    const k = T.keyFromFifths(fifths || 0);
    const t = mode === 'minor' ? k.minor : k.major;
    return t.step + (t.alter > 0 ? '#' : t.alter < 0 ? 'b' : '') + (mode === 'minor' ? 'm' : '');
  }
  /** 譜號：音大多在中央 C 以下用低音譜號。 */
  function clefFor(notes) {
    const avg = notes.reduce((s, n) => s + T.midi(n), 0) / notes.length;
    return avg < 57 ? ' clef=bass' : '';
  }
  /** groups：[[Note...]]，每一組一個音（或和弦）；value：L 的分母倍數。 */
  function abcOf(groups, opts) {
    const o = opts || {};
    const fifths = o.fifths || 0;
    const ka = keyAlters(fifths);
    const all = groups.flat();
    const body = groups
      .map((gr) => {
        const s = gr.map((n) => abcNote(n, ka)).join('');
        return (gr.length > 1 ? '[' + s + ']' : s) + (o.len || '');
      })
      .join(o.sep || ' ');
    // 拍號設成剛好一小節（點字才不會因為超過拍號加上大小時值記號；顯示時會拿掉拍號）
    const [un, ud] = (o.unit || '1/2').split('/').map(Number);
    return 'X:1\nM:' + groups.length * un + '/' + ud + '\nL:' + (o.unit || '1/2') + '\nK:' + abcKey(fifths, o.mode) + clefFor(all) + '\n' + body + ' |]';
  }

  const zh = (n) => T.nameZh(n);
  const zhList = (ns) => ns.map(zh).join('、');
  const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  // ---------- 出題 ----------
  const LOW_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  function randomNote(level, octave) {
    const step = pick(LOW_STEPS);
    let alter = 0;
    if (level >= 2 && rand() < 0.45) alter = pick([1, -1]);
    return { step, alter, octave: octave == null ? 4 : octave };
  }

  // 1. 音程
  const IV_BASIC = [
    ['m', 2], ['M', 2], ['m', 3], ['M', 3], ['P', 4], ['A', 4], ['d', 5], ['P', 5], ['m', 6], ['M', 6], ['m', 7], ['M', 7], ['P', 8],
  ];
  const IV_ADV = IV_BASIC.concat([
    ['A', 2], ['d', 3], ['d', 4], ['A', 5], ['A', 6], ['d', 7], ['d', 8], ['A', 1], ['m', 9], ['M', 9], ['m', 10], ['M', 10],
  ]);
  function qInterval(level) {
    for (let tries = 0; tries < 50; tries++) {
      const [q, n] = pick(level >= 2 ? IV_ADV : IV_BASIC);
      const lo = randomNote(level, n > 8 ? 3 : pick([3, 4]));
      const hi = T.transpose(lo, q, n);
      if (Math.abs(hi.alter) > (level >= 2 ? 2 : 1)) continue;
      const iv = T.interval(lo, hi);
      const correct = iv.name;
      const quals = n === 1 || n === 4 || n === 5 || n === 8 || n === 11 || n === 12 ? ['P', 'A', 'd'] : ['M', 'm', 'A', 'd'];
      const dis = quals.filter((x) => x !== q).map((x) => T.intervalName(x, n));
      for (const dn of [n - 1, n + 1]) if (dn >= 1) dis.push(T.intervalName(dn === 1 || dn === 4 || dn === 5 || dn === 8 ? pick(['P', 'A', 'd']) : pick(['M', 'm']), dn));
      const harmonic = rand() < 0.3;
      const steps = [];
      for (let k = 0; k < n; k++) steps.push(T.STEPS[(T.STEPS.indexOf(lo.step) + k) % 7]);
      return Object.assign(
        {
          type: 'interval',
          data: { lo, hi },
          prompt: '下面' + (harmonic ? '同時發出的' : '先後出現的') + '兩個音，音程是？（' + zh(lo) + ' 到 ' + zh(hi) + '）',
          abc: abcOf(harmonic ? [[lo, hi]] : [[lo], [hi]], { unit: harmonic ? '1/1' : '1/2' }),
          play: harmonic ? [[lo], [hi], [lo, hi]] : [[lo], [hi]],
          explain:
            zh(lo) + ' 到 ' + zh(hi) + '：音名數 ' + (n <= 8 ? steps.join(' ') + '，' : '') + '是 ' + (NUM[n] || n) + '度；' +
            '相差 ' + iv.semitones + ' 個半音，所以是' + correct + '。',
        },
        options4(correct, dis)
      );
    }
    throw new Error('出不了音程題');
  }

  // 2. 三和弦、七和弦的性質
  const TRIAD_CODES = ['M', 'm', 'd', 'A'];
  const SEVENTH_CODES = ['Mm7', 'MM7', 'mm7', 'dm7', 'dd7'];
  const typeName = (code) => T.CHORD_TYPES.find((t) => t[0] === code)[1];
  function describeChord(c) {
    const lowR = { ...c.root, octave: 0 };
    const up = (x) => {
      let h = { ...x, octave: 0 };
      if (T.dia(h) <= T.dia(lowR)) h = { ...h, octave: 1 };
      return T.interval(lowR, h).name;
    };
    let s = '根音 ' + zh(c.root) + '；三音 ' + zh(c.tones.third) + '（' + up(c.tones.third) + '）';
    if (c.tones.fifth) s += '、五音 ' + zh(c.tones.fifth) + '（' + up(c.tones.fifth) + '）';
    if (c.tones.seventh) s += '、七音 ' + zh(c.tones.seventh) + '（' + up(c.tones.seventh) + '）';
    return s;
  }
  function voiceChord(tones, inversion) {
    // 第 inversion 個和弦音放最低，其餘依序往上堆
    const order = tones.slice(inversion).concat(tones.slice(0, inversion));
    const out = [{ ...order[0] }];
    for (let k = 1; k < order.length; k++) {
      let n = { ...order[k], octave: out[k - 1].octave };
      while (T.dia(n) <= T.dia(out[k - 1])) n = { ...n, octave: n.octave + 1 };
      out.push(n);
    }
    return out;
  }
  function qChordQuality(level, seventh) {
    for (let tries = 0; tries < 50; tries++) {
      const code = pick(seventh ? SEVENTH_CODES : TRIAD_CODES);
      const root = randomNote(level, seventh ? 3 : pick([3, 4]));
      const tones = T.buildChord(root, code);
      if (tones.some((n) => Math.abs(n.alter) > (level >= 2 ? 2 : 1))) continue;
      const inv = level >= 2 ? ri(tones.length) : 0;
      const voiced = voiceChord(tones, inv);
      const c = T.identifyChord(voiced);
      const correct = c.name;
      const pool = seventh ? SEVENTH_CODES.map(typeName) : TRIAD_CODES.map(typeName);
      return Object.assign(
        {
          type: seventh ? 'seventh' : 'triad',
          data: { voiced },
          prompt: '下面的和弦是哪一種' + (seventh ? '七和弦' : '三和弦') + '？（由低到高：' + zhList(voiced) + '）',
          abc: abcOf([voiced], { unit: '1/1' }),
          play: [voiced.map((n) => n), ...voiced.map((n) => [n]), voiced],
          explain: (inv ? '最低音不是根音，先排回三度堆疊。' : '') + describeChord(c) + '，所以是' + correct + '。',
        },
        options4(correct, pool.filter((x) => x !== correct))
      );
    }
    throw new Error('出不了和弦題');
  }

  // 3. 和弦級數與轉位
  const KEYS_BASIC = [-3, -2, -1, 0, 1, 2, 3];
  const KEYS_ADV = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  function qRoman(level) {
    for (let tries = 0; tries < 80; tries++) {
      const fifths = pick(level >= 2 ? KEYS_ADV : KEYS_BASIC);
      const mode = level >= 2 && rand() < 0.4 ? 'minor' : 'major';
      const k = T.keyFromFifths(fifths);
      const key = { tonic: mode === 'minor' ? k.minor : k.major, mode };
      const seventh = rand() < (level >= 2 ? 0.4 : 0.25);
      let degree = pick(seventh ? [2, 5, 5, 7] : [1, 2, 4, 5, 6, 1, 4, 5]);
      if (mode === 'minor' && !seventh) degree = pick([1, 4, 5, 6, 2]);
      const tones = T.diatonicTriad(key, degree, seventh).map((n) => ({ ...n, octave: n.octave - 1 }));
      const inv = ri(tones.length);
      const voiced = voiceChord(tones, inv);
      const c = T.identifyChord(voiced);
      const rn = T.romanNumeral(c, key);
      if (!rn) continue;
      const correct = rn.symbol;
      const figs = seventh ? ['7', '65', '43', '42'] : ['', '6', '64'];
      const base = rn.prefix + rn.roman + rn.qual;
      const dis = figs.filter((f) => f !== rn.figure).map((f) => base + f);
      // 換一個級數、同樣轉位
      for (const d of [degree + 1, degree - 1, degree + 4]) {
        const dd = ((d - 1 + 70) % 7) + 1;
        const c2 = T.identifyChord(T.diatonicTriad(key, dd, seventh));
        const r2 = c2 && T.romanNumeral(c2, key);
        if (r2) dis.push(r2.prefix + r2.roman + r2.qual + rn.figure);
      }
      const keyZh = T.keyNameZh(key.tonic, mode);
      const bassRole = { 0: '根音', 1: '三音', 2: '五音', 3: '七音' }[c.inversion];
      return Object.assign(
        {
          type: 'roman',
          data: { voiced, key },
          prompt: keyZh + '，下面和弦的級數（含轉位）是？（由低到高：' + zhList(voiced) + '）',
          abc: abcOf([voiced], { unit: '1/1', fifths, mode }),
          play: [voiced, [voiced[0]], voiced],
          explain:
            describeChord(c) + '：' + c.name + '。' + zh(c.root) + ' 是' + keyZh + '的第' + NUM[rn.degree] + '級；' +
            '最低音 ' + zh(voiced[0]) + ' 是' + bassRole + '，' + c.inversionName + (rn.figure ? '，數字寫 ' + rn.figure.split('').join('/') : '') + '。所以是 ' + correct + '（念作' + T.speakRoman(correct) + '）。',
          speakOptions: true,
        },
        options4(correct, dis)
      );
    }
    throw new Error('出不了級數題');
  }

  // 4. 等音
  function qEnharmonic(level) {
    for (let tries = 0; tries < 50; tries++) {
      const n = randomNote(2, 4);
      if (level >= 2 && rand() < 0.3) n.alter = pick([2, -2]);
      if (!n.alter && rand() < 0.7) continue; // 多半出有升降記號的音
      const ens = T.enharmonics(n).filter((e) => Math.abs(e.alter) <= (level >= 2 ? 2 : 1));
      if (!ens.length) continue;
      const right = pick(ens);
      const correct = '' + zh(right);
      // 干擾：差半音的音、同音名不同升降
      const dis = [];
      for (const d of [-1, 1]) {
        for (const e of [T.transpose(right, 'm', 2, d), T.transpose(right, 'A', 1, d)]) if (Math.abs(e.alter) <= 2 && !T.same(e, n)) dis.push(zh(e));
      }
      dis.push(zh({ step: right.step, alter: right.alter ? 0 : pick([1, -1]), octave: 4 }));
      dis.push(zh({ ...n, alter: -n.alter || 1 }));
      const filtered = dis.filter((x) => x !== zh(n) && !ens.some((e) => zh(e) === x));
      return Object.assign(
        {
          type: 'enharmonic',
          data: { n },
          prompt: zh(n) + ' 音的等音（異名同音）是？',
          abc: abcOf([[n]], { unit: '1/1' }),
          play: [[n]],
          explain: zh(n) + ' 和 ' + correct + ' 在鋼琴上是同一個鍵，音高相同、寫法不同，叫做等音。',
        },
        options4(correct, filtered)
      );
    }
    throw new Error('出不了等音題');
  }

  // 5. 移調樂器
  function qTranspose(level) {
    for (let tries = 0; tries < 50; tries++) {
      const inst = pick(level >= 2 ? ['Bb', 'A', 'F', 'Eb'] : ['Bb', 'A', 'F']);
      const t = T.TRANSPOSING[inst];
      const concert = randomNote(level, 4);
      const w = T.writtenPitch(concert, inst);
      if (Math.abs(w.alter) > 1) continue;
      const correct = zh(w);
      const dis = [
        zh(T.transpose(concert, t.q, t.n, -t.dir)), // 方向弄反
        zh(concert), // 沒移調
      ];
      for (const other of Object.keys(T.TRANSPOSING)) if (other !== inst) dis.push(zh(T.writtenPitch(concert, other)));
      return Object.assign(
        {
          type: 'transpose',
          data: { concert, inst },
          prompt: '實際音高是 ' + zh(concert) + '，改由' + t.name.replace(/（.*）/, '') + '樂器演奏，要記成哪一個音？',
          abc: abcOf([[concert]], { unit: '1/1' }),
          play: [[concert]],
          explain:
            t.name + '樂器的記譜音比實際音高' + (t.dir > 0 ? '高' : '低') + T.intervalName(t.q, t.n) + '（吹奏記譜的 C，聽起來是 ' + zh(T.transpose({ step: 'C', alter: 0, octave: 4 }, t.q, t.n, -t.dir)) + '）。' +
            zh(concert) + ' 往' + (t.dir > 0 ? '上' : '下') + T.intervalName(t.q, t.n) + '是 ' + correct + '。',
        },
        options4(correct, dis.filter((x) => x !== correct))
      );
    }
    throw new Error('出不了移調題');
  }

  // 6. 音階
  const SCALE_BASIC = ['major', 'natural', 'harmonic', 'melodic', 'wholetone', 'pentatonic'];
  const SCALE_ADV = SCALE_BASIC.concat(['dorian', 'phrygian', 'lydian', 'mixolydian']);
  function qScale(level) {
    for (let tries = 0; tries < 50; tries++) {
      const type = pick(level >= 2 ? SCALE_ADV : SCALE_BASIC);
      const tonic = randomNote(level >= 2 ? 2 : 1, 4);
      const sc = T.scale(tonic, type);
      if (sc.some((n) => Math.abs(n.alter) > 1)) continue;
      const notes = sc.concat([{ ...tonic, octave: tonic.octave + 1 }]);
      const st = T.SCALE_TYPES[type];
      const pool = (level >= 2 ? SCALE_ADV : SCALE_BASIC).filter((x) => x !== type).map((x) => T.SCALE_TYPES[x].name);
      const correct = st.name;
      const explainSteps = [];
      for (let k = 1; k < notes.length; k++) {
        const s = T.midi(notes[k]) - T.midi(notes[k - 1]);
        explainSteps.push(s === 1 ? '半' : s === 2 ? '全' : s === 3 ? '增二度' : s + '個半音');
      }
      return Object.assign(
        {
          type: 'scale',
          data: { notes, scaleType: type },
          prompt: '從 ' + zh(tonic) + ' 開始往上的這些音，組成什麼音階？（' + zhList(notes) + '）',
          abc: abcOf(notes.map((n) => [n]), { unit: '1/4' }),
          play: notes.map((n) => [n]),
          explain: '相鄰兩音的距離：' + explainSteps.join('、') + '。這是' + correct + (st.church ? '，屬於教會調式' : '') + '。',
        },
        options4(correct, pool)
      );
    }
    throw new Error('出不了音階題');
  }

  // 7. 調號
  function qKeySig(level) {
    const fifths = pick(level >= 2 ? [-7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7] : [-4, -3, -2, -1, 1, 2, 3, 4]);
    const mode = level >= 2 && rand() < 0.5 ? 'minor' : 'major';
    const k = T.keyFromFifths(fifths);
    const correct = T.keyNameZh(mode === 'minor' ? k.minor : k.major, mode);
    const dis = [];
    for (const d of [-1, 1, -2, 2]) {
      const k2 = T.keyFromFifths(fifths + d);
      if (Math.abs(fifths + d) <= 7) dis.push(T.keyNameZh(mode === 'minor' ? k2.minor : k2.major, mode));
    }
    dis.push(T.keyNameZh(mode === 'minor' ? k.major : k.minor, mode === 'minor' ? 'major' : 'minor'));
    const sig = T.keySignatureNotes(fifths);
    const kind = fifths > 0 ? '升記號' : '降記號';
    return Object.assign(
      {
        type: 'keysig',
        data: { fifths, mode },
        prompt: '調號有 ' + Math.abs(fifths) + ' 個' + kind + '（' + zhList(sig) + '）的' + (mode === 'minor' ? '小調' : '大調') + '是？',
        abc: 'X:1\nM:none\nL:1/1\nK:' + abcKey(fifths, mode) + '\nx |]',
        play: [],
        explain:
          (fifths > 0 ? '升記號調：最後一個升記號（' + zh(sig[sig.length - 1]) + '）往上小二度就是大調主音' : fifths === -1 ? '一個降記號是 F 大調' : '降記號調：倒數第二個降記號就是大調主音（' + zh(sig[sig.length - 2]) + '）') +
          '，所以是' + T.keyNameZh(k.major, 'major') + '；關係小調在大調主音往下小三度，是' + T.keyNameZh(k.minor, 'minor') + '。',
        keySigOnly: true,
      },
      options4(correct, dis)
    );
  }

  // 8. 時值（休止符加總，以八分休止符計）
  const RESTS = [
    { abc: 'z4', zh: '二分休止符', eighths: 4 },
    { abc: 'z2', zh: '四分休止符', eighths: 2 },
    { abc: 'z', zh: '八分休止符', eighths: 1 },
    { abc: 'z3', zh: '附點四分休止符', eighths: 3 },
    { abc: 'z/', zh: '十六分休止符', eighths: 0.5 },
    { abc: 'z6', zh: '附點二分休止符', eighths: 6 },
  ];
  function qRests(level) {
    const pool = level >= 2 ? RESTS : RESTS.slice(0, 4);
    for (let tries = 0; tries < 50; tries++) {
      const n = 2 + ri(level >= 2 ? 4 : 3);
      const rs = [];
      for (let k = 0; k < n; k++) rs.push(pick(pool));
      const total = rs.reduce((s, r) => s + r.eighths, 0);
      if (total !== Math.floor(total)) continue;
      const correct = total + ' 個';
      const dis = [total - 1, total + 1, total - 2, total + 2, total * 2, total + 3].filter((x) => x > 0).map((x) => x + ' 個');
      return Object.assign(
        {
          type: 'rests',
          data: { total },
          prompt: '下面的休止符加起來，等於多少個八分休止符？（' + rs.map((r) => r.zh).join('、') + '）',
          abc: 'X:1\nM:' + total + '/8\nL:1/8\nK:C\n' + rs.map((r) => r.abc).join(' ') + ' |]',
          play: [],
          explain: rs.map((r) => r.zh + ' ' + r.eighths).join(' + ') + ' = ' + total + ' 個八分休止符。',
        },
        options4(correct, dis)
      );
    }
    throw new Error('出不了時值題');
  }

  const TYPES = {
    interval: { name: '音程', make: qInterval },
    triad: { name: '三和弦性質', make: (l) => qChordQuality(l, false) },
    seventh: { name: '七和弦性質', make: (l) => qChordQuality(l, true) },
    roman: { name: '和弦級數與轉位', make: qRoman },
    enharmonic: { name: '等音', make: qEnharmonic },
    transpose: { name: '移調樂器', make: qTranspose },
    scale: { name: '音階', make: qScale },
    keysig: { name: '調號', make: qKeySig },
    rests: { name: '休止符時值', make: qRests },
  };

  /** 出一題：types 是題型代號陣列，level 1 基本、2 進階。 */
  function make(types, level) {
    const list = types && types.length ? types : Object.keys(TYPES);
    const t = pick(list);
    return TYPES[t].make(level || 1);
  }

  MB.theoryQuiz = { TYPES, make, seed, abcOf, abcNote };
})(typeof window !== 'undefined' ? window : globalThis);
