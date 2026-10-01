/*
 * 內部音樂模型（ABC 與點字之間的中介）。
 *
 * Score {
 *   title, composer, tempo: {value, dots, bpm} | null,
 *   keyboard: boolean,                 // true = 鋼琴雙手（bar-over-bar）
 *   parts: [Part]                      // 單聲部 1 個；鋼琴 2 個（右手、左手）
 * }
 * Part { id, hand: 'R'|'L'|null, clef: 'treble'|'bass', measures: [Measure] }
 * Measure {
 *   key: {fifths, mode} | undefined,   // 在此小節開始生效（第一小節必有）
 *   meter: {num, den, symbol} | undefined,
 *   startRepeat, endRepeat, volta: '1'|'2'|..|null,
 *   barline: 'single'|'double'|'final',
 *   splitCont,                         // 被反覆記號等拆開的小節的後半
 *   segno, codaStart,                  // 此小節開頭有 Segno／Coda 段落開始
 *   toCoda, fine, jump: {type: 'DC'|'DS', to: 'fine'|'coda'|null}  // 此小節結尾
 *   voices: [[Event]]                  // 多於 1 個 = in-accord / ABC 的 &
 * }
 * Event {
 *   id, kind: 'note'|'rest', value: 1|2|4|8|16|32|64|128, dots,
 *   tuplet: {n, of, start, end} | null,
 *   notes: [{step, octave, accidental, alter, tie, finger, fingerAlt}]   // 由低到高；finger 如 '3'、'43'（換指）
 *                                    // fingerAlt：替代指法（Par. 15.4），'x' 表示該組省略；finger 為 '' 表示第一組省略
 *   measureRest, dynamic, articulations: [], slurStart, slurEnd,
 *   ornaments: ['trill'|'mordent'|'uppermordent'|'turn'|'invertedturn'],
 *   graces: [{notes: [...], value, dots, slash}],   // 倚音（不計入小節時值）
 *   pedalDown, pedalUp, pedalChange,  // 踩下（此音前）、放開（此音後）、換踏板（此音前）
 *   src: {abc: [s,e], brl: [s,e]}      // 用於同步高亮
 * }
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});

  const TPW = 3840; // ticks per whole note（可整除 128 分與三連音）
  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const STEP_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const VALUES = [1, 2, 4, 8, 16, 32, 64, 128];
  const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const ACC_ALTER = { sharp: 1, flat: -1, natural: 0, dsharp: 2, dflat: -2 };

  let nextId = 1;
  function newId() {
    return 'e' + nextId++;
  }

  function valueTicks(value, dots) {
    let t = TPW / value;
    let add = t;
    for (let i = 0; i < (dots || 0); i++) {
      add /= 2;
      t += add;
    }
    return t;
  }

  function eventTicks(ev) {
    let t = valueTicks(ev.value, ev.dots);
    if (ev.tuplet) t = (t * ev.tuplet.of) / ev.tuplet.n;
    return t;
  }

  function meterTicks(meter) {
    return (TPW * meter.num) / meter.den;
  }

  function diatonic(n) {
    return n.octave * 7 + STEPS.indexOf(n.step);
  }

  function fromDiatonic(d) {
    const oct = Math.floor(d / 7);
    return { step: STEPS[((d % 7) + 7) % 7], octave: oct };
  }

  function midiOf(n) {
    return (n.octave + 1) * 12 + STEP_SEMI[n.step] + (n.alter || 0);
  }

  /** 調號中各音級的升降。 */
  function keyAlters(fifths) {
    const alt = {};
    if (fifths > 0) for (let i = 0; i < fifths; i++) alt[SHARP_ORDER[i]] = 1;
    if (fifths < 0)
      for (let i = 0; i < -fifths; i++) alt[SHARP_ORDER[6 - i]] = -1;
    return alt;
  }

  /**
   * 依調號與小節內臨時記號計算實際音高（alter）。
   * 規則與 ABC、點字相同：臨時記號在同一小節、同一音高持續有效。
   */
  /*
   * 另外：
   * - 以連結線延續的音（含越過小節線）沿用前一個音的升降，不需要重寫臨時記號；
   * - 若音符帶有 _actualAlter（MusicXML 的 <alter>，代表實際音高），以它為準；
   *   推算結果不同時自動補上臨時記號，讓點字與 ABC 寫出正確的音。
   */
  const ALTER_ACC = { 0: 'natural', 1: 'sharp', '-1': 'flat', 2: 'dsharp', '-2': 'dflat' };
  function resolveAlters(score) {
    for (const part of score.parts) {
      let key = { fifths: 0 };
      const tiedFrom = {}; // 各聲部：上一個事件中有連結線的音 → 升降
      for (const m of part.measures) {
        if (m.key) key = m.key;
        const kalt = keyAlters(key.fifths);
        // 越過小節線的連結線：前一小節任一聲部結尾的連結音都可延續（聲部順序可能因點字排序而改變）
        const carryAll = Object.assign({}, ...Object.values(tiedFrom).filter(Boolean));
        m.voices.forEach((voice, vi) => {
          let firstEvent = true;
          const mem = {};
          const resolve = (n, carry) => {
            const k = n.step + n.octave;
            if (n.accidental) mem[k] = ACC_ALTER[n.accidental];
            let alter = n.accidental ? mem[k] : carry && k in carry ? carry[k] : k in mem ? mem[k] : kalt[n.step] || 0;
            if (n._actualAlter !== undefined) {
              if (alter !== n._actualAlter && ALTER_ACC[n._actualAlter]) {
                n.accidental = ALTER_ACC[n._actualAlter];
                mem[k] = n._actualAlter;
              }
              alter = n._actualAlter;
              delete n._actualAlter;
            }
            n.alter = alter;
          };
          for (const ev of voice) {
            for (const gr of ev.graces || []) for (const n of gr.notes) resolve(n, null);
            if (ev.kind !== 'note') {
              tiedFrom[vi] = null;
              continue;
            }
            const carry = firstEvent ? carryAll : tiedFrom[vi];
            firstEvent = false;
            for (const n of ev.notes) resolve(n, carry);
            const next = {};
            for (const n of ev.notes) if (n.tie) next[n.step + n.octave] = n.alter;
            tiedFrom[vi] = next;
          }
        });
      }
    }
  }

  /** 將任意 ticks 拆成可記譜的時值（必要時以連結線相連）。 */
  function decomposeTicks(ticks) {
    const out = [];
    let rest = ticks;
    let guard = 0;
    while (rest > 0 && guard++ < 16) {
      let best = null;
      for (const v of VALUES) {
        for (let d = 2; d >= 0; d--) {
          const t = valueTicks(v, d);
          if (t <= rest && (!best || t > best.t)) best = { value: v, dots: d, t };
        }
      }
      if (!best) break;
      out.push({ value: best.value, dots: best.dots });
      rest -= best.t;
    }
    return rest === 0 ? out : null;
  }

  /** 找出與 ticks 完全相符的單一時值。 */
  function exactValue(ticks) {
    for (const v of VALUES)
      for (let d = 0; d <= 3; d++)
        if (valueTicks(v, d) === ticks) return { value: v, dots: d };
    return null;
  }

  const MAJOR_FIFTHS = {
    C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
    F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  };
  const MODE_OFFSET = { major: 0, minor: -3, dorian: -2, mixolydian: -1, lydian: 1, phrygian: -4, locrian: -5 };

  function tonicFifths(tonic) {
    // 以五度圈計算任意主音（含 E#、Fb 等）
    const base = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 }[tonic[0]];
    let f = base;
    for (const ch of tonic.slice(1)) f += ch === '#' ? 7 : ch === 'b' ? -7 : 0;
    return f;
  }

  function keyName(key) {
    // 主音在五度圈上的位置（大調 = 調號數；小調等調式要扣掉調式的偏移）
    const f = key.fifths - (MODE_OFFSET[key.mode || 'major'] || 0);
    // 由五度圈位置得到音名：…Fb Cb Gb Db Ab Eb Bb F C G D A E B F# C# G# D# A#…
    const idx = (((f + 1) % 7) + 7) % 7;
    const acc = Math.floor((f + 1) / 7);
    const name = 'FCGDAEB'[idx] + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));
    const suffix = { major: '', minor: 'm', dorian: 'Dor', mixolydian: 'Mix', lydian: 'Lyd', phrygian: 'Phr', locrian: 'Loc' }[key.mode || 'major'];
    return name + suffix;
  }

  function cloneEvent(ev) {
    const c = JSON.parse(JSON.stringify(ev));
    c.id = newId();
    c.src = {};
    return c;
  }

  /** 走訪所有事件。 */
  function forEachEvent(score, fn) {
    score.parts.forEach((part, pi) =>
      part.measures.forEach((m, mi) =>
        m.voices.forEach((voice, vi) => voice.forEach((ev, ei) => fn(ev, { part, pi, measure: m, mi, vi, ei })))
      )
    );
  }

  /** 各小節目前生效的拍號。 */
  function meterAt(part, mi) {
    for (let i = mi; i >= 0; i--) if (part.measures[i].meter) return part.measures[i].meter;
    return { num: 4, den: 4 };
  }
  function keyAt(part, mi) {
    for (let i = mi; i >= 0; i--) if (part.measures[i].key) return part.measures[i].key;
    return { fifths: 0, mode: 'major' };
  }

  function voiceTicks(voice) {
    return voice.reduce((s, ev) => s + (ev.measureRest ? 0 : eventTicks(ev)), 0);
  }

  /**
   * 小節編號：第一小節不完整（弱起）時編為 0；
   * 被反覆記號等拆開的小節（splitCont）與前半共用同一個編號。
   */
  function measureNumbers(score) {
    const part = score.parts[0];
    if (!part || !part.measures.length) return [];
    const first = part.measures[0];
    const full = meterTicks(meterAt(part, 0));
    const v0 = first.voices[0] || [];
    const t = v0.length ? voiceTicks(v0) : full;
    const pickup = !v0.some((e) => e.measureRest) && t > 0 && t < full;
    const out = [pickup ? 0 : 1];
    for (let i = 1; i < part.measures.length; i++) out.push(part.measures[i].splitCont ? out[i - 1] : out[i - 1] + 1);
    return out;
  }

  function measureTicks(part, i) {
    const m = part.measures[i];
    const full = meterTicks(meterAt(part, i));
    return Math.max(0, ...m.voices.map((v) => v.reduce((s, e) => s + (e.measureRest ? full : eventTicks(e)), 0)));
  }

  /**
   * 找出「一個小節被反覆記號、複縱線或房號拆成兩半」的情形：
   * 相鄰兩小節各自不完整、合起來剛好一小節，且交界處有上述記號。
   * 後半標記 splitCont = true。
   */
  function markSplitMeasures(score) {
    const parts = score.parts;
    if (!parts.length) return;
    const N = parts[0].measures.length;
    for (let i = 1; i < N - 1; i++) {
      const a = parts[0].measures[i];
      const b = parts[0].measures[i + 1];
      if (a.splitCont || b.splitCont) continue;
      const barish = a.endRepeat || b.startRepeat || a.barline !== 'single' || b.volta;
      if (!barish || b.meter) continue;
      const ok = parts.every((p) => {
        if (!p.measures[i + 1]) return false;
        const full = meterTicks(meterAt(p, i));
        const x = measureTicks(p, i);
        const y = measureTicks(p, i + 1);
        return x > 0 && y > 0 && x < full && y < full && x + y === full;
      });
      if (ok) {
        parts.forEach((p) => (p.measures[i + 1].splitCont = true));
        i++;
      }
    }
  }

  /**
   * 此小節是否可以合理地不完整：
   * 第一小節（弱起）、最後一小節、被拆開小節的任一半，
   * 或樂段在換拍號處結束／開始（交界有反覆記號、複縱線或房號）。
   */
  function mayBeIncomplete(part, mi) {
    const ms = part.measures;
    const m = ms[mi];
    const prev = ms[mi - 1];
    const next = ms[mi + 1];
    if (mi === 0 || !next || m.splitCont || next.splitCont) return true;
    const barish = (a, b) => a.endRepeat || b.startRepeat || a.barline !== 'single' || !!b.volta;
    if (next.meter && barish(m, next)) return true;
    if (m.meter && prev && barish(prev, m)) return true;
    // 段落交界：反覆、房號、複縱線前後的小節常因弱起而不完整（例如反覆記號前少了弱起那一拍）
    if (barish(m, next) || (prev && barish(prev, m)) || m.volta) return true;
    return false;
  }

  /**
   * 演奏順序（小節索引）：展開反覆、房號、D.C.、D.S.、Fine、Coda。
   * 依一般慣例，D.C./D.S. 之後不再反覆，房號取最後一個。
   */
  function performanceOrder(part) {
    const ms = part.measures;
    const N = ms.length;
    const voltaEnd = {};
    for (let i = 0; i < N; i++) {
      if (!ms[i].volta) continue;
      let j = i;
      while (j < N - 1 && !ms[j].endRepeat && !ms[j + 1].volta && !ms[j + 1].startRepeat && ms[j].barline === 'single') j++;
      voltaEnd[i] = j;
    }
    const segno = ms.findIndex((m) => m.segno);
    const coda = ms.findIndex((m) => m.codaStart);
    const order = [];
    let i = 0;
    let repeatStart = 0;
    let pass = 1;
    let jumped = null; // {to: 'fine'|'coda'|null}
    let resetAt = -1;
    let guard = 0;
    while (i < N && guard++ < N * 8 + 16) {
      const m = ms[i];
      if (m.startRepeat && !jumped && repeatStart !== i) {
        repeatStart = i;
        pass = 1;
      }
      if (m.volta) {
        const v = parseInt(m.volta, 10) || 1;
        const hasLater = ms[voltaEnd[i] + 1] && ms[voltaEnd[i] + 1].volta;
        const skip = jumped ? hasLater : v !== pass && (hasLater || v > pass);
        if (skip) {
          i = voltaEnd[i] + 1;
          continue;
        }
        if (!hasLater) resetAt = voltaEnd[i]; // 最後一個房號結束後，反覆段落結束
      }
      order.push(i);
      if (i === resetAt) {
        pass = 1;
        repeatStart = i + 1;
        resetAt = -1;
      }
      if (jumped && jumped.to === 'fine' && m.fine) break;
      if (jumped && jumped.to === 'coda' && m.toCoda && coda > i) {
        i = coda;
        jumped = { to: null };
        continue;
      }
      if (m.endRepeat && !jumped) {
        if (pass === 1) {
          pass = 2;
          i = repeatStart;
          continue;
        }
        pass = 1;
        repeatStart = i + 1;
      }
      if (m.jump && !jumped) {
        jumped = { to: m.jump.to || (m.jump.type && ms.some((x) => x.fine) ? 'fine' : coda >= 0 ? 'coda' : null) };
        i = m.jump.type === 'DS' && segno >= 0 ? segno : 0;
        continue;
      }
      i++;
    }
    return order;
  }

  /** 反覆指示（Segno、Coda、Fine、D.C.、D.S.）屬於整首曲子：同步到每個聲部。 */
  function syncNav(score) {
    if (score.parts.length < 2) return;
    const n = Math.max(...score.parts.map((p) => p.measures.length));
    for (let i = 0; i < n; i++) {
      for (const k of ['segno', 'codaStart', 'toCoda', 'fine', 'jump']) {
        const src = score.parts.find((p) => p.measures[i] && p.measures[i][k]);
        if (src) score.parts.forEach((p) => p.measures[i] && (p.measures[i][k] = src.measures[i][k]));
      }
    }
  }

  /**
   * 依演奏順序展開的樂譜（供播放與 MIDI）：小節照實際演奏順序排列，
   * 移除反覆記號、房號與反覆指示；事件物件沿用原本的（id 相同，可對應回原譜）。
   */
  function performanceScore(score) {
    const order = performanceOrder(score.parts[0]);
    const parts = score.parts.map((p) => {
      let prevKey = null;
      let prevMeter = null;
      const measures = order.map((mi, k) => {
        const m = p.measures[mi] || { voices: [] };
        const copy = { voices: m.voices, barline: k === order.length - 1 ? 'final' : 'single' };
        const key = keyAt(p, mi);
        const meter = meterAt(p, mi);
        if (k === 0 || JSON.stringify(key) !== JSON.stringify(prevKey)) copy.key = key;
        if (k === 0 || JSON.stringify(meter) !== JSON.stringify(prevMeter)) copy.meter = meter;
        prevKey = key;
        prevMeter = meter;
        return copy;
      });
      return Object.assign({}, p, { measures });
    });
    return Object.assign({}, score, { parts });
  }

  MB.model = {
    performanceOrder,
    performanceScore,
    syncNav,
    mayBeIncomplete,
    TPW, STEPS, STEP_SEMI, VALUES, ACC_ALTER,
    newId, valueTicks, eventTicks, meterTicks, diatonic, fromDiatonic, midiOf,
    keyAlters, resolveAlters, decomposeTicks, exactValue,
    MAJOR_FIFTHS, MODE_OFFSET, tonicFifths, keyName, cloneEvent, forEachEvent,
    meterAt, keyAt, voiceTicks, measureNumbers, measureTicks, markSplitMeasures,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
