/*
 * 內部模型 → 點字樂譜（BANA Music Braille Code 2015）。
 * 單聲部使用 single-line format（Par. 24.1），鋼琴雙手使用 bar-over-bar（Par. 29.3）。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const M = MB.model;
  const B = MB.brf;
  const D = MB.durations;

  const NOTE = {
    C: ['Y', 'N', '?', 'D'],
    D: ['Z', 'O', ':', 'E'],
    E: ['&', 'P', '$', 'F'],
    F: ['=', 'Q', ']', 'G'],
    G: ['(', 'R', '\\', 'H'],
    A: ['!', 'S', '[', 'I'],
    B: [')', 'T', 'W', 'J'],
  };
  const REST = ['M', 'U', 'V', 'X'];
  const OCT = ['@@', '@', '^', '_', '"', '.', ';', ',', ',,'];
  const ACC = { sharp: '%', dsharp: '%%', flat: '<', dflat: '<<', natural: '*' };
  const INTERVAL = { 0: '-', 1: '/', 2: '+', 3: '#', 4: '9', 5: '0', 6: '3' };
  // Table 22(A) 的順序：琶音、斷奏、重音、持音
  const ARTIC_ORDER = ['arpeggio', 'staccato', 'staccatissimo', 'accent', 'tenuto'];
  const ARTIC = { arpeggio: '>K', staccato: '8', staccatissimo: ',8', accent: '.8', tenuto: '_8' };
  const HAND = { R: '.>', L: '_>' };
  // 讀者對倚音時值的預設讀法（依點字符號類別）：長倚音取較長時值，短倚音取常見的小時值
  const GRACE_LONG = [16, 2, 4, 8];
  const GRACE_SHORT = [16, 32, 4, 8];
  // 指法 1–5（Par. 15）；換指以 ⠉ 連接
  const FINGER = { 1: 'A', 2: 'B', 3: 'L', 4: '1', 5: 'K' };
  // 裝飾音（Table 16）：顫音、上漣音、下漣音、迴音（記在音符上方）、逆迴音
  const ORNAMENT = { trill: '6', uppermordent: '"6', mordent: '"6L', turn: ',4', invertedturn: ',4L' };
  const ORN_ORDER = ['trill', 'uppermordent', 'mordent', 'turn', 'invertedturn'];

  function fingerSigns(f) {
    if (!f) return '';
    return f
      .split('')
      .filter((d) => FINGER[d])
      .map((d) => FINGER[d])
      .join('C');
  }

  /** 一個音的指法：主要指法＋替代指法（Par. 15.4）；省略的一組以點 6（第一組）或點 3（第二組）佔位。 */
  function noteFingers(n) {
    if (n.fingerAlt === undefined || n.fingerAlt === null) return fingerSigns(n.finger);
    const first = n.finger ? fingerSigns(n.finger) : ',';
    const second = n.fingerAlt === 'x' ? "'" : fingerSigns(n.fingerAlt);
    return first + second;
  }

  /** 反覆指示的文字（Par. 20）：>D'C' AL FINE> 等。 */
  function jumpWords(j) {
    return '>' + (j.type === 'DC' ? "D'C'" : "D'S'") + (j.to === 'fine' ? ' AL FINE' : j.to === 'coda' ? ' AL CODA' : '') + '>';
  }

  function octMark(o) {
    return OCT[Math.max(0, Math.min(8, o))];
  }

  /** Par. 3.2.2：依旋律音程判斷是否需要音層記號。 */
  function needOctave(prevD, note) {
    if (prevD == null) return true;
    const dist = Math.abs(M.diatonic(note) - prevD);
    if (dist <= 2) return false;
    if (dist >= 5) return true;
    return Math.floor(prevD / 7) !== note.octave;
  }

  function keySig(fifths) {
    if (!fifths) return '';
    const s = fifths > 0 ? '%' : '<';
    const n = Math.abs(fifths);
    return n <= 3 ? s.repeat(n) : '#' + B.upperNumber(n) + s;
  }
  function naturalSig(n) {
    return n <= 3 ? '*'.repeat(n) : '#' + B.upperNumber(n) + '*';
  }
  function meterSig(m) {
    if (!m) return '';
    if (m.symbol === 'C' && m.num === 4 && m.den === 4) return '.C';
    if (m.symbol === 'C|' && m.num === 2 && m.den === 2) return '_C';
    return '#' + B.upperNumber(m.num) + B.lowerNumber(m.den);
  }
  function tempoSig(t) {
    return NOTE.C[D.valueClass(t.value)] + "'".repeat(t.dots || 0) + '7#' + B.upperNumber(t.bpm);
  }
  /** 調號（含換調時的還原記號）+ 拍號。 */
  function signatureText(key, prevKey, meter) {
    let s = '';
    if (key) {
      // 換調時先以還原記號取消原調號中不再使用的升降記號（Par. 6.5 範例）：
      // 升降類型改變或回到 C 大調時取消全部；同類型減少時取消減少的數量
      const p = prevKey ? prevKey.fifths : 0;
      const k = key.fifths;
      let cancel = 0;
      if (p && (k === 0 || Math.sign(k) !== Math.sign(p))) cancel = Math.abs(p);
      else if (p && Math.abs(k) < Math.abs(p)) cancel = Math.abs(p) - Math.abs(k);
      if (cancel) s += naturalSig(cancel);
      s += keySig(k);
    }
    if (meter) s += meterSig(meter);
    return s;
  }

  function sortedNotes(ev) {
    return ev.notes.slice().sort((a, b) => M.diatonic(a) - M.diatonic(b) || (a.alter || 0) - (b.alter || 0));
  }

  // ---------- 前置分析：圓滑線 ----------
  /**
   * style：長圓滑線（超過四個音）的寫法（Par. 13.3）。'bracket' 用 ⠰⠃…⠘⠆；'double' 在第一個音後寫 ⠉⠉、倒數第二個音後寫 ⠉。
   */
  function analyseSlurs(part, style, vocal) {
    const flags = new Map();
    const get = (id) => {
      if (!flags.has(id)) flags.set(id, { short: false, open: 0, close: 0, conv: false, converge: 0, dbl: false });
      return flags.get(id);
    };
    const maxV = Math.max(1, ...part.measures.map((m) => m.voices.length));
    for (let vi = 0; vi < maxV; vi++) {
      const stream = [];
      part.measures.forEach((m) => (m.voices[vi] || []).forEach((ev) => stream.push(ev)));
      const stack = [];
      const spans = []; // {a, b, short}
      stream.forEach((ev, idx) => {
        // 同一個音上「結束」要先於「開始」處理（一條圓滑線結束、另一條從這個音開始）
        for (let k = 0; k < (ev.slurEnd || 0); k++) {
          const a = stack.pop();
          if (a === undefined || a === idx) continue;
          const notes = stream.slice(a, idx + 1).filter((e) => e.kind === 'note');
          // 歌曲中，印刷譜的圓滑線是樂句記號，一律用括號（Par. 35.2）
          spans.push({ a, b: idx, short: !vocal && notes.length <= 4, notes });
        }
        for (let k = 0; k < (ev.slurStart || 0); k++) stack.push(idx);
      });
      // 音節圓滑線（Par. 35.2）：一個音節唱兩個以上的音（第一段歌詞），四個音以內用 ⠉，超過用加倍 ⠉⠉…⠉。
      // 只靠連結線延續同一個音高時不另加圓滑線
      if (vocal && vi === 0) {
        const notes = stream.filter((e) => e.kind === 'note');
        for (let k = 0; k < notes.length; k++) {
          const l = notes[k].lyrics && notes[k].lyrics[0];
          if (!l || l.extend) continue;
          let e = k + 1;
          while (e < notes.length && notes[e].lyrics && notes[e].lyrics[0] && notes[e].lyrics[0].extend) e++;
          const grp = notes.slice(k, e);
          const tiedOnly = grp.slice(0, -1).every((x) => x.notes.length && x.notes.every((nn) => nn.tie));
          if (grp.length >= 2 && !tiedOnly) {
            if (grp.length <= 4) grp.slice(0, -1).forEach((x) => (get(x.id).short = true));
            else {
              get(grp[0].id).dbl = true;
              get(grp[grp.length - 2].id).short = true;
            }
          }
          k = e - 1;
        }
      }
      for (const sp of spans) {
        if (sp.short) sp.notes.slice(0, -1).forEach((e) => (get(e.id).short = true));
        else if (style === 'double' && !vocal) {
          get(sp.notes[0].id).dbl = true;
          get(sp.notes[sp.notes.length - 2].id).short = true;
        } else {
          get(stream[sp.a].id).open++;
          get(stream[sp.b].id).close++;
        }
      }
      // 圓滑線交會（Par. 13.4）：一條在某音結束、另一條從同一音開始
      for (const x of spans)
        for (const y of spans) {
          if (x === y || x.b !== y.a) continue;
          if (x.short && y.short) {
            // 交會音的前一個音改寫為 ⠠⠉
            const before = x.notes[x.notes.length - 2];
            if (before) get(before.id).conv = true;
          } else if (!x.short && !y.short && (style !== 'double' || vocal)) {
            // 兩條括號式：交會音前寫 ⠰⠃⠘⠆
            const f = get(stream[x.b].id);
            f.close--;
            f.open--;
            f.converge++;
          }
        }
    }
    return flags;
  }

  // ---------- 前置分析：可省略的踏板放開記號 ----------
  function analysePedal(part) {
    const omit = new Set();
    const stream = [];
    // 依點字的聲部順序（同小節多聲部依音高排序）取第一聲部，與讀回時一致
    const dir = part.hand === 'L' || (!part.hand && part.clef === 'bass') ? 'up' : 'down';
    part.measures.forEach((m) => (orderVoices(m.voices.filter((v) => v.length), dir)[0] || []).forEach((ev) => stream.push(ev)));
    stream.forEach((ev, k) => {
      if (!ev.pedalUp) return;
      const next = stream[k + 1];
      if (!next || (next.pedalDown && !next.pedalChange)) omit.add(ev.id);
    });
    return omit;
  }

  // ---------- 音符分組（Par. 8.1） ----------
  function computeGroups(events, meter) {
    const set = new Set();
    const compound = meter.num % 3 === 0 && meter.num > 3;
    const beat = compound ? (M.TPW * 3) / meter.den : M.TPW / meter.den;
    const units = compound ? [beat, M.TPW / meter.den] : [beat, beat / 2];
    const pos = [];
    let t = 0;
    for (const ev of events) {
      pos.push(t);
      t += ev.measureRest ? 0 : M.eventTicks(ev);
    }
    const plain = (e, v) => e.kind === 'note' && e.value === v && !e.dots && !e.tuplet;
    let i = 0;
    while (i < events.length) {
      const ev = events[i];
      let done = false;
      // 分組的第一個可以是同時值的休止符（其餘仍寫成八分音符形狀）
      if (!ev.measureRest && ev.value >= 16 && ev.value <= 64 && !ev.dots && !ev.tuplet) {
        const nv = M.valueTicks(ev.value, 0);
        // 偏好較小的自然分拍（至少 4 個音），否則整拍（至少 3 個音）
        const cands = units
          .map((u) => ({ u, count: u / nv }))
          .filter((c) => Number.isInteger(c.count) && c.count >= 3)
          .sort((a, b) => a.u - b.u);
        const pick = cands.find((c) => c.count >= 4) ? cands.filter((c) => c.count >= 4) : cands;
        for (const { u, count } of pick) {
          if (pos[i] % u !== 0 || i + count > events.length) continue;
          let ok = true;
          for (let k = 1; k < count; k++) ok = ok && plain(events[i + k], ev.value);
          if (!ok) continue;
          if (events.slice(i + count).some((e) => e.value === 8 && !e.measureRest)) continue;
          for (let k = 1; k < count; k++) set.add(i + k);
          i += count;
          done = true;
          break;
        }
      }
      if (!done) i++;
    }
    return set;
  }

  /** 以判讀演算法驗證，必要時加上大／小時值記號（Par. 2.4）。 */
  function planValues(events, meter, partial, useGroups) {
    let groups = useGroups ? computeGroups(events, meter) : new Set();
    const target = M.meterTicks(meter);
    const actual = events.reduce((s, e) => s + (e.measureRest ? 0 : M.eventTicks(e)), 0);
    if (events.length === 1 && events[0].measureRest) return { groups, hints: [], mismatch: false };
    // 小節裡只有一個 16 分休止符：點字與整小節休止相同，需加小時值記號
    if (events.length === 1 && events[0].kind === 'rest' && events[0].value === 16 && !events[0].dots && !events[0].tuplet)
      return { groups, hints: ['small'], mismatch: false };
    const mismatch = actual !== target && !(partial && actual < target);
    if (mismatch) {
      // 拍數與拍號不符（不完整或過滿的小節）：不分組，並在小時值音符前標明小時值記號（Par. 2.4），
      // 讀者無法靠小節長度判斷時值
      // 第一個音再加大時值記號，告訴讀者「這小節照記號讀」
      return { groups: new Set(), hints: events.map((e, k) => (e.value >= 16 && !e.measureRest ? 'small' : k === 0 ? 'large' : null)), mismatch };
    }
    const itemsFor = (hints) =>
      events.map((e, k) => ({
        cls: groups.has(k) ? 3 : D.valueClass(e.value),
        rest: e.kind === 'rest',
        dots: e.dots || 0,
        factor: e.tuplet ? { n: e.tuplet.n, of: e.tuplet.of } : null,
        hint: hints[k] || null,
      }));
    const matches = (res) => res && res.values.every((v, k) => v === events[k].value);
    const tgt = mismatch ? actual : target;
    const part = partial || mismatch;
    let hints = [];
    let res = D.solve(itemsFor(hints), tgt, part);
    if (!matches(res) && groups.size) {
      groups = new Set();
      res = D.solve(itemsFor(hints), tgt, part);
    }
    let guard = 0;
    while (!matches(res) && guard++ < events.length + 1) {
      let k = 0;
      if (res) while (k < events.length && res.values[k] === events[k].value) k++;
      else {
        // 無解：在每次大小時值轉換處都加上記號
        let prevSmall = false;
        events.forEach((e, j) => {
          const small = e.value >= 16;
          if (small !== prevSmall || j === 0) hints[j] = small ? 'small' : 'large';
          prevSmall = small;
        });
        break;
      }
      if (k >= events.length) break;
      if (hints[k]) break;
      hints[k] = events[k].value >= 16 ? 'small' : 'large';
      res = D.solve(itemsFor(hints), tgt, part);
    }
    // 開頭的「大時值」記號多半不需要
    return { groups, hints, mismatch };
  }

  // ---------- 單一事件 ----------
  function renderEvent(ev, ctx) {
    const flags = ctx.slurs.get(ev.id) || { short: false, open: 0, close: 0 };
    const cls = ctx.asEighth ? 3 : D.valueClass(ev.value);
    let head = '';
    // 踏板踩下／換踏板放在最前面（Par. 29.10.1）
    if (ev.pedalChange) head += '*<C';
    else if (ev.pedalDown) head += '<C';
    if (ctx.hint) head += ctx.hint === 'large' ? '^<1' : ',<1';
    let needOct = ctx.force;
    let words = '';
    if (ev.dynamic) words += '>' + ev.dynamic.toUpperCase();
    if (ev.hairpinStart) words += ev.hairpinStart === 'cresc' ? '>C' : '>D';
    if (words) needOct = true;

    let r = '';
    // 倚音（Par. 16.2）：單一無斜線為長倚音 ⠐⠢，其餘為短倚音 ⠢；不計入小節時值
    const graces = ev.graces || [];
    graces.forEach((gr, gk) => {
      const gn = gr.notes[0];
      const long = graces.length === 1 && !gr.slash;
      // 連續四個以上的倚音：第一個寫 ⠢⠢、中間不寫、最後一個寫 ⠢（Par. 16.2）
      const sign = long ? '"5' : graces.length < 4 ? '5' : gk === 0 ? '55' : gk === graces.length - 1 ? '5' : '';
      // 倚音不計入小節時值，讀者無法靠小節長度判斷；與預設讀法不同時加大／小時值記號（Par. 2.4）
      const gcls = D.valueClass(gr.value);
      const assumed = (long ? GRACE_LONG : GRACE_SHORT)[gcls];
      if (assumed !== gr.value) r += gr.value >= 16 ? ',<1' : '^<1';
      r += sign;
      if (gn.accidental) r += ACC[gn.accidental];
      if (!ctx.noOctave && (needOct || needOctave(ctx.prev, gn))) r += octMark(gn.octave);
      needOct = false;
      r += NOTE[gn.step][D.valueClass(gr.value)] + "'".repeat(gr.dots || 0);
      ctx.prev = M.diatonic(gn);
    });
    // 括號圓滑線先於連音記號（圓滑線包住整組連音）
    r += ';B^2'.repeat(flags.converge || 0) + ';B'.repeat(flags.open);
    if (ev.tuplet && ev.tuplet.start) r += ev.tuplet.n === 3 && ev.tuplet.of === 2 ? '2' : '_' + B.lowerNumber(ev.tuplet.n) + "'";
    const artic = ev.articulations || [];
    for (const a of ARTIC_ORDER) if (artic.includes(a)) r += ARTIC[a];
    // 裝飾音記號放在音符、臨時記號、音層記號之前（Par. 16.3–16.5）
    const orn = ev.ornaments || [];
    if (ev.kind === 'note') for (const o of ORN_ORDER) if (orn.includes(o)) r += ORNAMENT[o];

    let tail = '';
    if (ev.kind === 'rest') {
      r += ev.measureRest ? 'M' : REST[cls] + "'".repeat(ev.dots || 0);
      if (artic.includes('fermata')) r += '<L';
    } else {
      const notes = sortedNotes(ev);
      const down = ctx.dir === 'down';
      const written = down ? notes[notes.length - 1] : notes[0];
      const others = down ? notes.slice(0, -1).reverse() : notes.slice(1);
      const tied = notes.filter((n) => n.tie).length;
      const chordTie = tied >= 2;
      if (written.accidental) r += ACC[written.accidental];
      if (!ctx.noOctave && (needOct || needOctave(ctx.prev, written))) r += octMark(written.octave);
      r += NOTE[written.step][cls] + "'".repeat(ev.dots || 0);
      // 指法緊接在音符（含附點）之後（Par. 15.1）
      r += noteFingers(written);
      // 和弦中只有主音有連結線：緊接在主音（與附點、指法）之後、音程之前（Par. 10.1）
      if (!chordTie && written.tie && others.length) r += '@C';
      const wd = M.diatonic(written);
      const given = [];
      let prevD = wd;
      others.forEach((n, i) => {
        const nd = M.diatonic(n);
        const dist = Math.abs(nd - wd);
        const mark =
          dist === 0 ||
          (i === 0 && dist > 7) ||
          (i > 0 && Math.abs(nd - prevD) >= 7) ||
          given.includes(nd);
        if (n.accidental) r += ACC[n.accidental];
        if (mark) r += octMark(n.octave);
        r += INTERVAL[dist % 7];
        r += noteFingers(n);
        if (!chordTie && n.tie) r += '@C';
        given.push(nd);
        prevD = nd;
      });
      ctx.prev = wd;
      if (artic.includes('fermata')) tail += '<L';
      if (flags.dbl) tail += 'CC';
      else if (flags.short) tail += flags.conv ? ',C' : 'C';
      tail += '^2'.repeat(flags.close);
      if (chordTie) tail += '.C';
      else if (written.tie && !others.length) tail += '@C';
    }
    if (flags.close && ev.kind === 'rest') tail += '^2'.repeat(flags.close);
    // 踏板放開：在音符、連結線、圓滑線、指法之後；若下一音緊接著踩下，或在樂曲結尾，則省略（Par. 29.10.1）
    if (ev.pedalUp && !(ctx.pedalOmit && ctx.pedalOmit.has(ev.id))) tail += '*C';
    let after = '';
    if (ev.hairpinEnd) after = ev.hairpinEnd === 'cresc' ? '>3' : '>4';

    let s = head + words;
    const body = r + tail;
    if (words && B.hasDots123(body[0])) s += "'";
    s += body + after;
    ctx.wordEnd = !!after;
    return s;
  }

  // ---------- 小節 ----------
  function orderVoices(voices, dir) {
    if (voices.length < 2) return voices;
    const avg = (v) => {
      const ds = [];
      v.forEach((e) => e.notes.forEach((n) => ds.push(M.diatonic(n))));
      return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
    };
    return voices.slice().sort((a, b) => (dir === 'down' ? avg(b) - avg(a) : avg(a) - avg(b)));
  }

  /**
   * 產生一個小節的片段。forced：需強制加音層記號的事件索引（第一聲部）。
   * 回傳 {pieces: [{text, id}], prev, inaccord}
   */
  function renderMeasure(part, mi, env, opt) {
    const m = part.measures[mi];
    const meter = M.meterAt(part, mi);
    const dir = part.hand === 'L' || (!part.hand && part.clef === 'bass') ? 'up' : 'down';
    const last = mi === part.measures.length - 1;
    const voices = orderVoices(m.voices.filter((v) => v.length), dir);
    const pieces = [];
    // noOctave：教材初期尚未教音層記號的練習（僅供比對測試使用）
    const ctx = { prev: opt.prev, dir, slurs: env.slurs, pedalOmit: env.pedalOmit, noOctave: !!env.opts.suppressOctaveMarks };
    let prefix = '';
    if (m.startRepeat) prefix += '<7';
    if (m.volta) prefix += '#' + B.lowerNumber(m.volta);
    voices.forEach((voice, vi) => {
      // 被拆開的小節（兩半）各自不完整，屬正常情形
      const split = !!m.splitCont || !!(part.measures[mi + 1] && part.measures[mi + 1].splitCont);
      const plan = planValues(voice, meter, last || split || M.mayBeIncomplete(part, mi), opt.grouping && env.opts.grouping);
      if (plan.mismatch && !env.warned.has(part.id + ':' + mi + ':' + vi)) {
        env.warned.add(part.id + ':' + mi + ':' + vi);
        env.warnings.push({ msg: '第 ' + env.numbers[mi] + ' 小節' + (part.hand ? (part.hand === 'R' ? '（右手）' : '（左手）') : '') + '的拍數與拍號不符', measure: mi });
      }
      ctx.wordEnd = false;
      const reps = opt.partRepeat !== false && env.opts.measureRepeat && env.opts.partRepeat && !split ? partRepeats(voice, meter, plan.groups) : null;
      let repEnd = 0;
      voice.forEach((ev, ei) => {
        if (ei < repEnd) return;
        if (reps && reps.has(ei)) {
          const len = reps.get(ei);
          const lastEv = voice[ei + len - 1];
          const tie = lastEv.notes && lastEv.notes.some((x) => x.tie) ? '@C' : '';
          pieces.push({ text: (ctx.wordEnd ? "'" : '') + '7' + tie, id: null, ids: voice.slice(ei, ei + len).map((x) => x.id), vi, ei, cont: true });
          ctx.wordEnd = false;
          repEnd = ei + len;
          return;
        }
        // 前一小節以文字記號（如漸強結束 ⠜⠒）結束：這一小節第一個音要寫音層記號（Par. 22.3(e)），但不加點 3（22.3(d)(1)）
        const afterWord = vi === 0 && ei === 0 && !!opt.afterWord;
        ctx.force = (vi > 0 ? ei === 0 : ei === 0 && opt.forceFirst) || (opt.forced && opt.forced.has(vi + ':' + ei)) || ctx.wordEnd || afterWord;
        const wasWordEnd = ctx.wordEnd;
        ctx.asEighth = plan.groups.has(ei);
        ctx.hint = plan.hints[ei];
        let text = renderEvent(ev, ctx);
        if (wasWordEnd && B.hasDots123(text[0])) text = "'" + text;
        if (vi > 0 && ei === 0) text = '<>' + text;
        pieces.push({ text, id: ev.id, vi, ei, cont: !!ctx.asEighth }); // cont：分組中的後續音
      });
    });
    const endsWithWord = ctx.wordEnd; // 小節最後寫的是文字記號（下一小節第一個音要寫音層記號）
    if (!pieces.length) pieces.push({ text: 'M', id: null, vi: 0, ei: 0 });
    if (prefix) {
      const first = pieces[0];
      const sep = m.volta && B.hasDots123(first.text[0]) ? "'" : '';
      first.text = prefix + sep + first.text;
    }
    let suffix = '';
    if (m.endRepeat) suffix = '<2';
    // 終止線照原譜（摘錄的片段可能沒有終止線）
    else if (m.barline === 'final') suffix = '<K';
    else if (m.barline === 'double') suffix = "<K'";
    // 小節被拆開：前半結尾加音樂連字號（Par. 17.1）
    if (part.measures[mi + 1] && part.measures[mi + 1].splitCont) suffix += '"';
    // 小節結尾的反覆指示（Par. 20）：Coda 記號各手都寫；Fine、D.C.、D.S. 文字寫在右手（或單聲部）
    if (m.toCoda) suffix += ' +L';
    if (part.hand !== 'L') {
      if (m.fine) suffix += ' >FINE>';
      if (m.jump) suffix += ' ' + jumpWords(m.jump);
    }
    pieces[pieces.length - 1].text += suffix;
    return { pieces, prev: ctx.prev, inaccord: voices.length > 1, wordEnd: endsWithWord };
  }

  function piecesText(pieces) {
    return pieces.map((p) => p.text).join('');
  }

  // ---------- 行 ----------
  function Line(prefix) {
    this.text = prefix || '';
    this.spans = [];
    this.content = false;
  }
  Line.prototype.add = function (str, id, measure) {
    const s = this.text.length;
    this.text += str;
    if (id || measure != null) this.spans.push({ id, start: s, end: this.text.length, measure });
    this.content = true;
  };
  Line.prototype.addPieces = function (pieces, mi) {
    for (const p of pieces) {
      const s = this.text.length;
      this.add(p.text, p.id, mi);
      // 小節重複記號：被重複小節的每個音都對應到 ⠶
      if (p.ids) for (const id of p.ids) this.spans.push({ id, start: s, end: this.text.length, measure: mi });
    }
  };

  function center(text, width) {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(pad) + text;
  }

  // ---------- 主程式 ----------
  function toBraille(score, options) {
    const opts = Object.assign({ width: 40, grouping: true, segmentLines: 3, measureRepeat: true, partRepeat: true }, options || {});
    const warnings = [];
    const lines = [];
    const numbers = M.measureNumbers(score);
    const env = { opts, warnings, numbers, warned: new Set(), slurs: null, pedalOmit: new Set() };
    score.parts.forEach((p) => analysePedal(p).forEach((id) => env.pedalOmit.add(id)));
    const first = score.parts[0];
    if (!first || !first.measures.length) return finish([], warnings);

    // 樂曲標頭（Par. 1.7）：速度、調號、拍號置中
    const m0 = first.measures[0];
    const headParts = [];
    if (score.tempo) headParts.push(tempoSig(score.tempo));
    const sig = signatureText(m0.key, null, m0.meter);
    if (sig) headParts.push(sig);
    if (headParts.length) {
      const l = new Line();
      l.add(center(headParts.join(' '), opts.width));
      lines.push(l);
    }

    if (score.keyboard) {
      if (score.parts.some((p) => p.measures.some((m) => m.voices.some((v) => v.some((ev) => ev.lyrics)))))
        warnings.push({ msg: '鋼琴譜中的歌詞目前不轉成點字（歌曲請用單一聲部）' });
      writeKeyboard(score, env, lines);
    } else {
      env.vocal = vocalLayout(score.parts[0], env);
      writeSingleLine(score.parts[0], env, lines);
    }
    return finish(lines, warnings);
  }

  function finish(lines, warnings) {
    let brf = '';
    const map = [];
    lines.forEach((l, i) => {
      const off = brf.length;
      const text = l.text.replace(/\s+$/, '');
      brf += text + (i < lines.length - 1 ? '\n' : '');
      l.spans.forEach((s) => map.push({ id: s.id, start: off + s.start, end: off + s.end, measure: s.measure }));
    });
    return { brf, unicode: B.toUnicode(brf), map, warnings };
  }

  function needsForce(part, mi, prevInaccord) {
    const m = part.measures[mi];
    const p = part.measures[mi - 1];
    if (!p) return true;
    return (
      !!m.startRepeat || !!m.volta || !!m.key || !!m.meter || prevInaccord ||
      p.barline === 'double' || p.barline === 'final' || !!p.endRepeat ||
      // 反覆指示之後的第一個音要加音層記號（Par. 20.1）
      !!m.segno || !!m.codaStart || !!p.toCoda || !!p.fine || !!p.jump
    );
  }

  /** 將一小節拆成多行（Par. 1.11 音樂連字號）。回傳各行的片段陣列。 */
  function splitMeasure(part, mi, env, prev, firstRoom, fullRoom, forceFirst) {
    if (forceFirst === undefined) forceFirst = true;
    // 先保留音符分組，只在分組與分組之間換行（Par. 8.1.1(b) 只禁止「被斷開的那一組」）；
    // 若有一組長到一行放不下，才整個小節不分組
    const attempt = (grouping) => {
      const rows = [];
      const forced = new Set(forceFirst ? ['0:0'] : []);
      let start = 0;
      let room = firstRoom;
      let guard = 0;
      while (guard++ < 50) {
        // 部分小節重複不能跨行（Par. 18.3.3(b)）：要拆開的小節全部寫出
        const r = renderMeasure(part, mi, env, { prev, forceFirst, forced, grouping, partRepeat: false });
        const ps = r.pieces; // 所有聲部（含 in-accord）的片段
        let used = 0;
        let k = start;
        const row = [];
        while (k < ps.length) {
          const w = ps[k].text.length;
          const isLast = k === ps.length - 1;
          if (used + w + (isLast ? 0 : 1) > room && row.length) break;
          row.push(ps[k]);
          used += w;
          k++;
        }
        if (k >= ps.length) {
          rows.push(row);
          return { rows, prev: r.prev };
        }
        // 不在分組中間換行：退回到分組的開頭
        while (k > start && ps[k].cont) {
          row.pop();
          k--;
        }
        if (k === start) return null;
        row.push({ text: '"', id: null });
        rows.push(row);
        forced.add(ps[k].vi + ':' + ps[k].ei); // 換行後第一個音要加音層記號
        start = k;
        room = fullRoom;
      }
      return null;
    };
    return attempt(true) || attempt(false) || { rows: [], prev };
  }


  /**
   * 連續整小節休止（Par. 5.3）：從 mi 開始可以合併的小節數。
   * 只合併「只有一個整小節休止、沒有其他記號」的小節；中間換調、換拍號、反覆、房號等就停止。
   */
  /**
   * 小節重複記號（Par. 18.2）：第 mi 小節和前一小節完全相同時回傳 true。
   * 力度、奏法、指法、連結線等都要相同；最後一個音的連結線不算在內（寫在 ⠶ 後面，18.1.2）。
   * 圓滑線、漸強漸弱必須在小節內開始並結束；整小節休止、踏板、反覆指示、換調換拍號、被拆開的小節都不用。
   */
  // 歌詞不影響重複記號（Par. 35.8），但音節圓滑線依「一個音節唱幾個音」而定，所以只比較這個形狀
  const lyricShape = (lyrics) => lyrics.map((l) => (l ? (l.extend ? 'x' : 's') : '-')).join('');

  function sameAsPrev(part, mi) {
    const a = part.measures[mi - 1];
    const b = part.measures[mi];
    if (!a || !b) return false;
    if (b.key || b.meter || b.startRepeat || b.volta || b.segno || b.codaStart || b.toCoda || b.fine || b.jump) return false;
    if (a.splitCont || b.splitCont || (part.measures[mi + 1] && part.measures[mi + 1].splitCont)) return false;
    const evs = (m) => [].concat(...m.voices);
    const ok = (m) => {
      const e = evs(m);
      if (!e.length || e.some((x) => x.measureRest || x.pedalDown || x.pedalUp || x.pedalChange)) return false;
      const sum = (f) => e.reduce((t, x) => t + (+x[f] || 0), 0);
      const cnt = (f) => e.filter((x) => x[f]).length;
      return sum('slurStart') === sum('slurEnd') && cnt('hairpinStart') === cnt('hairpinEnd');
    };
    if (!ok(a) || !ok(b)) return false;
    const lastOf = (m) => { const v = m.voices.filter((x) => x.length).pop(); return v[v.length - 1]; };
    if ((lastOf(b).notes || []).length > 1 && lastOf(b).notes.some((n) => n.tie)) return false;
    const sig = (m) =>
      JSON.stringify(
        m.voices.map((v) =>
          v.map((ev, k) => {
            const c = Object.assign({}, ev);
            delete c.id;
            delete c.src;
            if (c.lyrics) c.lyrics = lyricShape(c.lyrics);
            if (k === v.length - 1) c.notes = (c.notes || []).map((n) => Object.assign({}, n, { tie: false }));
            return c;
          })
        )
      );
    return sig(a) === sig(b);
  }
  /** 小節重複記號後面要接的符號：最後一個音的連結線、反覆結束或雙縱線、終止線（18.1.2、18.1.6）。 */
  function repeatTail(m) {
    const v = m.voices.find((x) => x.length);
    const lastEv = v[v.length - 1];
    let t = lastEv.notes && lastEv.notes.some((n) => n.tie) ? '@C' : '';
    if (m.endRepeat) t += '<2';
    else if (m.barline === 'final') t += '<K';
    else if (m.barline === 'double') t += "<K'";
    return t;
  }
  const measureIds = (m) => [].concat(...m.voices).map((ev) => ev.id);

  /**
   * 部分小節重複（Par. 18.3）：找出一個聲部裡可以寫成 ⠶ 的片段。回傳 Map（片段第一個音的索引 → 片段長度），沒有則回傳 null。
   * (a) 後半小節重複前半、(b) 一整拍立刻重複、(c) 拍子的一半立刻重複：依序找較大的單位，只用一種單位；
   * (d) 用音程寫的和弦立刻重複。片段必須完全相同（最後一個音的連結線除外，寫在 ⠶ 後面），
   * 圓滑線、漸強漸弱要在片段內開始並結束，也不能把點字的音符分組切開。
   */
  function partRepeats(voice, meter, groups) {
    const n = voice.length;
    if (n < 2 || voice.some((ev) => ev.measureRest || ev.pedalDown || ev.pedalUp || ev.pedalChange)) return null;
    const offs = [];
    let total = 0;
    voice.forEach((ev, i) => {
      offs[i] = total;
      total += M.eventTicks(ev);
    });
    if (total !== M.meterTicks(meter)) return null; // 只用在完整的小節
    const sigEv = (ev, isLast) => {
      const c = Object.assign({}, ev);
      delete c.id;
      delete c.src;
      if (c.lyrics) c.lyrics = lyricShape(c.lyrics);
      if (isLast) c.notes = (c.notes || []).map((x) => Object.assign({}, x, { tie: false }));
      return JSON.stringify(c);
    };
    const balanced = (a, b) => {
      let sl = 0;
      let hp = 0;
      for (let i = a; i < b; i++) {
        const ev = voice[i];
        sl += (ev.slurStart || 0) - (ev.slurEnd || 0);
        if (sl < 0) return false;
        hp += (ev.hairpinStart ? 1 : 0) - (ev.hairpinEnd ? 1 : 0);
      }
      return sl === 0 && hp === 0;
    };
    const tiedChordEnd = (b) => voice[b - 1].notes && voice[b - 1].notes.length > 1 && voice[b - 1].notes.some((x) => x.tie);
    const same = (a0, a1, b0, b1) => {
      if (a1 - a0 !== b1 - b0) return false;
      for (let j = 0; j < a1 - a0; j++) if (sigEv(voice[a0 + j], j === a1 - a0 - 1) !== sigEv(voice[b0 + j], j === b1 - b0 - 1)) return false;
      return true;
    };
    const { num, den } = meter;
    const compound = den === 8 && num % 3 === 0 && num > 3;
    const beat = compound ? (3 * M.TPW) / 8 : M.TPW / den;
    const units = [total / 2, beat, compound ? M.TPW / 8 : beat / 2];
    const at = new Map(offs.map((o, i) => [o, i]));
    at.set(total, n);
    for (const U of units) {
      if (!Number.isInteger(U) || U <= 0 || total % U) continue;
      const segs = [];
      for (let t = 0; t < total; t += U) {
        if (!at.has(t) || !at.has(t + U)) {
          segs.length = 0;
          break;
        }
        segs.push([at.get(t), at.get(t + U)]);
      }
      if (segs.length < 2) continue;
      const res = new Map();
      for (let k = 1; k < segs.length; k++) {
        const [a0, a1] = segs[k - 1];
        const [b0, b1] = segs[k];
        if (!same(a0, a1, b0, b1) || !balanced(a0, a1) || !balanced(b0, b1) || tiedChordEnd(b1)) continue;
        // 只有一個單音時 ⠶ 並不比原本短，反而難讀：至少兩個音，或是一個和弦
        if (b1 - b0 < 2 && !(voice[b0].notes && voice[b0].notes.length > 1)) continue;
        // 不能把點字的音符分組切開
        if (groups.has(a0) || groups.has(b0) || (b1 < n && groups.has(b1))) continue;
        res.set(b0, b1 - b0);
      }
      if (res.size) return res;
    }
    // (d) 和弦立刻重複（不含連結線）
    const res = new Map();
    for (let i = 1; i < n; i++) {
      const a = voice[i - 1];
      const b = voice[i];
      if (!b.notes || b.notes.length < 2 || groups.has(i)) continue;
      if ([a, b].some((ev) => ev.notes.some((x) => x.tie) || ev.slurStart || ev.slurEnd || ev.hairpinStart || ev.hairpinEnd)) continue;
      if (sigEv(a, false) === sigEv(b, false)) res.set(i, 1);
    }
    return res.size ? res : null;
  }

  function restRun(part, mi) {
    const plain = (m, first) => {
      const v = m.voices.filter((x) => x.length);
      if (v.length !== 1 || v[0].length !== 1) return false;
      const ev = v[0][0];
      if (!ev.measureRest || ev.dynamic || (ev.articulations && ev.articulations.length) || ev.hairpinStart || ev.hairpinEnd) return false;
      if (ev.slurStart || ev.slurEnd || ev.pedalDown || ev.pedalUp || ev.pedalChange) return false;
      if (!first && (m.key || m.meter)) return false;
      return !m.startRepeat && !m.endRepeat && !m.volta && !m.segno && !m.codaStart && !m.toCoda && !m.fine && !m.jump && !m.splitCont;
    };
    // 最後一小節可以帶雙縱線或終止線（寫在 ⠍ 後面）
    let n = 0;
    while (mi + n < part.measures.length && plain(part.measures[mi + n], n === 0)) {
      n++;
      if (part.measures[mi + n - 1].barline !== 'single') break;
    }
    return n;
  }

  /** 歌詞的外文字母、數字與標點（不縮寫的英文點字，Par. 35.1.1）。回傳 BRF；不認得的字元回傳 null。 */
  function latinBrf(ch, state) {
    if (/[a-z]/.test(ch)) return ch.toUpperCase();
    if (/[A-Z]/.test(ch)) return ',' + ch;
    if (/[0-9]/.test(ch)) {
      const r = (state.digit ? '' : '#') + B.upperNumber(+ch);
      state.digit = true;
      return r;
    }
    state.digit = false;
    const P = { "'": "'", ',': '1', '.': '4', '!': '6', '?': '8', ';': '2', ':': '3', '-': '-' };
    return P[ch] != null ? P[ch] : null;
  }

  /**
   * 歌曲（Par. 35.1）：分段（每段一個平行段）與歌詞行。歌詞從行首寫起，音樂在下一行從第 3 方開始。
   * 分段依原本 ABC 的分行；沒有分行資訊（例如 MusicXML）時每 4 小節一段。只轉換第一段歌詞。
   * 中文用國語點字（工具集的 zh-tw.ctb）；沒有載入時無法轉換，就不寫歌詞。沒有歌詞時回傳 null。
   */
  function vocalLayout(part, env) {
    const { opts } = env;
    if (opts.lyrics === false) return null;
    const lyr0 = (ev) => ev.lyrics && ev.lyrics[0];
    const all = [];
    part.measures.forEach((m) => (m.voices[0] || []).forEach((ev) => lyr0(ev) && lyr0(ev).text && all.push(ev)));
    if (!all.length) return null;
    const zh = MB.zhBraille;
    const isZh = (ch) => /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch);
    const needZh = all.some((ev) => [...lyr0(ev).text].some(isZh));
    if (needZh && !(zh && zh.isLoaded())) {
      env.warnings.push({ msg: '國語點字表沒有載入，中文歌詞無法轉成點字，這次輸出沒有歌詞（放在視障輔助工具集裡才能使用）' });
      return null;
    }
    if (part.measures.some((m) => (m.voices[0] || []).some((ev) => ev.lyrics && ev.lyrics.length > 1)))
      env.warnings.push({ msg: '有兩段以上的歌詞：點字目前只寫第一段' });
    const N = part.measures.length;
    const starts = [];
    // 來自 ABC 的樂譜有分行資訊（第一小節一定標記）；整首只有一行時就是一個平行段
    if (part.measures[0].lineStart) part.measures.forEach((m, i) => (i === 0 || m.lineStart) && starts.push(i));
    else for (let i = 0; i < N; i += 4) starts.push(i);
    const W = opts.width;
    const unknown = new Set();
    const linesAt = new Map();
    starts.forEach((st, k) => {
      const end = k + 1 < starts.length ? starts[k + 1] : N;
      const sylls = [];
      for (let mi = st; mi < end; mi++) for (const ev of part.measures[mi].voices[0] || []) if (lyr0(ev) && lyr0(ev).text) sylls.push({ l: lyr0(ev), id: ev.id, mi });
      if (!sylls.length) return;
      // 中文整段一起轉，多音字才能看前後文
      const zhOut = needZh ? zh.translate(sylls.map((x) => x.l.text).join('')) : null;
      let pos = 0;
      const pieces = sylls.map((x) => {
        let brl = '';
        let cjk = false;
        const st2 = { digit: false };
        for (const ch of x.l.text) {
          const t = zhOut ? zhOut[pos] : null;
          pos++;
          if (isZh(ch)) {
            cjk = true;
            if (t && t.known) brl += B.toBrf(t.brl);
            else unknown.add(ch);
          } else {
            const b = latinBrf(ch, st2);
            if (b == null) unknown.add(ch);
            else brl += b;
          }
        }
        const joined = x.l.syllabic === 'begin' || x.l.syllabic === 'middle';
        return { brl, id: x.id, mi: x.mi, cjk, joined };
      });
      const out = [new Line('')];
      let cur = out[0];
      pieces.forEach((pc, j) => {
        const prevPc = pieces[j - 1];
        // 中文字之間依設定連寫或空一方；外文同一個字的音節連寫（不寫連字號），字與字之間空一方
        let sep = '';
        if (prevPc) sep = prevPc.cjk && pc.cjk ? (opts.lyricSpacing === 'space' ? ' ' : '') : prevPc.joined ? '' : ' ';
        if (cur.content && cur.text.length + sep.length + pc.brl.length > W) {
          cur = new Line('    '); // 續行從第 5 方開始（Par. 35.1）
          out.push(cur);
          sep = '';
        }
        if (sep) cur.add(sep);
        if (pc.brl) cur.add(pc.brl, pc.id, pc.mi);
      });
      linesAt.set(st, out);
    });
    if (unknown.size) env.warnings.push({ msg: '歌詞中這些字元無法轉成點字，已略過：' + [...unknown].join(' ') });
    return { starts: new Set(starts), linesAt };
  }

  function writeSingleLine(part, env, lines) {
    const { opts, numbers } = env;
    const vocal = env.vocal; // 歌曲（Par. 35.1）：一行歌詞、一行音樂，沒有段落編號
    env.slurs = analyseSlurs(part, opts.slurStyle, !!vocal);
    const W = opts.width;
    let line = null;
    let phraseStart = false; // 目前這一行是平行段的第一行音樂
    let segLines = 0;
    let prev = null;
    let prevInaccord = false;
    let atLineStart = true;
    let prevKey = part.measures[0].key;

    const flush = () => {
      if (line && line.content) lines.push(line);
      line = null;
    };
    const newLine = (mi) => {
      flush();
      if (vocal) {
        line = new Line('    '); // 平行段內的續行從第 5 方開始
        phraseStart = false;
        atLineStart = true;
        return;
      }
      if (segLines >= opts.segmentLines || lines.length === 0 || segLines === 0) {
        // 段落從被拆開小節的後半開始時，編號後加點 3（Par. 24.1.1）
        line = new Line('#' + B.upperNumber(numbers[mi]) + (part.measures[mi].splitCont ? "' " : ' '));
        segLines = 1;
      } else {
        line = new Line('  ');
        segLines++;
      }
      atLineStart = true;
    };
    const room = () => W - line.text.length - (line.content ? 1 : 0);
    const put = (pieces, mi) => {
      if (line.content) line.add(' ');
      line.addPieces(pieces, mi);
      atLineStart = false;
    };

    segLines = 0;
    let skip = 0; // 已併入前面連續休止的小節數
    let afterLongRest = false; // 四小節以上的連續休止之後，下一個音要寫音層記號（Par. 5.3）
    let prevWordEnd = false; // 前一小節以文字記號結束
    part.measures.forEach((m, mi) => {
      if (skip) {
        skip--;
        return;
      }
      // 歌曲：新的平行段，先寫歌詞行，音樂從第 3 方開始
      if (vocal && vocal.starts.has(mi)) {
        flush();
        for (const l of vocal.linesAt.get(mi) || []) lines.push(l);
        line = new Line('  ');
        phraseStart = true;
        atLineStart = true;
      }
      // Segno 與 Coda 段落都要另起一段（Par. 20.1.1、20.1.5）
      if (mi > 0 && (m.segno || m.codaStart)) {
        flush();
        segLines = 0;
      }
      if (m.codaStart) {
        const l = new Line();
        l.add('>CODA>');
        lines.push(l);
      }
      if (!line) newLine(mi);
      if (m.segno) put([{ text: '+', id: null }], mi);
      // 中途換調或換拍號
      if (mi > 0 && (m.key || m.meter)) {
        const sig = signatureText(m.key, prevKey, m.meter);
        if (sig) {
          if (sig.length > room()) newLine(mi);
          put([{ text: sig, id: null }], mi);
        }
      }
      if (m.key) prevKey = m.key;
      // 小節重複記號（Par. 18.2）：和前一小節完全相同就寫 ⠶；連續三次以上寫 ⠶ 加數字，之後的音寫音層記號（18.2.1）。
      // 可以在段落中換行後使用，但不用在新一段的開頭（讀者要能在同一段找到被重複的小節）
      if (opts.measureRepeat && sameAsPrev(part, mi)) {
        let n = 1;
        while (sameAsPrev(part, mi + n) && !repeatTail(part.measures[mi + n - 1])) n++;
        if (n < 3) n = 1;
        const text = (n >= 3 ? '7#' + B.upperNumber(n) : '7') + repeatTail(part.measures[mi + n - 1]);
        if (text.length > room()) newLine(mi);
        // 歌曲中，被重複的小節要在同一個平行段（Par. 35.8）
        if (vocal ? line.content || !phraseStart : line.content || !line.text.startsWith('#')) {
          const ids = [].concat(...part.measures.slice(mi, mi + n).map(measureIds));
          put([{ text, id: null, ids }], mi);
          skip = n - 1;
          afterLongRest = n >= 3;
          prevInaccord = false;
          if (!vocal && segLines >= opts.segmentLines && room() < 3) flush();
          return;
        }
      }
      // 連續兩、三小節休止：整小節休止連寫不空方；四小節以上：數字記號、小節數、一個整小節休止（Par. 5.3）
      const run = restRun(part, mi);
      if (run >= 2) {
        const ids = part.measures.slice(mi, mi + run).map((x) => x.voices.find((v) => v.length)[0].id);
        const bl = part.measures[mi + run - 1].barline;
        const tail = bl === 'final' ? '<K' : bl === 'double' ? "<K'" : '';
        const text = (run <= 3 ? 'M'.repeat(run) : '#' + B.upperNumber(run) + 'M') + tail;
        if (text.length > room()) newLine(mi);
        if (line.content) line.add(' ');
        if (run <= 3) ids.forEach((id, k) => line.add('M', id, mi + k));
        else {
          line.add('#' + B.upperNumber(run), null, mi);
          const at = line.text.length;
          line.add('M', ids[0], mi);
          ids.slice(1).forEach((id, k) => line.spans.push({ id, start: at, end: at + 1, measure: mi + k + 1 }));
        }
        if (tail) line.add(tail);
        atLineStart = false;
        afterLongRest = run >= 4;
        prevWordEnd = false;
        prevInaccord = false;
        skip = run - 1;
        if (!vocal && segLines >= opts.segmentLines && room() < 3) flush();
        return;
      }
      const force = atLineStart || afterLongRest || needsForce(part, mi, prevInaccord);
      afterLongRest = false;
      let r = renderMeasure(part, mi, env, { prev, forceFirst: force, grouping: true, afterWord: prevWordEnd });
      let text = piecesText(r.pieces);
      if (text.length <= room()) {
        put(r.pieces, mi);
      } else {
        const full = W - 2;
        // 放得進一整行的小節移到下一行；本來就放不下的長小節，直接從目前這一行開始寫再斷行
        const startHere = !atLineStart && text.length > full && room() >= 8;
        if (!atLineStart && !startHere) {
          newLine(mi);
          r = renderMeasure(part, mi, env, { prev, forceFirst: true, grouping: true, afterWord: prevWordEnd });
          text = piecesText(r.pieces);
        }
        if (text.length <= room()) {
          put(r.pieces, mi);
        } else {
          const sp = splitMeasure(part, mi, env, prev, room(), full, startHere ? force : true);
          sp.rows.forEach((row, k) => {
            if (k > 0) {
              flush();
              line = new Line(vocal ? '    ' : '  ');
              segLines++;
            }
            put(row, mi);
          });
          r = { prev: sp.prev, inaccord: false };
        }
      }
      prev = r.prev;
      prevInaccord = r.inaccord;
      prevWordEnd = !!r.wordEnd;
      // 分段：達到行數上限時，下一小節另起一段
      if (!vocal && segLines >= opts.segmentLines && room() < 3) flush();
    });
    flush();
  }

  function writeKeyboard(score, env, lines) {
    const { opts, numbers } = env;
    const [rh, lh] = score.parts;
    const W = opts.width;
    const numW = Math.max(...numbers.map((n) => String(n).length));
    const slR = analyseSlurs(rh, opts.slurStyle);
    const slL = analyseSlurs(lh, opts.slurStyle);
    const pad = (n) => ' '.repeat(numW - String(n).length) + B.upperNumber(n);
    const indent = ' '.repeat(numW + 1);
    let prevKey = rh.measures[0].key;

    const handText = (part, pieces, segno) => {
      const hs = HAND[part.hand];
      // Segno 與手號之間空一方（Par. 20.3）
      if (segno) return [{ text: hs + ' + ', id: null }].concat(pieces);
      const sep = B.hasDots123(pieces[0].text[0]) ? "'" : '';
      return [{ text: hs + sep, id: null }].concat(pieces);
    };
    const render = (part, sl, mi) => {
      env.slurs = sl;
      // 小節重複記號（Par. 18.2）：每一手各自判斷；鋼琴譜每小節都對齊，不用數字合併
      if (opts.measureRepeat && sameAsPrev(part, mi)) return { pieces: [{ text: '7' + repeatTail(part.measures[mi]), id: null, ids: measureIds(part.measures[mi]) }] };
      return renderMeasure(part, mi, env, { prev: null, forceFirst: true, grouping: true });
    };

    let mi = 0;
    const N = rh.measures.length;
    // 兩手都重複三次以上：兩行都寫 ⠶ 加次數，上下對齊（Par. 18.2.1、18.2.2）；只有一手重複時每小節各寫 ⠶
    const bothRun = (k) => {
      if (!opts.measureRepeat) return 0;
      let n = 0;
      while (k + n < N && sameAsPrev(rh, k + n) && sameAsPrev(lh, k + n) && (n === 0 || (!repeatTail(rh.measures[k + n - 1]) && !repeatTail(lh.measures[k + n - 1])))) n++;
      return n >= 3 ? n : 0;
    };
    const runPieces = (part, k, n) => [{ text: '7#' + B.upperNumber(n) + repeatTail(part.measures[k + n - 1]), id: null, ids: [].concat(...part.measures.slice(k, k + n).map(measureIds)) }];
    while (mi < N) {
      // 中途換調、換拍號：以置中的段落標頭表示
      if (mi > 0 && (rh.measures[mi].key || rh.measures[mi].meter)) {
        const sig = signatureText(rh.measures[mi].key, prevKey, rh.measures[mi].meter);
        if (sig) {
          const l = new Line();
          l.add(center(sig, W));
          lines.push(l);
        }
      }
      if (rh.measures[mi].key) prevKey = rh.measures[mi].key;
      if (rh.measures[mi].codaStart) {
        const l = new Line();
        l.add(indent + '  >CODA>');
        lines.push(l);
      }
      // 從被拆開小節的後半開始時，編號後接點 3（Par. 29.3）
      const R = new Line(pad(numbers[mi]) + (rh.measures[mi].splitCont ? "'" : ' '));
      const L = new Line(indent);
      const extraR = [];
      const extraL = [];
      // 第一小節
      const run0 = bothRun(mi);
      const r0 = run0 ? { pieces: runPieces(rh, mi, run0) } : render(rh, slR, mi);
      const l0 = run0 ? { pieces: runPieces(lh, mi, run0) } : render(lh, slL, mi);
      const rp = handText(rh, r0.pieces, rh.measures[mi].segno);
      const lp = handText(lh, l0.pieces, rh.measures[mi].segno);
      const room0 = W - R.text.length;
      const fitOrRunover = (line, extra, part, sl, pieces) => {
        if (piecesText(pieces).length <= room0) {
          line.addPieces(pieces, mi);
          return;
        }
        // run-over（Par. 28.1.2）
        env.slurs = sl;
        const hs = pieces[0];
        const sp = splitMeasure(part, mi, env, null, room0 - hs.text.length, W - R.text.length - 2);
        sp.rows.forEach((row, k) => {
          if (k === 0) {
            line.add(hs.text);
            line.addPieces(row, mi);
          } else {
            const x = new Line(indent + '  ');
            x.addPieces(row, mi);
            extra.push(x);
          }
        });
      };
      fitOrRunover(R, extraR, rh, slR, rp);
      fitOrRunover(L, extraL, lh, slL, lp);
      mi += run0 || 1;
      // 後續小節（沒有 run-over 時才並排）
      while (mi < N && !extraR.length && !extraL.length) {
        const m = rh.measures[mi];
        if (m.key || m.meter || m.segno || m.codaStart) break;
        const run = bothRun(mi);
        const r = run ? { pieces: runPieces(rh, mi, run) } : render(rh, slR, mi);
        const l = run ? { pieces: runPieces(lh, mi, run) } : render(lh, slL, mi);
        const rt = piecesText(r.pieces);
        const lt = piecesText(l.pieces);
        const col = Math.max(R.text.length, L.text.length) + 1;
        if (col + Math.max(rt.length, lt.length) > W) break;
        for (const [line, pieces] of [[R, r.pieces], [L, l.pieces]]) {
          const gap = col - line.text.length;
          line.add(gap >= 7 ? ' ' + "'".repeat(gap - 2) + ' ' : ' '.repeat(gap));
          line.addPieces(pieces, mi);
        }
        mi += run || 1;
      }
      lines.push(R, ...extraR, L, ...extraL);
    }
  }

  MB.toBraille = toBraille;
  MB.brailleSigns = { NOTE, REST, OCT, ACC, INTERVAL, ARTIC, HAND, needOctave, keySig, meterSig, tempoSig };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
