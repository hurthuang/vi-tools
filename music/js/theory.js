/*
 * 樂理運算（MB.theory）：音程、和弦（性質、轉位、級數）、音階、調號、移調、等音。
 * 不碰畫面，可以在 Node 測試（tests/theory-test.js，並以 music21 核對：tests/theory_m21.py）。
 *
 * 音 Note = {step: 'C'..'B', alter: -2..2, octave: 整數}（octave 照科學音高，中央 C = C4）。
 * 用語照臺灣國中、高中音樂課本與音樂班術科試題：完全／大／小／增／減、原位／第一轉位…、
 * 級數大寫為大三、增三和弦，小寫為小三、減三和弦。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});

  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // 各度數（單音程）在「大或完全」時的半音數
  const BASE_SEMI = [0, 2, 4, 5, 7, 9, 11];
  const PERFECT = [true, false, false, true, true, false, false];

  const dia = (n) => n.octave * 7 + STEPS.indexOf(n.step);
  const midi = (n) => (n.octave + 1) * 12 + SEMI[n.step] + (n.alter || 0);
  const pc = (n) => (((SEMI[n.step] + (n.alter || 0)) % 12) + 12) % 12;
  const same = (a, b) => a.step === b.step && (a.alter || 0) === (b.alter || 0);

  // ---------- 音名 ----------
  const ACC_ZH = { '-2': '重降', '-1': '降', 0: '', 1: '升', 2: '重升' };
  const ACC_EN = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };

  /** 中文音名：升 F、降 B、重升 C。opts.octave 加上八度（中央 C 為 C4）。 */
  function nameZh(n, opts) {
    const a = ACC_ZH[n.alter || 0];
    return (a ? a + ' ' : '') + n.step + (opts && opts.octave ? n.octave : '');
  }
  /** 英文音名：F#、Bb、C##。 */
  function nameEn(n, opts) {
    return n.step + ACC_EN[n.alter || 0] + (opts && opts.octave ? n.octave : '');
  }
  /** 讀音名：'F#4'、'Bb'、'C##3'、'Ebb'；沒寫八度當 4。 */
  function parseNote(s) {
    const m = /^\s*([A-Ga-g])(##|#|x|bb|b|♯|♭)?(-?\d+)?\s*$/.exec(s);
    if (!m) return null;
    const acc = { '#': 1, '♯': 1, '##': 2, x: 2, b: -1, '♭': -1, bb: -2 }[m[2] || ''] || 0;
    return { step: m[1].toUpperCase(), alter: acc, octave: m[3] !== undefined ? +m[3] : 4 };
  }

  // ---------- 音程 ----------
  const NUM_ZH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
  const QUAL_ZH = { P: '完全', M: '大', m: '小', A: '增', d: '減', AA: '倍增', dd: '倍減' };

  /**
   * 兩音之間的音程（不論先後，由低到高算）。
   * 回傳 {number: 度數（複音程照實際，如 10）, simple: 1..8, quality: 'P'|'M'|'m'|'A'|'d'|'AA'|'dd', semitones, name: '大三度'}
   * 無法命名（例如三增）時 quality 為 null。
   */
  function interval(a, b) {
    let lo = a;
    let hi = b;
    if (dia(b) < dia(a) || (dia(b) === dia(a) && midi(b) < midi(a))) {
      lo = b;
      hi = a;
    }
    const steps = dia(hi) - dia(lo);
    const number = steps + 1;
    const semitones = midi(hi) - midi(lo);
    const simpleIdx = steps % 7;
    const octaves = Math.floor(steps / 7);
    const diff = semitones - (BASE_SEMI[simpleIdx] + 12 * octaves);
    let quality = null;
    if (PERFECT[simpleIdx]) quality = { 0: 'P', 1: 'A', '-1': 'd', 2: 'AA', '-2': 'dd' }[diff] || null;
    else quality = { 0: 'M', '-1': 'm', 1: 'A', '-2': 'd', 2: 'AA', '-3': 'dd' }[diff] || null;
    // 減一度不存在（會變成反方向的增一度），這裡由低到高排過，不會出現
    const simple = number === 8 ? 8 : simpleIdx + 1;
    return { number, simple, quality, semitones, name: quality ? intervalName(quality, number) : null };
  }

  function intervalName(quality, number) {
    return QUAL_ZH[quality] + (NUM_ZH[number] || number) + '度';
  }

  /** 由某音往上（dir=1）或往下（dir=-1）加一個音程：quality、number（1 起）。 */
  function transpose(n, quality, number, dir) {
    dir = dir || 1;
    const steps = number - 1;
    const simpleIdx = steps % 7;
    const octaves = Math.floor(steps / 7);
    let semis = BASE_SEMI[simpleIdx] + 12 * octaves;
    if (PERFECT[simpleIdx]) semis += { P: 0, A: 1, d: -1, AA: 2, dd: -2 }[quality];
    else semis += { M: 0, m: -1, A: 1, d: -2, AA: 2, dd: -3 }[quality];
    const d = dia(n) + dir * steps;
    const step = STEPS[((d % 7) + 7) % 7];
    const octave = Math.floor(d / 7);
    const target = midi(n) + dir * semis;
    const alter = target - ((octave + 1) * 12 + SEMI[step]);
    return { step, alter, octave };
  }

  // ---------- 等音 ----------
  /** 與 n 同音高的其他寫法（升降最多兩個）。 */
  function enharmonics(n) {
    const out = [];
    const m = midi(n);
    for (const off of [-2, -1, 1, 2]) {
      const d = dia(n) + off;
      const step = STEPS[((d % 7) + 7) % 7];
      const octave = Math.floor(d / 7);
      const alter = m - ((octave + 1) * 12 + SEMI[step]);
      if (Math.abs(alter) <= 2) out.push({ step, alter, octave });
    }
    return out;
  }

  // ---------- 和弦 ----------
  const CHORD_TYPES = [
    // [代號, 名稱, 三度、五度、七度的音程性質（null 表示沒有七度）]
    ['M', '大三和弦', 'M', 'P', null],
    ['m', '小三和弦', 'm', 'P', null],
    ['d', '減三和弦', 'm', 'd', null],
    ['A', '增三和弦', 'M', 'A', null],
    ['Mm7', '屬七和弦', 'M', 'P', 'm'], // 大小七和弦
    ['MM7', '大七和弦', 'M', 'P', 'M'],
    ['mm7', '小七和弦', 'm', 'P', 'm'],
    ['dm7', '半減七和弦', 'm', 'd', 'm'],
    ['dd7', '減七和弦', 'm', 'd', 'd'],
    ['mM7', '小大七和弦', 'm', 'P', 'M'],
    ['AM7', '增大七和弦', 'M', 'A', 'M'],
  ];
  const CHORD_BY_CODE = Object.fromEntries(CHORD_TYPES.map((t) => [t[0], t]));
  const INV_ZH = ['原位', '第一轉位', '第二轉位', '第三轉位'];
  const FIG_TRIAD = ['', '6', '64'];
  const FIG_SEVENTH = ['7', '65', '43', '42'];

  /**
   * 辨認和弦。notes：任意順序、可重複（四部和聲）；最低音當低音。
   * 回傳 {root, bass, type: 'M'..., name: '屬七和弦', seventh: bool, inversion: 0..3, inversionName, figure: '65', tones: {root, third, fifth, seventh}}
   * 無法用三度堆疊解釋時回傳 null。省略五度的七和弦（V7 常見）也認得。
   */
  function identifyChord(notes) {
    if (!notes || !notes.length) return null;
    const sorted = notes.slice().sort((a, b) => midi(a) - midi(b) || dia(a) - dia(b));
    const bass = sorted[0];
    // 不同的音名（含升降）
    const uniq = [];
    for (const n of sorted) if (!uniq.some((u) => same(u, n))) uniq.push(n);
    if (uniq.length < 2) return null;
    for (const r of uniq) {
      const roles = {};
      let ok = true;
      for (const n of uniq) {
        const d = (((STEPS.indexOf(n.step) - STEPS.indexOf(r.step)) % 7) + 7) % 7;
        const role = { 0: 'root', 2: 'third', 4: 'fifth', 6: 'seventh' }[d];
        if (!role || roles[role]) {
          ok = false;
          break;
        }
        roles[role] = n;
      }
      if (!ok || !roles.third) continue;
      const q = (x) => {
        if (!x) return null;
        const lowR = { step: r.step, alter: r.alter, octave: 0 };
        let hi = { step: x.step, alter: x.alter, octave: 0 };
        if (dia(hi) <= dia(lowR)) hi = { ...hi, octave: 1 };
        return interval(lowR, hi).quality;
      };
      const q3 = q(roles.third);
      const q5 = roles.fifth ? q(roles.fifth) : null;
      const q7 = roles.seventh ? q(roles.seventh) : null;
      let type = null;
      for (const t of CHORD_TYPES) {
        if (t[2] !== q3) continue;
        if (!!t[4] !== !!q7) continue;
        if (q7 && t[4] !== q7) continue;
        // 省略五度（四部和聲常見）：視為完全五度的那一種（大三、小三、屬七、大七、小七）
        if (q5 ? t[3] !== q5 : t[3] !== 'P') continue;
        type = t;
        break;
      }
      if (!type) continue;
      const bassRole = Object.keys(roles).find((k) => same(roles[k], bass));
      const inversion = { root: 0, third: 1, fifth: 2, seventh: 3 }[bassRole];
      const seventh = !!type[4];
      return {
        root: roles.root,
        bass,
        type: type[0],
        name: type[1],
        seventh,
        inversion,
        inversionName: INV_ZH[inversion],
        figure: seventh ? FIG_SEVENTH[inversion] : FIG_TRIAD[inversion],
        tones: roles,
        omitFifth: !roles.fifth,
      };
    }
    return null;
  }

  // 由根音與和弦種類寫出和弦音（root 的八度起往上堆）
  function buildChord(root, code) {
    const t = CHORD_BY_CODE[code];
    const out = [root, transpose(root, t[2], 3)];
    out.push(transpose(root, t[3], 5));
    if (t[4]) out.push(transpose(root, t[4], 7));
    return out;
  }

  // ---------- 調 ----------
  const MAJOR_STEPS = [
    ['P', 1], ['M', 2], ['M', 3], ['P', 4], ['P', 5], ['M', 6], ['M', 7],
  ];
  const SCALE_TYPES = {
    major: { name: '大調音階', iv: [['P', 1], ['M', 2], ['M', 3], ['P', 4], ['P', 5], ['M', 6], ['M', 7]] },
    natural: { name: '自然小音階', iv: [['P', 1], ['M', 2], ['m', 3], ['P', 4], ['P', 5], ['m', 6], ['m', 7]] },
    harmonic: { name: '和聲小音階', iv: [['P', 1], ['M', 2], ['m', 3], ['P', 4], ['P', 5], ['m', 6], ['M', 7]] },
    melodic: { name: '旋律小音階（上行）', iv: [['P', 1], ['M', 2], ['m', 3], ['P', 4], ['P', 5], ['M', 6], ['M', 7]] },
    dorian: { name: '多利安調式（Dorian）', church: true, iv: [['P', 1], ['M', 2], ['m', 3], ['P', 4], ['P', 5], ['M', 6], ['m', 7]] },
    phrygian: { name: '弗里吉安調式（Phrygian）', church: true, iv: [['P', 1], ['m', 2], ['m', 3], ['P', 4], ['P', 5], ['m', 6], ['m', 7]] },
    lydian: { name: '利地安調式（Lydian）', church: true, iv: [['P', 1], ['M', 2], ['M', 3], ['A', 4], ['P', 5], ['M', 6], ['M', 7]] },
    mixolydian: { name: '混合利地安調式（Mixolydian）', church: true, iv: [['P', 1], ['M', 2], ['M', 3], ['P', 4], ['P', 5], ['M', 6], ['m', 7]] },
    locrian: { name: '洛克利安調式（Locrian）', church: true, iv: [['P', 1], ['m', 2], ['m', 3], ['P', 4], ['d', 5], ['m', 6], ['m', 7]] },
    wholetone: { name: '全音音階', iv: [['P', 1], ['M', 2], ['M', 3], ['A', 4], ['A', 5], ['A', 6]] },
    pentatonic: { name: '五聲音階', iv: [['P', 1], ['M', 2], ['M', 3], ['P', 5], ['M', 6]] },
  };

  /** 由主音寫出音階（往上，一個八度內，不含最上面的主音）。 */
  function scale(tonic, type) {
    return SCALE_TYPES[type].iv.map(([q, n]) => transpose(tonic, q, n));
  }

  /**
   * 由一串音判斷音階種類（只看音高類別，與順序、八度無關）。
   * 回傳 [{type, name, tonic}]：所有音高類別剛好相同的音階。全音音階不分主音，只回一個。
   */
  function identifyScale(notes) {
    const set = new Set(notes.map(pc));
    const out = [];
    for (const [type, st] of Object.entries(SCALE_TYPES)) {
      if (st.iv.length !== set.size) continue;
      for (const n of notes) {
        const tonic = { step: n.step, alter: n.alter || 0, octave: 4 };
        const s = scale(tonic, type).map(pc);
        if (s.every((p) => set.has(p))) {
          if (!out.some((o) => o.type === type && (type === 'wholetone' || pc(o.tonic) === pc(tonic)))) out.push({ type, name: st.name, tonic });
          if (type === 'wholetone') break;
        }
      }
    }
    return out;
  }

  const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  /** 調號（升記號為正、降記號為負）→ 大調主音、關係小調主音。 */
  function keyFromFifths(fifths) {
    let major = { step: 'C', alter: 0, octave: 4 };
    for (let i = 0; i < Math.abs(fifths); i++) major = transpose(major, 'P', 5, fifths > 0 ? 1 : -1);
    major = { ...major, octave: 4 };
    const minor = { ...transpose(major, 'm', 3, -1), octave: 4 };
    return { major, minor };
  }
  /** 主音與大小調 → 調號數。 */
  function fifthsOf(tonic, mode) {
    const t = mode === 'minor' ? transpose({ ...tonic, octave: 4 }, 'm', 3) : tonic;
    for (let f = -7; f <= 7; f++) if (same(keyFromFifths(f).major, t)) return f;
    return null;
  }
  /** 調號裡有哪些升降記號（照書寫順序）。 */
  function keySignatureNotes(fifths) {
    if (fifths > 0) return SHARP_ORDER.slice(0, fifths).map((s) => ({ step: s, alter: 1, octave: 4 }));
    return SHARP_ORDER.slice().reverse().slice(0, -fifths).map((s) => ({ step: s, alter: -1, octave: 4 }));
  }
  /** 調名：'降 A 大調'、'升 f 小調'（小調主音小寫，跟課本一樣）。 */
  function keyNameZh(tonic, mode) {
    const a = ACC_ZH[tonic.alter || 0];
    const s = mode === 'minor' ? tonic.step.toLowerCase() : tonic.step;
    return (a ? a + ' ' : '') + s + (mode === 'minor' ? ' 小調' : ' 大調');
  }

  // ---------- 級數 ----------
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  /**
   * 和弦在某調的級數。key = {tonic: Note, mode: 'major'|'minor'}。
   * 小調依和聲小音階（V、vii° 用升高的導音），自然小音階的 VII、v 也認得。
   * 回傳 {degree: 1..7, roman: 'V', symbol: 'V65'（顯示用）, quality 符號, chromatic: 根音是否在調外, secondary: 'V/V' 之類 | null}
   */
  function romanNumeral(chord, key) {
    if (!chord) return null;
    const tonic = { ...key.tonic, octave: 0 };
    const r = { ...chord.root, octave: 0 };
    let rr = r;
    if (dia(rr) < dia(tonic)) rr = { ...rr, octave: 1 };
    const iv = interval(tonic, rr);
    const degree = iv.simple === 8 ? 1 : iv.simple;
    const scaleType = key.mode === 'minor' ? 'harmonic' : 'major';
    const sc = scale({ ...key.tonic, octave: 4 }, scaleType);
    const nat = key.mode === 'minor' ? scale({ ...key.tonic, octave: 4 }, 'natural') : sc;
    // 調內的音：大調用大音階；小調把自然、和聲、旋律小音階都算進來（六、七級升不升都算調內）
    const allowed = key.mode === 'minor' ? nat.concat(sc, scale({ ...key.tonic, octave: 4 }, 'melodic')) : sc;
    const inKey = (n) => allowed.some((s) => same(s, n));
    const rootPrefix = (() => {
      if (inKey(chord.root)) return '';
      const a = (chord.root.alter || 0) - (nat[degree - 1].alter || 0);
      return a > 0 ? '#' : a < 0 ? 'b' : '';
    })();
    const tones = Object.values(chord.tones);
    const chromatic = !tones.every(inKey);
    const upper = chord.type === 'M' || chord.type === 'A' || chord.type === 'Mm7' || chord.type === 'MM7' || chord.type === 'AM7';
    const roman = upper ? ROMAN[degree - 1] : ROMAN[degree - 1].toLowerCase();
    const qual = { d: '°', A: '+', AM7: '+', dm7: 'ø', dd7: '°' }[chord.type] || '';
    const fig = chord.figure;
    // 副屬和弦：含調外音的大三／屬七和弦（往下五度到目標），或減三／減七／半減七和弦（往上小二度到目標）；
    // 目標是調內的大、小三和弦，不含 I 級本身
    let secondary = null;
    if (chromatic) {
      let target = null;
      let head = null;
      if (chord.type === 'M' || chord.type === 'Mm7') {
        target = transpose({ ...chord.root, octave: 4 }, 'P', 5, -1);
        head = 'V';
      } else if (chord.type === 'd' || chord.type === 'dd7' || chord.type === 'dm7') {
        target = transpose({ ...chord.root, octave: 4 }, 'm', 2, 1);
        head = 'vii' + qual;
      }
      const ti = target ? sc.findIndex((n) => same(n, target)) : -1;
      if (ti > 0) {
        const tq = identifyChord(diatonicTriad(key, ti + 1));
        if (tq && (tq.type === 'M' || tq.type === 'm')) secondary = head + fig + '/' + (tq.type === 'M' ? ROMAN[ti] : ROMAN[ti].toLowerCase());
      }
    }
    const symbol = secondary || rootPrefix + roman + qual + fig;
    return { degree, roman, prefix: rootPrefix, qual, figure: fig, symbol, chromatic, secondary };
  }

  /** 調內第 degree 級的三和弦（大調用大音階、小調用和聲小音階）。 */
  function diatonicTriad(key, degree, seventh) {
    const sc = scale({ ...key.tonic, octave: 4 }, key.mode === 'minor' ? 'harmonic' : 'major');
    const out = [];
    const count = seventh ? 4 : 3;
    for (let k = 0; k < count; k++) {
      const i = degree - 1 + 2 * k;
      const n = sc[i % 7];
      out.push({ step: n.step, alter: n.alter, octave: n.octave + Math.floor(i / 7) });
    }
    return out;
  }

  /** 級數符號念法（給報讀）：'V65' → '五級 六五'，'vii°7' → '七級 減 七'。 */
  function speakRoman(symbol) {
    const m = /^([#b]?)([ivIV]+)([°+ø]?)(\d*)(?:\/(.+))?$/.exec(symbol);
    if (!m) return symbol;
    const idx = ROMAN.indexOf(m[2].toUpperCase());
    let s = (m[1] === '#' ? '升' : m[1] === 'b' ? '降' : '') + (NUM_ZH[idx + 1] || m[2]) + '級';
    s += m[2] === m[2].toUpperCase() ? '大寫' : '小寫';
    if (m[3]) s += { '°': ' 減', '+': ' 增', ø: ' 半減' }[m[3]];
    if (m[4]) s += ' ' + m[4].split('').map((d) => NUM_ZH[+d]).join('');
    if (m[5]) s += ' 斜線 ' + speakRoman(m[5]);
    return s;
  }

  // ---------- 移調樂器 ----------
  // 記譜音 = 實際音 往上（或往下）一個音程
  const TRANSPOSING = {
    Bb: { name: '降 B 調（單簧管、小號、高音薩克斯風）', q: 'M', n: 2, dir: 1 },
    A: { name: 'A 調（單簧管）', q: 'm', n: 3, dir: 1 },
    F: { name: 'F 調（法國號、英國管）', q: 'P', n: 5, dir: 1 },
    Eb: { name: '降 E 調（中音薩克斯風）', q: 'M', n: 6, dir: 1 },
    D: { name: 'D 調（小號）', q: 'M', n: 2, dir: -1 },
  };
  /** 實際音高 → 移調樂器的記譜音。 */
  function writtenPitch(concert, inst) {
    const t = TRANSPOSING[inst];
    return transpose(concert, t.q, t.n, t.dir);
  }

  MB.theory = {
    STEPS,
    dia,
    midi,
    pc,
    same,
    nameZh,
    nameEn,
    parseNote,
    interval,
    intervalName,
    transpose,
    enharmonics,
    CHORD_TYPES,
    identifyChord,
    buildChord,
    SCALE_TYPES,
    scale,
    identifyScale,
    keyFromFifths,
    fifthsOf,
    keySignatureNotes,
    keyNameZh,
    romanNumeral,
    diatonicTriad,
    speakRoman,
    TRANSPOSING,
    writtenPitch,
    INV_ZH,
    QUAL_ZH,
  };
})(typeof window !== 'undefined' ? window : globalThis);
