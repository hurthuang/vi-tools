/*
 * MusicXML（score-partwise）⇄ 內部模型，以及 .mxl（壓縮 MusicXML）解壓。
 * 鋼琴：一個 part、兩個 staff（staff 1 = 右手，staff 2 = 左手）。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const M = MB.model;
  const X = MB.xml;

  const TYPE = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd', 64: '64th', 128: '128th' };
  const TYPE_VALUE = { whole: 1, half: 2, quarter: 4, eighth: 8, '16th': 16, '32nd': 32, '64th': 64, '128th': 128 };
  const ACC_OUT = { sharp: 'sharp', flat: 'flat', natural: 'natural', dsharp: 'double-sharp', dflat: 'flat-flat' };
  const ACC_IN = { sharp: 'sharp', flat: 'flat', natural: 'natural', 'double-sharp': 'dsharp', 'sharp-sharp': 'dsharp', 'flat-flat': 'dflat', 'double-flat': 'dflat' };
  const ARTIC_OUT = { staccato: 'staccato', staccatissimo: 'staccatissimo', accent: 'accent', tenuto: 'tenuto' };
  const ORN_OUT = { trill: 'trill-mark', mordent: 'mordent', uppermordent: 'inverted-mordent', turn: 'turn', invertedturn: 'inverted-turn' };
  const ORN_IN = { 'trill-mark': 'trill', mordent: 'mordent', 'inverted-mordent': 'uppermordent', turn: 'turn', 'delayed-turn': 'turn', 'inverted-turn': 'invertedturn', 'delayed-inverted-turn': 'invertedturn' };
  const JUMP_TEXT = (j) => (j.type === 'DC' ? 'D.C.' : 'D.S.') + (j.to === 'fine' ? ' al Fine' : j.to === 'coda' ? ' al Coda' : '');
  /** 文字（如 Fine、D.C. al Fine、To Coda）轉成反覆指示；不是則回傳 null。 */
  function navFromWords(text) {
    const t = text.trim();
    if (/^fine\.?$/i.test(t)) return 'fine';
    if (/^to\s*coda$/i.test(t)) return 'toCoda';
    if (/^coda\.?$/i.test(t)) return 'codaStart';
    const m = /^(d\.?\s*c\.?|da\s*capo|d\.?\s*s\.?|dal\s*segno)(?:\s*al\s*(fine|coda))?\.?$/i.exec(t);
    if (m) return { type: /^(d\.?\s*c|da\s*capo)/i.test(m[1]) ? 'DC' : 'DS', to: m[2] ? m[2].toLowerCase() : null };
    return null;
  }
  const DYN = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff', 'sfz', 'sf', 'fp', 'fz', 'rfz'];
  const TPQ = M.TPW / 4; // 每四分音符的 ticks

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  }

  // =====================================================================
  // 匯出
  // =====================================================================
  function toMusicXML(score, options) {
    const opts = options || {};
    const parts = score.keyboard ? score.parts.slice(0, 2) : score.parts.slice(0, 1);
    const main = parts[0];
    const N = main.measures.length;

    // divisions：所有時值的最大公因數
    let gg = TPQ;
    parts.forEach((p) =>
      p.measures.forEach((m, mi) => {
        gg = gcd(gg, M.meterTicks(M.meterAt(p, mi)));
        m.voices.forEach((v) => v.forEach((ev) => (gg = gcd(gg, ev.measureRest ? M.meterTicks(M.meterAt(p, mi)) : M.eventTicks(ev)))));
      })
    );
    const divisions = TPQ / gg;
    const dur = (t) => Math.round(t / gg);

    // 房號範圍
    const endingAt = {};
    main.measures.forEach((m, mi) => {
      if (!m.volta) return;
      let j = mi;
      while (j < N - 1 && !main.measures[j].endRepeat && main.measures[j].barline === 'single' && !main.measures[j + 1].volta && !main.measures[j + 1].startRepeat) j++;
      endingAt[mi] = { number: m.volta, end: j, type: main.measures[j].endRepeat ? 'stop' : 'discontinue' };
      endingAt[j] = Object.assign(endingAt[j] || {}, { stopNumber: m.volta, stopType: main.measures[j].endRepeat ? 'stop' : 'discontinue' });
    });

    const numbers = M.measureNumbers(score);
    const tieOpen = new Set();
    const slurNo = {};
    const measuresXml = [];

    for (let mi = 0; mi < N; mi++) {
      const m = main.measures[mi];
      const content = [];
      // 屬性
      const attrs = [];
      if (mi === 0) attrs.push(['divisions', divisions]);
      if (mi === 0 || m.key) {
        const k = m.key || { fifths: 0, mode: 'major' };
        attrs.push(['key', ['fifths', k.fifths], k.mode && ['major', 'minor'].includes(k.mode) ? ['mode', k.mode] : null]);
      }
      if (mi === 0 || m.meter) {
        const t = m.meter || { num: 4, den: 4 };
        attrs.push(['time', t.symbol === 'C' ? { symbol: 'common' } : t.symbol === 'C|' ? { symbol: 'cut' } : {}, ['beats', t.num], ['beat-type', t.den]]);
      }
      if (mi === 0) {
        if (score.keyboard) {
          attrs.push(['staves', 2]);
          attrs.push(['clef', { number: 1 }, ['sign', 'G'], ['line', 2]]);
          attrs.push(['clef', { number: 2 }, ['sign', 'F'], ['line', 4]]);
        } else if (main.clef === 'bass') attrs.push(['clef', ['sign', 'F'], ['line', 4]]);
        else attrs.push(['clef', ['sign', 'G'], ['line', 2]]);
      }
      if (attrs.length) content.push(['attributes'].concat(attrs));
      // 左側小節線
      const e = endingAt[mi];
      if (m.startRepeat || (e && e.number)) {
        content.push([
          'barline', { location: 'left' },
          m.startRepeat ? ['bar-style', 'heavy-light'] : null,
          e && e.number ? ['ending', { number: e.number, type: 'start' }] : null,
          m.startRepeat ? ['repeat', { direction: 'forward' }] : null,
        ]);
      }
      if (mi === 0 && score.tempo) {
        const t = score.tempo;
        content.push([
          'direction', { placement: 'above' },
          ['direction-type', ['metronome', ['beat-unit', TYPE[t.value]], t.dots ? ['beat-unit-dot'] : null, ['per-minute', t.bpm]]],
          ['sound', { tempo: Math.round((t.bpm * M.valueTicks(t.value, t.dots)) / TPQ) }],
        ]);
      }
      // 小節開頭的反覆指示
      if (m.segno) content.push(['direction', { placement: 'above' }, ['direction-type', ['segno']], ['sound', { segno: 'segno' }]]);
      if (m.codaStart) content.push(['direction', { placement: 'above' }, ['direction-type', ['coda']], ['sound', { coda: 'coda' }]]);
      // 各譜表、各聲部
      let cursor = 0;
      parts.forEach((part, si) => {
        const pm = part.measures[mi];
        if (!pm) return;
        const meterT = M.meterTicks(M.meterAt(part, mi));
        pm.voices.forEach((voice, vi) => {
          if (cursor > 0) content.push(['backup', ['duration', dur(cursor)]]);
          cursor = 0;
          const voiceNo = String(si * 4 + vi + 1);
          const staff = score.keyboard ? si + 1 : null;
          voice.forEach((ev) => {
            const t = ev.measureRest ? meterT : M.eventTicks(ev);
            content.push(...eventXml(ev, dur(t), voiceNo, staff, { tieOpen, slurNo }));
            cursor += t;
          });
        });
      });
      // 小節結尾的反覆指示
      const words = (w, sound) => ['direction', { placement: 'above' }, ['direction-type', ['words', w]], ['sound', sound]];
      if (m.toCoda) content.push(words('To Coda', { tocoda: 'coda' }));
      if (m.fine) content.push(words('Fine', { fine: 'yes' }));
      if (m.jump) content.push(words(JUMP_TEXT(m.jump), m.jump.type === 'DC' ? { dacapo: 'yes' } : { dalsegno: 'segno' }));
      // 右側小節線
      const stop = endingAt[mi] && endingAt[mi].stopNumber ? endingAt[mi] : null;
      const last = mi === N - 1;
      if (m.endRepeat || stop || m.barline !== 'single') {
        const style = m.endRepeat || m.barline === 'final' ? 'light-heavy' : m.barline === 'double' ? 'light-light' : null;
        content.push([
          'barline', { location: 'right' },
          style ? ['bar-style', style] : null,
          stop ? ['ending', { number: stop.stopNumber, type: stop.stopType }] : null,
          m.endRepeat ? ['repeat', { direction: 'backward' }] : null,
        ]);
      }
      const attr = { number: String(numbers[mi]) };
      if (numbers[mi] === 0) attr.implicit = 'yes';
      measuresXml.push(['measure', attr].concat(content));
    }

    const today = opts.date || new Date().toISOString().slice(0, 10);
    const doc = [
      'score-partwise', { version: '4.0' },
      score.title ? ['work', ['work-title', score.title]] : null,
      [
        'identification',
        score.composer ? ['creator', { type: 'composer' }, score.composer] : null,
        ['encoding', ['software', '點字樂譜轉換器'], ['encoding-date', today]],
      ],
      ['part-list', ['score-part', { id: 'P1' }, ['part-name', score.keyboard ? 'Piano' : 'Music']]],
      ['part', { id: 'P1' }].concat(measuresXml),
    ];
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
      '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
      X.build(doc)
    );
  }

  function eventXml(ev, duration, voiceNo, staff, st) {
    const out = [];
    const dirs = [];
    if (ev.pedalChange) dirs.push(['direction-type', ['pedal', { type: 'change', line: 'no' }]]);
    else if (ev.pedalDown) dirs.push(['direction-type', ['pedal', { type: 'start', line: 'no' }]]);
    if (ev.dynamic) dirs.push(['direction-type', ['dynamics', [ev.dynamic]]]);
    if (ev.hairpinStart) dirs.push(['direction-type', ['wedge', { type: ev.hairpinStart === 'cresc' ? 'crescendo' : 'diminuendo' }]]);
    if (dirs.length) out.push(['direction', { placement: 'below' }].concat(dirs, [staff ? ['staff', staff] : null]));

    const type = ev.measureRest ? null : TYPE[ev.value];
    const dots = ev.measureRest ? 0 : ev.dots || 0;
    const tm = ev.tuplet ? ['time-modification', ['actual-notes', ev.tuplet.n], ['normal-notes', ev.tuplet.of]] : null;
    const key = staff + ':' + voiceNo;

    // 倚音
    const graces = ev.graces || [];
    graces.forEach((gr) => {
      const n = gr.notes[0];
      const gnote = [
        'note',
        ['grace', graces.length === 1 && gr.slash ? { slash: 'yes' } : {}],
        ['pitch', ['step', n.step], n.alter ? ['alter', n.alter] : null, ['octave', n.octave]],
        ['voice', voiceNo],
        ['type', TYPE[gr.value]],
      ];
      for (let d = 0; d < (gr.dots || 0); d++) gnote.push(['dot']);
      if (n.accidental) gnote.push(['accidental', ACC_OUT[n.accidental]]);
      if (staff) gnote.push(['staff', staff]);
      out.push(gnote);
    });

    const notes = ev.kind === 'rest' ? [null] : ev.notes.slice().sort((a, b) => M.diatonic(a) - M.diatonic(b));
    notes.forEach((n, k) => {
      const first = k === 0;
      const nots = [];
      if (n) {
        const tk = key + ':' + n.step + n.octave + ':' + (n.alter || 0);
        const stopTie = st.tieOpen.has(tk);
        if (stopTie) st.tieOpen.delete(tk);
        if (n.tie) st.tieOpen.add(tk);
        if (stopTie) nots.push(['tied', { type: 'stop' }]);
        if (n.tie) nots.push(['tied', { type: 'start' }]);
        n._tieStop = stopTie;
      }
      if (first) {
        // 圓滑線編號：每個聲部一個堆疊
        const open = (st.slurNo[key] = st.slurNo[key] || []);
        for (let s = 0; s < (ev.slurEnd || 0); s++) nots.push(['slur', { type: 'stop', number: open.length ? open.pop() : 1 }]);
        for (let s = 0; s < (ev.slurStart || 0); s++) {
          const no = open.length + 1;
          open.push(no);
          nots.push(['slur', { type: 'start', number: no }]);
        }
        if (ev.tuplet && ev.tuplet.start) nots.push(['tuplet', { type: 'start', bracket: 'yes' }]);
        if (ev.tuplet && ev.tuplet.end) nots.push(['tuplet', { type: 'stop' }]);
        const arts = (ev.articulations || []).filter((a) => ARTIC_OUT[a]).map((a) => [ARTIC_OUT[a]]);
        if (arts.length) nots.push(['articulations'].concat(arts));
        if ((ev.articulations || []).includes('fermata')) nots.push(['fermata', { type: 'upright' }]);
        if ((ev.articulations || []).includes('arpeggio')) nots.push(['arpeggiate']);
        const orns = (ev.ornaments || []).filter((o) => ORN_OUT[o]).map((o) => [ORN_OUT[o]]);
        if (orns.length && n) nots.push(['ornaments'].concat(orns));
      }
      // 指法：換指以 substitution 表示（例如 4→3），替代指法以 alternate 表示
      if (n && (n.finger || (n.fingerAlt && n.fingerAlt !== 'x'))) {
        const fs = (n.finger || '').split('').map((f, i) => ['fingering', i > 0 ? { substitution: 'yes' } : {}, f]);
        if (n.fingerAlt && n.fingerAlt !== 'x') n.fingerAlt.split('').forEach((f) => fs.push(['fingering', { alternate: 'yes' }, f]));
        nots.push(['technical'].concat(fs));
      }
      const note = [
        'note',
        k > 0 ? ['chord'] : null,
        n
          ? ['pitch', ['step', n.step], n.alter ? ['alter', n.alter] : null, ['octave', n.octave]]
          : ev.measureRest
          ? ['rest', { measure: 'yes' }]
          : ['rest'],
        ['duration', duration],
        n && n._tieStop ? ['tie', { type: 'stop' }] : null,
        n && n.tie ? ['tie', { type: 'start' }] : null,
        ['voice', voiceNo],
        type ? ['type', type] : null,
      ];
      for (let d = 0; d < dots; d++) note.push(['dot']);
      if (n && n.accidental) note.push(['accidental', ACC_OUT[n.accidental]]);
      if (tm) note.push(tm);
      if (staff) note.push(['staff', staff]);
      if (nots.length) note.push(['notations'].concat(nots));
      if (n) delete n._tieStop;
      out.push(note);
    });
    if (ev.hairpinEnd) out.push(['direction', ['direction-type', ['wedge', { type: 'stop' }]], staff ? ['staff', staff] : null]);
    if (ev.pedalUp) out.push(['direction', ['direction-type', ['pedal', { type: 'stop', line: 'no' }]], staff ? ['staff', staff] : null]);
    return out;
  }

  // =====================================================================
  // 匯入
  // =====================================================================
  /**
   * options.part：要轉換的聲部索引（預設 0），或 'piano'（第一個有兩行譜表的聲部）。
   * 回傳 { score, warnings, parts: [{index, name, staves}] }。
   */
  function parseMusicXML(text, options) {
    const opts = options || {};
    const warnings = [];
    const once = new Set();
    const warn = (msg) => warnings.push({ msg });
    const warnOnce = (k, msg) => {
      if (!once.has(k)) {
        once.add(k);
        warn(msg);
      }
    };
    const doc = X.parse(text);
    const root = X.child(doc, 'score-partwise');
    if (!root) {
      if (X.child(doc, 'score-timewise')) throw new Error('目前不支援 score-timewise 格式的 MusicXML');
      throw new Error('這不是 MusicXML 檔案（找不到 score-partwise）');
    }
    const score = { title: '', composer: '', tempo: null, keyboard: false, parts: [] };
    score.title = X.textOf(root, 'work/work-title') || X.textOf(root, 'movement-title');
    for (const c of X.children(X.child(root, 'identification'), 'creator')) if (c.attrs.type === 'composer') score.composer = c.text.trim();

    const partEls = X.children(root, 'part');
    if (!partEls.length) throw new Error('MusicXML 中沒有任何聲部（part）');
    const names = {};
    for (const sp of X.children(X.child(root, 'part-list'), 'score-part')) names[sp.attrs.id] = X.textOf(sp, 'part-name') || sp.attrs.id;
    const stavesOf = (pe) => {
      for (const m of X.children(pe, 'measure')) {
        const t = X.textOf(m, 'attributes/staves');
        if (t) return +t;
      }
      return 1;
    };
    const partInfo = partEls.map((pe, k) => ({ index: k, name: names[pe.attrs.id] || pe.attrs.id || '聲部 ' + (k + 1), staves: stavesOf(pe) }));
    let pi = 0;
    if (opts.part === 'piano') {
      const f = partInfo.find((x) => x.staves >= 2);
      pi = f ? f.index : 0;
    } else if (Number.isInteger(opts.part) && partEls[opts.part]) pi = opts.part;
    if (partEls.length > 1)
      warn('檔案有 ' + partEls.length + ' 個聲部，目前轉換「' + partInfo[pi].name + '」；其餘（' + partInfo.filter((x) => x.index !== pi).map((x) => x.name).join('、') + '）可在聲部選單切換');

    const part = partEls[pi];
    // 譜表數
    let staves = 1;
    for (const m of X.children(part, 'measure')) {
      const s = X.textOf(m, 'attributes/staves');
      if (s) {
        staves = +s;
        break;
      }
    }
    if (staves > 2) warn('這個聲部有 ' + staves + ' 行譜表，只轉換前兩行');
    const nStaff = Math.min(2, staves);
    score.keyboard = nStaff === 2;

    const out = [];
    for (let s = 0; s < nStaff; s++) out.push({ id: score.keyboard ? (s ? 'L' : 'R') : '1', hand: score.keyboard ? (s ? 'L' : 'R') : null, clef: s ? 'bass' : 'treble', measures: [] });

    let divisions = 1;
    let meter = { num: 4, den: 4, symbol: null };
    const tupState = {};
    const pendingGrace = {}; // 'staff:voice' → 倚音
    const pendingDir = {}; // staff → {dynamic, hairpinStart, pedal…}
    const lastByStaff = {};
    const lastEvByStaff = {};

    const measureEls = X.children(part, 'measure');
    const lastMeasureEl = measureEls[measureEls.length - 1];
    for (const mEl of measureEls) {
      const perStaff = [];
      for (let s = 0; s < nStaff; s++) perStaff.push({ voices: {}, lastEnd: {} });
      const meas = { startRepeat: false, endRepeat: false, volta: null, barline: 'single', implicit: mEl.attrs.implicit === 'yes', invisibleEnd: false };
      let keyChange = null;
      let meterChange = null;
      let cursor = 0;
      let prevNote = null; // 上一個 <note>（和弦用）
      const hasNotes = () => perStaff.some((st) => Object.keys(st.voices).length);
      // Coda 記號：明確的 sound 屬性優先；否則小節中後段為「跳到 Coda」，小節開頭（之前已有跳轉）為 Coda 段落
      const navCoda = (el) => {
        const snd = X.child(el, 'sound');
        if (snd && snd.attrs.tocoda) meas.toCoda = true;
        else if (snd && snd.attrs.coda) meas.codaStart = true;
        else if (!hasNotes() && out[0].measures.some((x) => x.toCoda || x.jump)) meas.codaStart = true;
        else meas.toCoda = true;
      };
      const soundNav = (snd) => {
        if (snd.attrs.segno) meas.segno = true;
        if (snd.attrs.fine) meas.fine = true;
        if (snd.attrs.tocoda) meas.toCoda = true;
        if (snd.attrs.coda && !meas.toCoda) meas.codaStart = true;
        if (snd.attrs.dacapo === 'yes' && !meas.jump) meas.jump = { type: 'DC', to: null };
        if (snd.attrs.dalsegno && !meas.jump) meas.jump = { type: 'DS', to: null };
      };
      const toTicks = (d) => Math.round((+d * TPQ) / divisions);

      for (const el of mEl.children) {
        switch (el.name) {
          case 'attributes': {
            const dv = X.textOf(el, 'divisions');
            if (dv) divisions = +dv || 1;
            const key = X.child(el, 'key');
            if (key && X.textOf(key, 'fifths') !== '') {
              const mode = X.textOf(key, 'mode');
              keyChange = { fifths: +X.textOf(key, 'fifths'), mode: mode === 'minor' ? 'minor' : 'major' };
            }
            const time = X.child(el, 'time');
            if (time && X.textOf(time, 'beats')) {
              // 可能有多組 beats/beat-type（例如 3/8+2/8+3/4）：合計成一個拍號
              const bs = X.children(time, 'beats').map((b) => b.text.split('+').reduce((a, c) => a + +c, 0));
              const ts = X.children(time, 'beat-type').map((b) => +b.text);
              const den = Math.max(...ts);
              const num = bs.reduce((a, b, k) => a + (b * den) / (ts[k] || ts[0]), 0);
              const sym = time.attrs.symbol;
              if (bs.length > 1) warnOnce('cmeter', '組合拍號（如 3/8+2/8）目前以合計的拍號表示');
              // C／C| 符號只在拍號真的是 4/4、2/2 時採用（避免 6/4 卻標成 C 這類矛盾）
              const nn = Math.round(num);
              meterChange = { num: nn, den, symbol: sym === 'common' && nn === 4 && den === 4 ? 'C' : sym === 'cut' && nn === 2 && den === 2 ? 'C|' : null };
              meter = meterChange;
            }
            for (const c of X.children(el, 'clef')) {
              const sn = +(c.attrs.number || 1);
              if (sn === 1 && !score.keyboard) out[0].clef = X.textOf(c, 'sign') === 'F' ? 'bass' : 'treble';
            }
            break;
          }
          case 'backup':
            cursor -= toTicks(X.textOf(el, 'duration'));
            if (cursor < 0) cursor = 0;
            break;
          case 'forward':
            cursor += toTicks(X.textOf(el, 'duration'));
            break;
          case 'direction': {
            const sn = +(X.textOf(el, 'staff') || 1);
            if (sn > nStaff) break;
            const pd = (pendingDir[sn] = pendingDir[sn] || {});
            for (const dt of X.children(el, 'direction-type')) {
              const dyn = X.child(dt, 'dynamics');
              if (dyn && dyn.children[0]) {
                const d = dyn.children[0].name;
                if (DYN.includes(d)) pd.dynamic = d;
              }
              const w = X.child(dt, 'wedge');
              if (w) {
                if (w.attrs.type === 'crescendo') pd.hairpinStart = 'cresc';
                else if (w.attrs.type === 'diminuendo') pd.hairpinStart = 'dim';
                else if (w.attrs.type === 'stop') {
                  const last = lastByStaff[sn];
                  if (last) last.hairpinEnd = pd.lastWedge || 'cresc';
                }
                if (w.attrs.type !== 'stop') pd.lastWedge = pd.hairpinStart;
              }
              const met = X.child(dt, 'metronome');
              if (met && !score.tempo && X.textOf(met, 'per-minute')) {
                const v = TYPE_VALUE[X.textOf(met, 'beat-unit')] || 4;
                score.tempo = { value: v, dots: X.child(met, 'beat-unit-dot') ? 1 : 0, bpm: Math.round(+X.textOf(met, 'per-minute')) };
              }
              const ped = X.child(dt, 'pedal');
              if (ped) {
                if (ped.attrs.type === 'start' || ped.attrs.type === 'resume') pd.pedalDown = true;
                else if (ped.attrs.type === 'change') pd.pedalChange = true;
                else if (ped.attrs.type === 'stop' || ped.attrs.type === 'discontinue') {
                  const last = lastEvByStaff[sn]; // 踏板放開也可以在休止符之後
                  if (last) last.pedalUp = true;
                }
              }
              if (X.child(dt, 'segno')) meas.segno = true;
              if (X.child(dt, 'coda')) navCoda(el);
              for (const w of X.children(dt, 'words')) {
                const nav = navFromWords(w.text);
                if (nav === 'codaStart') meas.codaStart = true;
                else if (nav && typeof nav === 'object') meas.jump = nav;
                else if (nav) meas[nav] = true;
                else if (w.text.trim()) warnOnce('words', '文字表情（如 cresc.、rit.）目前不轉換，已略過');
              }
            }
            const snd = X.child(el, 'sound');
            if (snd && snd.attrs.tempo && !score.tempo) score.tempo = { value: 4, dots: 0, bpm: Math.round(+snd.attrs.tempo) };
            if (snd) soundNav(snd);
            break;
          }
          case 'sound':
            if (el.attrs.tempo && !score.tempo) score.tempo = { value: 4, dots: 0, bpm: Math.round(+el.attrs.tempo) };
            soundNav(el);
            break;
          case 'harmony':
            warnOnce('harmony', '和弦名稱目前不轉換，已略過');
            break;
          case 'barline': {
            const loc = el.attrs.location || 'right';
            const rep = X.child(el, 'repeat');
            const end = X.child(el, 'ending');
            const style = X.textOf(el, 'bar-style');
            if (rep && rep.attrs.direction === 'forward') meas.startRepeat = true;
            if (rep && rep.attrs.direction === 'backward') meas.endRepeat = true;
            if (end && end.attrs.type === 'start') meas.volta = String(parseInt(end.attrs.number, 10) || 1);
            if (X.child(el, 'segno')) meas.segno = true;
            if (X.child(el, 'coda')) navCoda(el);
            if (loc === 'right' && !rep) {
              if (style === 'light-heavy') meas.barline = 'final';
              else if (style === 'light-light') meas.barline = 'double';
              else if (style === 'none') meas.invisibleEnd = true;
            }
            break;
          }
          case 'note': {
            const graceEl = X.child(el, 'grace');
            if (graceEl) {
              // 倚音：附加到同一譜表、同一聲部的下一個音
              if (X.child(el, 'chord')) break;
              const gp = X.child(el, 'pitch');
              if (!gp) break;
              const gsn = +(X.textOf(el, 'staff') || 1);
              const gk = gsn + ':' + (X.textOf(el, 'voice') || '1');
              const gv = TYPE_VALUE[X.textOf(el, 'type')] || 8;
              (pendingGrace[gk] = pendingGrace[gk] || []).push({
                notes: [{ step: X.textOf(gp, 'step'), octave: +X.textOf(gp, 'octave'), accidental: ACC_IN[X.textOf(el, 'accidental')] || null }],
                value: gv,
                dots: X.children(el, 'dot').length,
                slash: graceEl.attrs.slash === 'yes',
              });
              break;
            }
            if (X.child(el, 'cue')) break;
            // 隱藏的音符或休止符（print-object="no"）只是排版用途：略過，但時間仍要前進
            // 隱藏的音符或休止符（print-object="no"）：
            // 第一小節開頭的隱藏休止符是弱起的補位，略過；其他的保留時間，當作休止符
            let hiddenAsRest = false;
            if (el.attrs['print-object'] === 'no') {
              if (X.child(el, 'chord')) break;
              const hs = +(X.textOf(el, 'staff') || 1);
              const hv = X.textOf(el, 'voice') || '1';
              const hst = perStaff[hs - 1];
              if (!hst) {
                cursor += toTicks(X.textOf(el, 'duration') || 0);
                break;
              }
              // 先當作休止符保留時間；小節讀完後再移除開頭（弱起）與結尾的補位休止符
              hiddenAsRest = true;
            }
            const sn = +(X.textOf(el, 'staff') || 1);
            const isChord = !!X.child(el, 'chord');
            const d = toTicks(X.textOf(el, 'duration') || 0);
            if (X.child(el, 'lyric')) warnOnce('lyric', '歌詞目前不轉換，已略過');
            const nots = X.child(el, 'notations');
            if (nots) {
              for (const o of X.children(X.child(nots, 'ornaments'))) if (!ORN_IN[o.name] && o.name !== 'accidental-mark') warnOnce('orn', '部分裝飾音（如 ' + o.name + '）目前不轉換，已略過');
              for (const t of X.children(X.child(nots, 'technical'))) if (t.name !== 'fingering') warnOnce('tech', '指法以外的演奏技巧記號目前不轉換，已略過');
            }
            if (sn > nStaff) {
              warnOnce('staff3', '第三行以後的譜表已略過');
              if (!isChord) {
                // 這個和弦的第一個音被略過，後面屬於第一、二行譜表的和弦音仍要正確放置
                prevNote = { ev: null, staff: sn, voice: X.textOf(el, 'voice') || '1', start: cursor, dur: d, other: {} };
                cursor += d;
              }
              break;
            }
            const pitchEl = hiddenAsRest ? null : X.child(el, 'pitch');
            const unp = hiddenAsRest ? null : X.child(el, 'unpitched');
            let note = null;
            if (pitchEl || unp) {
              let step = (pitchEl ? X.textOf(pitchEl, 'step') : X.textOf(unp, 'display-step')).toUpperCase();
              let octave = parseInt(pitchEl ? X.textOf(pitchEl, 'octave') : X.textOf(unp, 'display-octave'), 10);
              if (unp) warnOnce('unpitched', '打擊樂器（無固定音高）的音以顯示位置表示，點字的打擊樂記法目前不支援');
              if (!'CDEFGAB'.includes(step) || !step || isNaN(octave)) {
                // 沒有音高資訊（例如沒標顯示位置的打擊樂器）：放在高音譜中線
                step = 'B';
                octave = 4;
              }
              const acc = ACC_IN[X.textOf(el, 'accidental')] || null;
              note = { step, octave, accidental: acc, tie: false };
              // <alter> 是實際音高（調號不影響它）；四分音等微分音目前無法表示，取最接近的半音
              if (pitchEl) {
                const alt = parseFloat(X.textOf(pitchEl, 'alter') || '0');
                if (alt !== Math.round(alt)) warnOnce('micro', '四分音等微分音目前不支援，已改為最接近的半音');
                note._actualAlter = Math.round(alt);
              }
              // 指法：substitution="yes" 為換指，alternate="yes" 為替代指法；
              // 也接受 music21 的文字寫法：'2-1' 換指、'2|1' 或 '2,1' 替代指法、'x' 省略
              const fels = nots ? X.children(X.child(nots, 'technical'), 'fingering') : [];
              const digits = (t) => t.replace(/[^1-5]/g, '');
              let main = '';
              let alt;
              for (const f of fels) {
                const t = f.text.trim();
                const choice = t.split(/[,|]/);
                if (choice.length === 2) {
                  main += choice[0].trim() === 'x' ? '' : digits(choice[0]);
                  alt = choice[1].trim() === 'x' ? 'x' : digits(choice[1]);
                } else if (f.attrs.alternate === 'yes') alt = (alt && alt !== 'x' ? alt : '') + digits(t);
                else main += digits(t);
              }
              if (main) note.finger = main;
              if (alt !== undefined) {
                note.finger = main;
                note.fingerAlt = alt;
              }
              for (const t of X.children(el, 'tie')) if (t.attrs.type === 'start') note.tie = true;
              if (nots) for (const t of X.children(nots, 'tied')) if (t.attrs.type === 'start') note.tie = true;
            }
            if (isChord && prevNote && note) {
              if (sn === prevNote.staff && prevNote.ev) prevNote.ev.notes.push(note);
              else if (sn === prevNote.staff || sn > nStaff) {
                /* 同屬被略過的譜表 */
              }
              else {
                // 跨譜表的和弦：屬於另一行譜表的音，放到那一行同一時間的和弦裡
                const key = sn;
                if (!prevNote.other[key]) {
                  const pe = prevNote.ev;
                  const e2 = {
                    id: M.newId(), kind: 'note', notes: [], src: {},
                    value: pe ? pe.value : TYPE_VALUE[X.textOf(el, 'type')] || (M.exactValue(d) || { value: 4 }).value,
                    dots: pe ? pe.dots : X.children(el, 'dot').length,
                  };
                  if (pe && pe.tuplet) e2.tuplet = Object.assign({}, pe.tuplet);
                  const stf2 = perStaff[sn - 1];
                  const vno = X.textOf(el, 'voice') || prevNote.voice;
                  const list2 = (stf2.voices[vno] = stf2.voices[vno] || []);
                  const end2 = stf2.lastEnd[vno] || 0;
                  if (prevNote.start > end2) list2.push(...gapRests(prevNote.start - end2));
                  list2.push(e2);
                  stf2.lastEnd[vno] = prevNote.start + prevNote.dur;
                  prevNote.other[key] = e2;
                }
                prevNote.other[key].notes.push(note);
              }
              break;
            }
            const voiceNo = X.textOf(el, 'voice') || '1';
            const restEl = X.child(el, 'rest');
            const ev = { id: M.newId(), kind: note ? 'note' : 'rest', notes: note ? [note] : [], src: {} };
            if (hiddenAsRest && X.child(el, 'rest')) ev._hidden = true; // 只有隱藏的休止符可能是補位
            const typ = X.textOf(el, 'type');
            const dots = X.children(el, 'dot').length;
            const tmEl = X.child(el, 'time-modification');
            if (tmEl) ev.tuplet = { n: +X.textOf(tmEl, 'actual-notes'), of: +X.textOf(tmEl, 'normal-notes'), start: false, end: false };
            if (TYPE_VALUE[typ]) {
              ev.value = TYPE_VALUE[typ];
              ev.dots = dots;
            } else if (restEl && (restEl.attrs.measure === 'yes' || !typ) && d === M.meterTicks(meter)) {
              ev.measureRest = true;
              ev.value = 1;
              ev.dots = 0;
            } else if (restEl && (restEl.attrs.measure === 'yes' || !typ)) {
              // 整小節休止，但長度與拍號不同（例如弱起小節）：依實際長度表示
              const ex = M.exactValue(d);
              ev.value = ex ? ex.value : 1;
              ev.dots = ex ? ex.dots : 0;
            } else {
              const ex = M.exactValue(ev.tuplet ? (d * ev.tuplet.n) / ev.tuplet.of : d);
              if (!ex) {
                warn('無法辨識的時值，已改為四分音符');
                ev.value = 4;
                ev.dots = 0;
              } else {
                ev.value = ex.value;
                ev.dots = ex.dots;
              }
            }
            if (typ === 'breve' || typ === 'long') warnOnce('breve', '倍全音符目前不支援，已改為全音符');
            // 連音範圍
            const tk = sn + ':' + voiceNo;
            if (ev.tuplet) {
              const ts = tupState[tk];
              const startMark = nots && X.children(nots, 'tuplet').some((t) => t.attrs.type === 'start');
              const stopMark = nots && X.children(nots, 'tuplet').some((t) => t.attrs.type === 'stop');
              if (startMark || !ts || ts.left <= 0) {
                ev.tuplet.start = true;
                tupState[tk] = { left: ev.tuplet.n };
              }
              tupState[tk].left--;
              if (stopMark || tupState[tk].left <= 0) {
                ev.tuplet.end = true;
                tupState[tk].left = 0;
              }
            } else delete tupState[tk];
            // 記號
            if (nots) {
              for (const s of X.children(nots, 'slur')) {
                if (s.attrs.type === 'start') ev.slurStart = (ev.slurStart || 0) + 1;
                if (s.attrs.type === 'stop') ev.slurEnd = (ev.slurEnd || 0) + 1;
              }
              const arts = [];
              const art = X.child(nots, 'articulations');
              if (art)
                for (const a of art.children) {
                  if (a.name === 'staccato') arts.push('staccato');
                  else if (a.name === 'staccatissimo' || a.name === 'spiccato') arts.push('staccatissimo');
                  else if (a.name === 'accent' || a.name === 'strong-accent') arts.push('accent');
                  else if (a.name === 'tenuto') arts.push('tenuto');
                }
              if (X.child(nots, 'fermata')) arts.push('fermata');
              if (X.child(nots, 'arpeggiate')) arts.push('arpeggio');
              if (arts.length) ev.articulations = arts;
              const orns = X.children(X.child(nots, 'ornaments')).map((o) => ORN_IN[o.name]).filter(Boolean);
              if (orns.length && note) ev.ornaments = orns;
            }
            const pd = pendingDir[sn];
            if (pd && note) {
              if (pd.dynamic) ev.dynamic = pd.dynamic;
              if (pd.hairpinStart) ev.hairpinStart = pd.hairpinStart;
              pd.dynamic = null;
              pd.hairpinStart = null;
            }
            if (pd && (pd.pedalDown || pd.pedalChange)) {
              if (pd.pedalChange) ev.pedalChange = true;
              else ev.pedalDown = true;
              pd.pedalDown = pd.pedalChange = false;
            }
            const gk = sn + ':' + voiceNo;
            if (pendingGrace[gk]) {
              const gs = pendingGrace[gk];
              if (gs.length > 1) gs.forEach((x) => (x.slash = false)); // 多個倚音一律視為短倚音
              ev.graces = gs;
              delete pendingGrace[gk];
            }
            // 放入聲部（補上空隙）
            const stf = perStaff[sn - 1];
            const list = (stf.voices[voiceNo] = stf.voices[voiceNo] || []);
            const end = stf.lastEnd[voiceNo] || 0;
            if (cursor > end) list.push(...gapRests(cursor - end));
            list.push(ev);
            stf.lastEnd[voiceNo] = cursor + d;
            if (note) lastByStaff[sn] = ev;
            lastEvByStaff[sn] = ev;
            prevNote = { ev, staff: sn, voice: voiceNo, start: cursor, dur: d, other: {} };
            cursor += d;
            break;
          }
          default:
            break;
        }
      }

      // 隱藏的補位休止符：只移除第一小節開頭的（弱起補位）與最後一小節結尾的；
      // 其他小節的隱藏休止符（例如 MuseScore 把聲部結尾的休止符設為不顯示）保留時間
      const isLastMeasure = mEl === lastMeasureEl;
      perStaff.forEach((stf) => {
        for (const k of Object.keys(stf.voices)) {
          const list = stf.voices[k];
          while (isLastMeasure && list.length && list[list.length - 1]._hidden) {
            const r = list.pop();
            stf.lastEnd[k] -= M.eventTicks(r);
          }
          if (out[0].measures.length === 0) while (list.length && list[0]._hidden) list.shift();
          list.forEach((e) => delete e._hidden);
          if (!list.length) delete stf.voices[k];
        }
      });
      // 每個譜表：整理聲部
      perStaff.forEach((stf, s) => {
        const vs = Object.keys(stf.voices)
          .sort((a, b) => +a - +b)
          .map((k) => ({ list: stf.voices[k], end: stf.lastEnd[k] }));
        let keep = vs.filter((v) => v.list.some((e) => e.kind === 'note'));
        if (!keep.length) keep = vs.slice(0, 1);
        const longest = Math.max(0, ...keep.map((v) => v.end));
        const voices = keep.map((v, k) => {
          // 多個聲部時，每個聲部都補足到最長聲部的長度（點字 in-accord 的每個聲部都必須完整，Par. 11.1.1）
          if (keep.length > 1 && v.end < longest) v.list.push(...gapRests(longest - v.end));
          return v.list;
        });
        const m = {
          voices: voices.length ? voices : [[{ id: M.newId(), kind: 'rest', measureRest: true, value: 1, dots: 0, notes: [], src: {} }]],
          startRepeat: meas.startRepeat,
          endRepeat: meas.endRepeat,
          volta: meas.volta,
          barline: meas.barline,
        };
        for (const k of ['segno', 'codaStart', 'toCoda', 'fine']) if (meas[k]) m[k] = true;
        if (meas.implicit) m._implicit = true;
        if (meas.invisibleEnd) m._invisibleEnd = true;
        if (meas.jump) m.jump = meas.jump;
        if (keyChange) m.key = keyChange;
        if (meterChange) m.meter = meterChange;
        out[s].measures.push(m);
      });
    }

    for (const p of out) {
      if (!p.measures.length) p.measures.push({ voices: [[]], barline: 'final' });
      const f = p.measures[0];
      f.key = f.key || { fifths: 0, mode: 'major' };
      f.meter = f.meter || { num: 4, den: 4, symbol: null };
    }
    mergeLayoutSplits(out);
    score.parts = out;
    // 單一休止符填滿整小節時視為整小節休止
    if (MB.markMeasureRests) out.forEach(MB.markMeasureRests);
    M.markSplitMeasures(score);
    M.syncNav(score);
    M.resolveAlters(score);
    return { score, warnings, parts: partInfo, partIndex: pi };
  }

  /**
   * 打譜軟體為了換行，把一個小節拆成兩段（前一段以看不見的小節線結束，後一段標為 implicit、不計小節數）。
   * 這純粹是排版：合併回同一個小節。
   */
  function mergeLayoutSplits(parts) {
    const main = parts[0];
    for (let i = main.measures.length - 2; i >= 0; i--) {
      const a = main.measures[i];
      const b = main.measures[i + 1];
      if (!a._invisibleEnd || !b._implicit) continue;
      const ok = parts.every((p) => {
        const full = M.meterTicks(M.meterAt(p, i));
        const x = M.measureTicks(p, i);
        const y = M.measureTicks(p, i + 1);
        return p.measures[i + 1] && x < full && y > 0 && x + y <= full && !p.measures[i + 1].meter;
      });
      if (!ok) continue;
      for (const p of parts) {
        const ma = p.measures[i];
        const mb = p.measures[i + 1];
        const n = Math.max(ma.voices.length, mb.voices.length);
        const lenA = M.measureTicks(p, i);
        const lenB = M.measureTicks(p, i + 1);
        const voices = [];
        for (let v = 0; v < n; v++) {
          const va = ma.voices[v] || gapRests(lenA);
          const vb = mb.voices[v] || gapRests(lenB);
          voices.push(va.concat(vb.filter((e) => !e.measureRest)));
        }
        ma.voices = voices;
        // 後一段的小節線、反覆等屬性移到合併後的小節
        for (const k of ['endRepeat', 'barline', 'toCoda', 'fine', 'jump']) if (mb[k] !== undefined) ma[k] = mb[k];
        delete ma._invisibleEnd;
        p.measures.splice(i + 1, 1);
      }
    }
    for (const p of parts) for (const m of p.measures) {
      delete m._implicit;
      delete m._invisibleEnd;
    }
  }

  function gapRests(ticks) {
    const parts = M.decomposeTicks(ticks) || [];
    return parts.map((p) => ({ id: M.newId(), kind: 'rest', notes: [], value: p.value, dots: p.dots, src: {} }));
  }

  // =====================================================================
  // .mxl（ZIP）
  // =====================================================================
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('這個瀏覽器無法解壓 .mxl，請改用未壓縮的 .musicxml');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const u8 = new Uint8Array(buffer);
    const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('不是有效的 .mxl（ZIP）檔案');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(off + 26, true);
      const lelen = dv.getUint16(off + 28, true);
      const start = off + 30 + lnlen + lelen;
      files[name] = { method, data: u8.subarray(start, start + csize) };
      p += 46 + nlen + elen + clen;
    }
    return files;
  }

  function decodeText(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /** 讀取 .mxl / .musicxml / .xml 的位元組，回傳 MusicXML 文字。 */
  async function readMusicXMLBytes(buffer) {
    const u8 = new Uint8Array(buffer);
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      const files = await unzip(buffer);
      const get = async (f) => (f.method === 0 ? f.data : f.method === 8 ? inflateRaw(f.data) : Promise.reject(new Error('不支援的壓縮方式')));
      let target = null;
      if (files['META-INF/container.xml']) {
        const c = X.parse(decodeText(await get(files['META-INF/container.xml'])));
        const rf = X.path(c, 'container/rootfiles/rootfile');
        if (rf && rf.attrs['full-path']) target = rf.attrs['full-path'];
      }
      if (!target || !files[target]) target = Object.keys(files).find((n) => /\.(xml|musicxml)$/i.test(n) && !/^META-INF\//.test(n));
      if (!target) throw new Error('.mxl 裡找不到樂譜檔');
      return decodeText(await get(files[target]));
    }
    return decodeText(u8);
  }

  MB.toMusicXML = toMusicXML;
  MB.parseMusicXML = parseMusicXML;
  MB.readMusicXMLBytes = readMusicXMLBytes;
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
