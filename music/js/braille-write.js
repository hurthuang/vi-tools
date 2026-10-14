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
  // 換氣記號（Table 22(B)）：(a) ⠜⠂ 一般的換氣記號（逗號或打勾形），(b) ⠠⠌ 斷句記號（caesura）；寫在音符後面
  const breathSigns = (artic) => (artic.includes('breath') ? '>1' : '') + (artic.includes('caesura') ? ',/' : '');
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
  /** 雙視對照：調號與拍號的墨字，例如「2♯ 4/4」「C」。 */
  function sigLabel(key, meter) {
    const out = [];
    if (key && key.fifths) out.push(Math.abs(key.fifths) + (key.fifths > 0 ? '♯' : '♭'));
    if (meter) out.push(meter.symbol === 'C' && meter.num === 4 ? 'C' : meter.symbol === 'C|' && meter.num === 2 ? '¢' : meter.num + '/' + meter.den);
    return out.join(' ');
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
          // 連結線延續的音也加音節圓滑線（圓滑線寫在連結線前面）
          if (grp.length >= 2) {
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
    const dir = part.dir || (part.hand === 'L' || (!part.hand && part.clef === 'bass') ? 'up' : 'down');
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

  // ---------- 文字表情（Par. 22.3）與開頭行文字（Par. 1.7） ----------
  // 不縮寫的英文點字字母；重音字母照 UEB（例如 più → pi⠘⠡u）；中文用國語點字
  const ACCENT_IN = { '̀': '^*', '́': '^/', '̂': '^%', '̈': '^3' }; // 抑、揚、抑揚、分音符號
  const PUNCT_IN = { '.': "'", ',': '1', '!': '6', '?': '8', '-': '-', '(': '7', ')': '7', "'": "'", ':': '3', ';': '2' };
  /**
   * 文字 → BRF。heading 為開頭行文字（大小寫照原文、句尾加句點，Par. 1.7(a)）；
   * 否則是樂譜中的文字表情（不分大小寫，句點寫成點 3；cresc.、decresc.、dim. 一律寫 cr'、decr'、dim'，Par. 22.3.2）。
   * 回傳 { brf, unknown: [無法轉換的字元] }；中文需要國語點字表，沒有載入時 brf 為 null。
   */
  function encodeWords(text, heading) {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!heading) {
      const low = t.toLowerCase();
      if (/^(cresc|cres|cr)\.?$/.test(low)) return { brf: "CR'", unknown: [] };
      if (/^(decresc|decr)\.?$/.test(low)) return { brf: "DECR'", unknown: [] };
      if (/^(dim|dimin)\.?$/.test(low)) return { brf: "DIM'", unknown: [] };
    }
    const zh = MB.zhBraille;
    const chars = [...t.normalize('NFD')];
    const hasZh = chars.some((c) => /[㐀-鿿豈-﫿]/.test(c));
    if (hasZh && !(zh && zh.isLoaded())) return { brf: null, unknown: [] };
    const zhOut = hasZh ? zh.translate(chars.join('')) : null;
    let out = '';
    let num = false;
    const unknown = [];
    chars.forEach((c, i) => {
      if (/[0-9]/.test(c)) {
        out += (num ? '' : '#') + B.upperNumber(+c);
        num = true;
        return;
      }
      num = false;
      if (/[a-z]/.test(c)) out += c.toUpperCase();
      else if (/[A-Z]/.test(c)) out += (heading ? ',' : '') + c;
      else if (c === ' ') out += ' ';
      else if (ACCENT_IN[c]) {
        // NFD 拆開的重音符號要放在字母前面
        const k = out.length - 1;
        out = out.slice(0, k) + ACCENT_IN[c] + out.slice(k);
      } else if (zhOut && zhOut[i] && zhOut[i].known && /[^\x00-\x7f]/.test(c)) out += B.toBrf(zhOut[i].brl);
      else if (PUNCT_IN[c] != null) out += heading && c === '.' ? '4' : PUNCT_IN[c];
      else unknown.push(c);
    });
    out = out.replace(/ {2,}/g, ' ').trim(); // 略過無法轉換的字元後留下的多餘空方
    if (heading && !hasZh && !/[.!?]$/.test(t)) out += '4'; // 開頭行的文字以句點結尾（Par. 1.7(a)）
    return { brf: out, unknown, zh: hasZh };
  }
  /** BRF → 文字（只能還原外文；中文點字無法還原成國字，回傳 null）。 */
  function decodeWords(brf) {
    const ABBR = { "CR'": 'cresc.', "DECR'": 'decresc.', "DIM'": 'dim.' };
    if (ABBR[brf]) return ABBR[brf];
    const ACC = { '^*': '̀', '^/': '́', '^%': '̂', '^3': '̈' };
    let out = '';
    let paren = false;
    for (let i = 0; i < brf.length; i++) {
      const c = brf[i];
      const two = brf.slice(i, i + 2);
      if (ACC[two] && /[A-Z]/.test(brf[i + 2] || '')) {
        out += brf[i + 2].toLowerCase() + ACC[two];
        i += 2;
      } else if (c === ',' && /[A-Z]/.test(brf[i + 1] || '')) {
        out += brf[++i];
      } else if (/[A-Z]/.test(c)) out += c.toLowerCase();
      else if (c === "'") out += '.';
      else if ('1268'.includes(c)) out += { 1: ',', 2: ';', 6: '!', 8: '?' }[c];
      else if (c === '3' && brf[i - 1] !== '^') out += ':';
      else if (c === ' ') out += ' ';
      else if (c === '7') {
        out += paren ? ')' : '(';
        paren = !paren;
      } else if (c === '#') {
        while (/[A-J]/.test(brf[i + 1] || '')) out += B.UPPER_DIGITS.indexOf(brf[++i]);
      } else if (c === '-') out += '-';
      else if (c === '4' && i === brf.length - 1) out += '.'; // 開頭行文字結尾的句點（文學點字 ⠲）
      else return null;
    }
    return out.normalize('NFC');
  }
  MB.brailleWords = { encode: encodeWords, decode: decodeWords };

  // ---------- 和弦名稱（Sec. 23，表 23） ----------
  // 字母照印刷譜的大小寫（大寫字母各加大寫記號，不用全大寫記號），數字用數字記號＋上位數字，句點省略；
  // 臨時記號用音樂點字的升降還原；° ⠼（點 2-5-6）、ø ⠼⠄、△ ⠴、括號 ⠶、斜線 ⠌；NC／N.C. 寫 ⠠⠠⠝⠉
  const CHORD_SYM = { '+': '+', '-': '-', '/': '/', '(': '7', ')': '7', '°': '4', 'º': '4', ø: "4'", 'Δ': '0', '△': '0', '∆': '0', '♯': '%', '♭': '<', '♮': '*', '#': '%' };
  function encodeChord(text) {
    const t = text.trim();
    if (/^N\.?\s*C\.?$/i.test(t)) return ',,NC';
    if (/^tacet\.?$/i.test(t)) return ',TACET';
    let out = '';
    let num = false;
    const chars = [...t];
    chars.forEach((c, i) => {
      if (/[0-9]/.test(c)) {
        out += (num ? '' : '#') + B.upperNumber(+c);
        num = true;
        return;
      }
      num = false;
      const prev = chars[i - 1] || '';
      // 根音或低音（大寫 A–G）後面、或數字前面的 b 是降記號（Bb、Eb7、C7b9）
      if (c === 'b' && (/[A-G]/.test(prev) || /[0-9]/.test(chars[i + 1] || ''))) out += '<';
      else if (/[A-Z]/.test(c)) out += ',' + c;
      else if (/[a-z]/.test(c)) out += c.toUpperCase();
      else if (CHORD_SYM[c] != null) out += CHORD_SYM[c];
      // 句點、空格省略
    });
    return out;
  }
  /** 點字 → 和弦名稱；不是和弦名稱回傳 null。 */
  function decodeChord(brf) {
    if (/^,,NC$/.test(brf)) return 'N.C.';
    if (!/^,[A-G]/.test(brf) && !/^,TACET$/.test(brf)) return null;
    let out = '';
    let paren = false;
    for (let i = 0; i < brf.length; i++) {
      const c = brf[i];
      if (c === ',' && /[A-Z]/.test(brf[i + 1] || '')) out += brf[++i];
      else if (c === '#') {
        let d = '';
        while (/[A-J]/.test(brf[i + 1] || '')) d += B.UPPER_DIGITS.indexOf(brf[++i]);
        if (!d) return null;
        out += d;
      } else if (/[A-Z]/.test(c)) out += c.toLowerCase();
      else if (c === '%') out += '#';
      else if (c === '<') out += 'b';
      else if (c === '*') out += '♮';
      else if (c === '4') {
        if (brf[i + 1] === "'") {
          out += 'ø';
          i++;
        } else out += '°';
      } else if (c === '0') out += 'Δ';
      else if (c === '7') {
        out += paren ? ')' : '(';
        paren = !paren;
      } else if ('+-/'.includes(c)) out += c;
      else return null;
    }
    return out;
  }
  MB.brailleChords = { encode: encodeChord, decode: decodeChord };

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
    // 文字表情（Par. 22.3）：在力度之前（較一般的指示離音符較遠，22.3.6）；含空格的長表情另成一段，由 renderMeasure 放在前面
    ctx.longWords = '';
    if (ev.words) {
      for (const w of ev.words) {
        const e = encodeWords(w, false);
        if (e.brf == null) {
          ctx.warn && ctx.warn('國語點字表沒有載入，中文文字表情「' + w + '」無法轉換，已略過');
          continue;
        }
        if (e.unknown.length && ctx.warn) ctx.warn('文字表情「' + w + '」中的 ' + e.unknown.join(' ') + ' 無法轉成點字，已略過');
        // 含空格的長表情與中文（國語點字的方會和音樂記號混淆）都用前後各一個文字記號包起來，後面空一方（Par. 22.3.8）
        // 只有字母（可帶重音、數字）與結尾句點的單字用簡短寫法；中間有句點或其他標點（m.g.、(rit.)）也包起來
        const simple = /^(?:[A-Z]|\^[*\/%3](?=[A-Z])|#[A-J]+)+'?$/.test(e.brf);
        if (!simple || e.zh) ctx.longWords += (ctx.longWords ? ' ' : '') + '>' + e.brf + '>';
        else words += '>' + e.brf;
      }
      if (ev.words.length) needOct = true;
    }
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
      r += breathSigns(artic);
    } else {
      const notes = sortedNotes(ev);
      const down = ctx.dir === 'down';
      const written = down ? notes[notes.length - 1] : notes[0];
      const others = down ? notes.slice(0, -1).reverse() : notes.slice(1);
      const tied = notes.filter((n) => n.tie).length;
      const chordTie = tied >= 2;
      if (written.accidental) r += ACC[written.accidental];
      const mainMarked = !ctx.noOctave && (needOct || needOctave(ctx.prev, written));
      if (mainMarked) r += octMark(written.octave);
      const marked = [mainMarked];
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
        marked.push(mark);
        r += INTERVAL[dist % 7];
        r += noteFingers(n);
        if (!chordTie && n.tie) r += '@C';
        given.push(nd);
        prevD = nd;
      });
      // 點字對照（五線譜下方標示）：各音依點字書寫順序，以及是否寫了音層記號
      if (ctx.octMarks) ctx.octMarks.set(ev.id, { notes: [written].concat(others), marked });
      ctx.prev = wd;
      if (artic.includes('fermata')) tail += '<L';
      tail += breathSigns(artic);
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
    // 文字記號後面接含點 1、2、3 的符號要加點 3；已經以句點（點 3）結尾就不用再加（Par. 22.3(d)）
    if (words && !words.endsWith("'") && B.hasDots123(body[0])) s += "'";
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
    const dir = part.dir || (part.hand === 'L' || (!part.hand && part.clef === 'bass') ? 'up' : 'down');
    const last = mi === part.measures.length - 1;
    const voices = orderVoices(m.voices.filter((v) => v.length), dir);
    const pieces = [];
    // noOctave：教材初期尚未教音層記號的練習（僅供比對測試使用）
    const ctx = {
      prev: opt.prev, dir, slurs: env.slurs, pedalOmit: env.pedalOmit, noOctave: !!env.opts.suppressOctaveMarks, octMarks: env.octMarks,
      warn: (msg) => {
        if (env.warned.has(msg)) return;
        env.warned.add(msg);
        env.warnings.push({ msg, measure: mi });
      },
    };
    let prefix = '';
    if (m.startRepeat) prefix += '<7';
    if (m.volta) prefix += '#' + B.lowerNumber(m.volta);
    voices.forEach((voice, vi) => {
      // 被拆開的小節（兩半）各自不完整，屬正常情形
      const split = !!m.splitCont || !!(part.measures[mi + 1] && part.measures[mi + 1].splitCont);
      const plan = planValues(voice, meter, last || split || M.mayBeIncomplete(part, mi), opt.grouping && env.opts.grouping);
      if (plan.mismatch && !env.warned.has(part.id + ':' + mi + ':' + vi)) {
        env.warned.add(part.id + ':' + mi + ':' + vi);
        env.warnings.push({ msg: '第 ' + env.numbers[mi] + ' 小節' + (part.hand ? { R: '（右手）', L: '（左手）', O: '（旋律提示）' }[part.hand] : '') + '的拍數與拍號不符', measure: mi });
      }
      ctx.wordEnd = false;
      // 有和弦名稱的小節不用部分小節重複：重複記號不帶和弦名稱（Par. 27.1.2）
      const hasChords = voice.some((x) => x.chords && x.chords.length);
      const reps = opt.partRepeat !== false && env.opts.measureRepeat && env.opts.partRepeat && !split && !hasChords ? partRepeats(voice, meter, plan.groups) : null;
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
        const sepLen = wasWordEnd && B.hasDots123(text[0]) ? 1 : 0;
        if (sepLen) text = "'" + text;
        const lead = vi > 0 && ei === 0 ? '<>' : '';
        // 和弦名稱（Sec. 27）：對齊音符的第一個記號（音層、臨時記號、力度等也算），只標第一聲部
        const chords = vi === 0 && ev.chords && ev.chords.length ? ev.chords : null;
        if (ctx.longWords) {
          // 含空格的長表情（Par. 22.3.8）：前後空方；在小節中間時，前面的音樂先寫音樂連字號。
          // 每個字一個片段，可以在字與字之間換行（續行不用音樂連字號，Ex 22.3.8-2）
          const head = lead ? lead + ' ' : ei > 0 ? '" ' : '';
          ctx.longWords.split(' ').forEach((w, k) => pieces.push({ text: (k ? ' ' : head) + w, id: ev.id, vi, ei, wbreak: k > 0 }));
          pieces.push({ text: ' ' + text, id: ev.id, vi, ei, wbreak: true, chords, chordAt: 1 + sepLen });
        } else pieces.push({ text: lead + text, id: ev.id, vi, ei, cont: !!ctx.asEighth, chords, chordAt: lead.length + sepLen }); // cont：分組中的後續音
      });
    });
    const endsWithWord = ctx.wordEnd; // 小節最後寫的是文字記號（下一小節第一個音要寫音層記號）
    if (!pieces.length) pieces.push({ text: 'M', id: null, vi: 0, ei: 0 });
    if (prefix) {
      const first = pieces[0];
      const sep = m.volta && B.hasDots123(first.text[0]) ? "'" : '';
      first.text = prefix + sep + first.text;
      if (first.chords) first.chordAt += (prefix + sep).length;
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

  /**
   * 一小節（或一段片段）的音樂與和弦行對齊（Par. 27.1–27.4）。回傳 { pieces, chord, width }：
   * chord 是和弦行（和音樂從同一欄開始）；和弦名稱比它下面的音樂長時，音樂行留空：
   * 小節中間的空白第一格寫音樂連字號 ⠐，超過六格加引導點 ⠄⠄⠄（前後空一格）。
   * 只空一格時也用兩格（⠐ 和空格），避免和小節之間的空格混淆。
   */
  function chordAlign(pieces) {
    const out = [];
    let music = 0;
    let chord = '';
    let lastNotes = 0; // 前一個和弦名稱裡音名大寫字母的個數（兩個以上後面要空一格，Par. 27.3）
    let hold = 0; // 一個音有好幾個和弦名稱（連寫）時，後面的音要在這一欄之後才開始，免得被當成後面那個音的和弦
    const gapTo = (col) => {
      const gap = Math.max(2, col - music);
      const fill = gap - 1 > 6 ? '" ' + "'".repeat(gap - 3) + ' ' : '"' + ' '.repeat(gap - 1);
      out.push({ text: fill, id: null });
      music += fill.length;
    };
    for (const p of pieces) {
      if (!p.chords && p.id && hold > music) gapTo(hold);
      if (p.chords) {
        let ct = '';
        let n = 0;
        p.chords.forEach((c, k) => {
          const b = encodeChord(c);
          if (k > 0 && n >= 2) ct += ' ';
          ct += b;
          n = (b.match(/,[A-G]/g) || []).length;
        });
        const col = music + (p.chordAt || 0);
        const need = chord.length + (chord && lastNotes >= 2 ? 1 : 0);
        if (col < need) gapTo(need - (p.chordAt || 0));
        chord = chord.padEnd(music + (p.chordAt || 0)) + ct;
        lastNotes = n;
        hold = p.chords.length > 1 ? chord.length + 1 : 0;
      }
      out.push(p);
      music += p.text.length;
    }
    return { pieces: out, chord, width: Math.max(music, chord.length) };
  }

  // ---------- 行 ----------
  // kind：'title' 曲名、'head' 樂曲標頭、'lyric' 歌詞、'chord' 和弦名稱，其他是音樂；
  // labels：雙視對照要印在點字上方的墨字 {start, end, text}（音符的名稱由 dualview.js 依 spans 另外產生）
  function Line(prefix, kind) {
    this.text = prefix || '';
    this.spans = [];
    this.labels = [];
    this.kind = kind || 'music';
    this.content = false;
  }
  Line.prototype.label = function (start, end, text) {
    if (text && end > start) this.labels.push({ start, end, text: String(text) });
  };
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
      if (p.label) this.label(s, this.text.length, p.label);
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
    // 合奏總譜：所有聲部的音程與 in-accord 都由下往上讀（Par. 33.4.2）
    if (score.ensemble) score = Object.assign({}, score, { parts: score.parts.map((p) => Object.assign({}, p, { dir: 'up' })) });
    const warnings = [];
    const lines = [];
    const numbers = M.measureNumbers(score);
    const env = { opts, warnings, numbers, warned: new Set(), slurs: null, pedalOmit: new Set(), octMarks: new Map() };
    if (score.keyboard && score.parts.some((p) => p.measures.some((m) => m.voices.some((v) => v.some((e) => e.chords)))))
      warnings.push({ msg: '鋼琴譜的和弦名稱（BANA Par. 29.17）目前不轉換，已略過' });
    score.parts.forEach((p) => analysePedal(p).forEach((id) => env.pedalOmit.add(id)));
    const first = score.parts[0];
    if (!first || !first.measures.length) return finish([], warnings);

    // 曲名（Par. 1.6.1）：置中的文字標題；樂曲標頭前空一行（Par. 1.7）
    if (opts.title !== false && score.title) {
      const tl = [];
      const t = titleBrf(score.title, tl);
      if (t) {
        const l = new Line('', 'title');
        const c = center(t, opts.width);
        l.add(c);
        const pad = c.length - t.length;
        tl.forEach((x) => l.label(pad + x.start, pad + x.end, x.text));
        lines.push(l, new Line());
      } // 中文曲名需要國語點字表；單獨使用時沒有，就不寫曲名
    }
    // 合奏總譜（Sec. 33）：曲名後面是樂器表；各樂器調號不同時，調號不寫在標頭，改寫在每行的縮寫後面（Par. 33.4.1）
    let abbrs = null;
    let ownKeys = false;
    if (score.ensemble) {
      abbrs = instrumentAbbrs(score.parts);
      instrumentTable(score.parts, abbrs, env, lines);
      const kf = (p) => (p.measures[0].key ? p.measures[0].key.fifths : 0);
      ownKeys = score.parts.some((p) => kf(p) !== kf(first));
      if (score.parts.some((p) => p.measures.some((m) => m.voices.some((v) => v.some((e) => e.chords || e.lyrics)))))
        warnings.push({ msg: '合奏總譜裡的和弦名稱與歌詞目前不轉成點字，已略過' });
    }
    // 樂曲標頭（Par. 1.7）：速度、調號、拍號置中
    const m0 = first.measures[0];
    const headParts = [];
    const headLabels = new Map(); // 標頭各部分的墨字
    if (score.tempo) {
      headParts.push(tempoSig(score.tempo));
      headLabels.set(headParts[headParts.length - 1], '♩=' + score.tempo.bpm);
    }
    const sig = signatureText(ownKeys ? null : m0.key, null, m0.meter);
    if (sig) {
      headParts.push(sig);
      headLabels.set(sig, sigLabel(m0.key, m0.meter));
    }
    // 開頭行的速度文字（例如 Allegro、中板，Par. 1.7(a)）：ABC 的 Q:"Allegro"、MusicXML 和速度數字在一起的文字。
    // 第一個音上的其他文字表情照 Ex 22.3.8-1 寫在音樂裡
    let headBrf = '';
    if (score.tempoText) {
      const e = encodeWords(score.tempoText, true);
      if (e.brf) {
        headBrf = e.brf;
        headLabels.set(headBrf, score.tempoText);
      }
      else env.warnings.push({ msg: '國語點字表沒有載入，速度文字「' + score.tempoText + '」無法轉換，已略過' });
    }
    // 整個開頭行放不下（兩邊至少各留三方空白）時，速度數字與調號拍號移到下一行置中（Par. 1.7(c)）
    const headLines = [];
    const all = [headBrf].concat(headParts).filter(Boolean).join(' ');
    if (headBrf && all.length > opts.width - 6) {
      headLines.push(headBrf);
      if (headParts.length) headLines.push(headParts.join(' '));
    } else if (all) headLines.push(all);
    for (const h of headLines) {
      const l = new Line('', 'head');
      const c = center(h, opts.width);
      l.add(c);
      // 各部分以空方分隔，依序找出位置
      let at = c.length - h.length;
      for (const p of h.split(' ')) {
        l.label(at, at + p.length, headLabels.get(p));
        at += p.length + 1;
      }
      lines.push(l);
    }

    if (score.choral) writeChoral(score, env, lines);
    else if (score.ensemble) writeEnsemble(score, env, lines, abbrs, ownKeys);
    else if (score.keyboard) {
      if (score.parts.some((p) => p.measures.some((m) => m.voices.some((v) => v.some((ev) => ev.lyrics)))))
        warnings.push({ msg: '鋼琴譜中的歌詞目前不轉成點字（歌曲請用單一聲部）' });
      writeKeyboard(score, env, lines);
    } else {
      env.vocal = vocalLayout(score.parts[0], env);
      writeSingleLine(score.parts[0], env, lines);
    }
    return Object.assign(finish(lines, warnings), { noteMarks: env.octMarks });
  }

  function finish(lines, warnings) {
    let brf = '';
    const map = [];
    const layout = []; // 每一行的類型、墨字與音符位置（雙視對照用）
    lines.forEach((l, i) => {
      const off = brf.length;
      const text = l.text.replace(/\s+$/, '');
      brf += text + (i < lines.length - 1 ? '\n' : '');
      l.spans.forEach((s) => map.push({ id: s.id, start: off + s.start, end: off + s.end, measure: s.measure, lyric: l.kind === 'lyric' || undefined }));
      layout.push({ text, kind: l.kind, labels: l.labels, spans: l.spans });
    });
    return { brf, unicode: B.toUnicode(brf), map, warnings, layout };
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
          // 長表情裡的空方換到下一行時，行首不寫空方
          const p = k === start && ps[k].wbreak && rows.length ? Object.assign({}, ps[k], { text: ps[k].text.replace(/^ /, '') }) : ps[k];
          const w = p.text.length;
          const isLast = k === ps.length - 1;
          if (used + w + (isLast ? 0 : 1) > room && row.length) break;
          row.push(p);
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
        // 在長表情的字與字之間（或表情與後面的音之間）換行：不用音樂連字號
        if (!ps[k].wbreak) row.push({ text: '"', id: null });
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
    if (evs(b).some((x) => x.chords && x.chords.length)) return false;
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
            delete c.chords; // 被重複的小節有和弦名稱也可以：重複記號不帶和弦，和弦持續到下一個和弦（Par. 27.1.2）
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
      if (!ev.measureRest || ev.dynamic || (ev.articulations && ev.articulations.length) || ev.hairpinStart || ev.hairpinEnd || ev.chords) return false;
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
  function latinBrf(ch) {
    if (/[a-z]/.test(ch)) return ch.toUpperCase();
    if (/[A-Z]/.test(ch)) return ',' + ch;
    const P = { "'": "'", ',': '1', '.': '4', '!': '6', '?': '8', ';': '2', ':': '3', '-': '-' };
    return P[ch] != null ? P[ch] : null;
  }
  const HALF_TO_FULL = { ',': '，', '.': '。', '!': '！', '?': '？', ';': '；', ':': '：' };
  // 歌詞中的數字（半形或全形）一律寫下位數字
  const DIGIT_OF = {};
  for (let d = 0; d <= 9; d++) {
    DIGIT_OF[String(d)] = d;
    DIGIT_OF[String.fromCharCode(0xff10 + d)] = d;
  }

  /** 曲名（Par. 1.6.1：文字標題，置中）：中文用國語點字，外文用字母。無法轉換時回傳 null。 */
  function titleBrf(title, labels) {
    const zh = MB.zhBraille;
    const chars = [...title];
    const hasZh = chars.some((c) => /[㐀-鿿豈-﫿　-〿＀-￯]/.test(c));
    if (hasZh && !(zh && zh.isLoaded())) return null;
    const out = hasZh ? zh.translate(title) : null;
    let s = '';
    const pos = []; // 每個字在點字中的位置（雙視對照）
    chars.forEach((c, i) => {
      const from = s.length;
      if (c === ' ') s += ' ';
      else if (DIGIT_OF[c] != null) s += B.lowerNumber(DIGIT_OF[c]);
      else if (out && out[i].known && /[^\x00-\x7f]/.test(c)) s += B.toBrf(out[i].brl);
      else {
        const b = latinBrf(c);
        if (b != null) s += b;
      }
      if (c !== ' ') pos.push({ start: from, end: s.length, text: c });
    });
    const lead = s.length - s.trimStart().length;
    if (labels) pos.forEach((x) => labels.push({ start: x.start - lead, end: x.end - lead, text: x.text }));
    return s.trim() || null;
  }

  /**
   * 歌曲（Par. 35.1）：分段（每段一個平行段）與歌詞行。歌詞從行首寫起，音樂在下一行從第 3 方開始。
   * 分段依原本 ABC 的分行；沒有分行資訊（例如 MusicXML）時每 4 小節一段。只轉換第一段歌詞。
   * 中文用國語點字（工具集的 zh-tw.ctb）；沒有載入時無法轉換，就不寫歌詞。沒有歌詞時回傳 null。
   */
  function vocalLayout(part, env, startsArg) {
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
    if (startsArg) starts.push(...startsArg);
    else if (part.measures[0].lineStart) part.measures.forEach((m, i) => (i === 0 || m.lineStart) && starts.push(i));
    else for (let i = 0; i < N; i += 4) starts.push(i);
    const W = opts.width;
    const unknown = new Set();
    const linesAt = new Map();
    starts.forEach((st, k) => {
      const end = k + 1 < starts.length ? starts[k + 1] : N;
      const sylls = [];
      for (let mi = st; mi < end; mi++) for (const ev of part.measures[mi].voices[0] || []) if (lyr0(ev) && lyr0(ev).text) sylls.push({ l: lyr0(ev), id: ev.id, mi });
      if (!sylls.length) return;
      // 中文歌詞裡的半形標點當作全形中文標點
      const texts = sylls.map((x) => ([...x.l.text].some((c) => /[㐀-鿿豈-﫿]/.test(c)) ? x.l.text.replace(/[,.!?;:]/g, (c) => HALF_TO_FULL[c]) : x.l.text));
      // 中文整段一起轉，多音字才能看前後文
      const zhOut = needZh ? zh.translate(texts.join('')) : null;
      let pos = 0;
      const pieces = sylls.map((x, j) => {
        let brl = '';
        let cjk = false;
        let last = '';
        for (const ch of texts[j]) {
          const t = zhOut ? zhOut[pos] : null;
          pos++;
          last = ch;
          const digit = DIGIT_OF[ch];
          if (digit != null) brl += B.lowerNumber(digit); // 數字用下位數字
          else if (isZh(ch)) {
            cjk = true;
            if (t && t.known) brl += B.toBrf(t.brl);
            else unknown.add(ch);
          } else {
            const b = latinBrf(ch);
            if (b == null) unknown.add(ch);
            else brl += b;
          }
        }
        // 中文歌詞裡只有數字或標點的音節，和中文字一樣依「字間」設定連寫或空方
        if (needZh && !cjk && [...texts[j]].every((c) => DIGIT_OF[c] != null || isZh(c))) cjk = true;
        const joined = x.l.syllabic === 'begin' || x.l.syllabic === 'middle';
        // 句末標點（。？！）後面空一方（台灣注音點字標點規則，和工具集「文字轉點字」相同）
        return { brl, id: x.id, mi: x.mi, cjk, joined, terminal: '。？！'.includes(last) };
      });
      const out = [new Line('', 'lyric')];
      let cur = out[0];
      pieces.forEach((pc, j) => {
        const prevPc = pieces[j - 1];
        // 中文字之間依設定連寫或空一方；外文同一個字的音節連寫（不寫連字號），字與字之間空一方
        let sep = '';
        if (prevPc) sep = prevPc.terminal ? ' ' : prevPc.cjk && pc.cjk ? (opts.lyricSpacing === 'space' ? ' ' : '') : prevPc.joined ? '' : ' ';
        if (cur.content && cur.text.length + sep.length + pc.brl.length > W) {
          cur = new Line('    ', 'lyric'); // 續行從第 5 方開始（Par. 35.1）
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

  /**
   * 跟隨 ABC 換行時，哪些小節開始新的一行：有原本的分行（ABC、點字讀入）就照原本；
   * 沒有（例如 MusicXML）就每 4 小節一行，和產生的 ABC 一致。
   */
  function abcLineStarts(part) {
    const ms = part.measures;
    const has = ms.some((m, i) => i > 0 && m.lineStart);
    return new Set(ms.map((m, i) => i).filter((i) => i > 0 && (has ? ms[i].lineStart : i % 4 === 0)));
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
    const abcStarts = opts.lineMode === 'abc' && !vocal ? abcLineStarts(part) : null;
    // 和弦名稱（Sec. 27）：沒有歌詞的旋律，每一行音樂下面加一行和弦名稱，兩行一段、開頭寫小節編號
    const lead = !vocal && part.measures.some((m) => (m.voices[0] || []).some((e) => e.chords && e.chords.length));
    if (vocal && part.measures.some((m) => m.voices.some((v) => v.some((e) => e.chords)))) env.warnings.push({ msg: '有歌詞的歌曲的和弦名稱（BANA Sec. 36）目前不轉換，已略過' });
    const widthOf = (pieces) => (lead ? chordAlign(pieces).width : piecesText(pieces).length);

    const flush = () => {
      if (line && line.content) {
        lines.push(line);
        // 和弦行接在音樂行下面
        if (line.chord && /\S/.test(line.chord)) {
          const c = new Line('', 'chord');
          c.text = line.chord.replace(/\s+$/, '');
          c.content = true;
          lines.push(c);
        }
      }
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
      // 跟隨 ABC 換行時，每一行 ABC 是一段：只有段落開頭寫小節編號，太長接到續行
      // 有和弦行時每一行都是新的一段（Par. 27.1）
      if (lead || segLines === 0 || lines.length === 0 || (opts.lineMode !== 'abc' && segLines >= opts.segmentLines)) {
        // 段落從被拆開小節的後半開始時，編號後加點 3（Par. 24.1.1）
        line = new Line('#' + B.upperNumber(numbers[mi]) + (part.measures[mi].splitCont ? "' " : ' '));
        line.label(0, 1 + B.upperNumber(numbers[mi]).length, numbers[mi]);
        segLines = 1;
      } else {
        line = new Line('  ');
        segLines++;
      }
      atLineStart = true;
    };
    const used = () => Math.max(line.text.length, lead && line.chord ? line.chord.length : 0);
    const room = () => W - used() - (line.content ? 1 : 0);
    const put = (pieces, mi) => {
      if (lead) {
        // 小節之間：兩行在同一欄都要有空格（Par. 27.2）
        const col = line.content ? used() + 1 : line.text.length;
        const al = chordAlign(pieces);
        if (line.text.length < col) line.add(' '.repeat(col - line.text.length));
        line.addPieces(al.pieces, mi);
        if (/\S/.test(al.chord)) line.chord = (line.chord || '').padEnd(col) + al.chord;
      } else {
        if (line.content) line.add(' ');
        line.addPieces(pieces, mi);
      }
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
      // Segno 與 Coda 段落都要另起一段（Par. 20.1.1、20.1.5）；跟隨 ABC 換行時，ABC 的每一行另起一段
      if (mi > 0 && (m.segno || m.codaStart || (abcStarts && abcStarts.has(mi)))) {
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
          put([{ text: sig, id: null, label: sigLabel(m.key, m.meter) }], mi);
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
      let text = { length: widthOf(r.pieces) };
      if (text.length <= room()) {
        put(r.pieces, mi);
      } else {
        const full = W - 2;
        // 放得進一整行的小節移到下一行；本來就放不下的長小節，直接從目前這一行開始寫再斷行
        const startHere = !atLineStart && text.length > full && room() >= 8;
        if (!atLineStart && !startHere) {
          newLine(mi);
          r = renderMeasure(part, mi, env, { prev, forceFirst: true, grouping: true, afterWord: prevWordEnd });
          text = { length: widthOf(r.pieces) };
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
    // 伴奏的旋律提示（Par. 29.8）：右手上方一行，手號 ⠐⠜；小節號寫在這一行
    const ol = score.outline || null;
    const slO = ol ? analyseSlurs(ol, opts.slurStyle) : null;
    const pad = (n) => ' '.repeat(numW - String(n).length) + B.upperNumber(n);
    const indent = ' '.repeat(numW + 1);
    let prevKey = rh.measures[0].key;
    const abcStarts = opts.lineMode === 'abc' ? abcLineStarts(rh) : null;

    const handText = (part, pieces, segno) => {
      const hs = part.hand === 'O' ? '">' : HAND[part.hand];
      // Segno 與手號之間空一方（Par. 20.3）
      if (segno && part.hand !== 'O') return [{ text: hs + ' + ', id: null }].concat(pieces);
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
      const all = ol ? [rh, lh, ol] : [rh, lh];
      while (k + n < N && all.every((p) => sameAsPrev(p, k + n)) && (n === 0 || all.every((p) => !repeatTail(p.measures[k + n - 1])))) n++;
      return n >= 3 ? n : 0;
    };
    const runPieces = (part, k, n) => [{ text: '7#' + B.upperNumber(n) + repeatTail(part.measures[k + n - 1]), id: null, ids: [].concat(...part.measures.slice(k, k + n).map(measureIds)) }];
    while (mi < N) {
      // 中途換調、換拍號：以置中的段落標頭表示
      if (mi > 0 && (rh.measures[mi].key || rh.measures[mi].meter)) {
        const sig = signatureText(rh.measures[mi].key, prevKey, rh.measures[mi].meter);
        if (sig) {
          const l = new Line('', 'head');
          const c = center(sig, W);
          l.add(c);
          l.label(c.length - sig.length, c.length, sigLabel(rh.measures[mi].key, rh.measures[mi].meter));
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
      const numLine = new Line(pad(numbers[mi]) + (rh.measures[mi].splitCont ? "'" : ' '));
      numLine.label(numW - String(numbers[mi]).length, pad(numbers[mi]).length, numbers[mi]);
      // 每一行：[行, run-over 續行, 聲部, 圓滑線]；有旋律提示時小節號在提示行
      const rows = (ol ? [[numLine, [], ol, slO]] : []).concat([
        [ol ? new Line(indent) : numLine, [], rh, slR],
        [new Line(indent), [], lh, slL],
      ]);
      // 第一小節
      const run0 = bothRun(mi);
      const room0 = W - numLine.text.length;
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
      for (const [line, extra, part, sl] of rows) {
        const r0 = run0 ? { pieces: runPieces(part, mi, run0) } : render(part, sl, mi);
        fitOrRunover(line, extra, part, sl, handText(part, r0.pieces, rh.measures[mi].segno));
      }
      mi += run0 || 1;
      // 後續小節（沒有 run-over 時才並排）
      while (mi < N && rows.every((row) => !row[1].length)) {
        const m = rh.measures[mi];
        if (m.key || m.meter || m.segno || m.codaStart) break;
        // 跟隨 ABC 換行：ABC 換行處結束這一組上下對齊的段落
        if (abcStarts && abcStarts.has(mi)) break;
        const run = bothRun(mi);
        const rs = rows.map(([, , part, sl]) => (run ? { pieces: runPieces(part, mi, run) } : render(part, sl, mi)));
        const col = Math.max(...rows.map((row) => row[0].text.length)) + 1;
        if (col + Math.max(...rs.map((r) => piecesText(r.pieces).length)) > W) break;
        rows.forEach(([line], k) => {
          const gap = col - line.text.length;
          line.add(gap >= 7 ? ' ' + "'".repeat(gap - 2) + ' ' : ' '.repeat(gap));
          line.addPieces(rs[k].pieces, mi);
        });
        mi += run || 1;
      }
      for (const [line, extra] of rows) lines.push(line, ...extra);
    }
  }

  // ---------- 合奏總譜（Sec. 33）----------
  // 樂器名稱縮寫（Table 29，英文、義大利文、法文、德文）與常見中文名稱；鋼琴、豎琴的左右手各算一個樂器（Par. 33.2.3）
  const INSTR_ABBR = [
    [/^(piccolo|flauto piccolo|petite fl[uû]te|kleine fl[oö]te|短笛)/, 'pc'],
    [/^(flute|flauto|grande fl[uû]te|grosse fl[oö]te|fl[uû]te|長笛)/, 'fl'],
    [/^(english horn|corno inglese|cor anglais|englisches horn|英國管)/, 'eh'],
    [/^(oboe|hautbois|雙簧管)/, 'o'],
    [/^(bass clarinet|clarinetto basso|clarinette basse|bassklarinette|低音單簧管|低音豎笛)/, 'bcl'],
    [/^(clarinet|clarinetto|clarinette|klarinette|單簧管|豎笛)/, 'cl'],
    [/^(double bassoon|contrabassoon|contrafagotto|contrebasson|doppelfagott|倍低音管)/, 'bb'],
    [/^(bassoon|fagotto|basson|fagott|低音管|巴松管)/, 'b'],
    [/^(horn|french horn|corno|cor\b|法國號)/, 'hn'],
    [/^(trumpet|tromba|trompette|trompete|小號)/, 'tp'],
    [/^(trombone|posaune|長號)/, 'tb'],
    [/^(tuba|basstuba|低音號|土巴號)/, 'tu'],
    [/^(kettledrums?|timpani|timbales|pauken|定音鼓)/, 'dr'],
    [/^(cymbals?|cymbale|鈸)/, 'cym'],
    [/^(triangle|triangolo|triangel|三角鐵)/, 'tri'],
    [/^(snare drum|小鼓)/, 'sdr'],
    [/^(bass drum|大鼓)/, 'bdr'],
    [/^(violin|violino|violon|violine|小提琴)/, 'v'],
    [/^(viola|bratsche|中提琴)/, 'vl'],
    [/^(violoncello|cello|violoncelle|大提琴)/, 'vc'],
    [/^(double bass|contrabass|contrabasso|contrebasse|kontrabass|低音提琴)/, 'db'],
    [/^(harp|arpa|harpe|harfe|豎琴)/, 'h'],
    [/^(piano|pianoforte|klavier|鋼琴)/, 'p'],
  ];
  /**
   * 每個樂器（鋼琴每手一個）的縮寫 BRF：⠸ + 字母 + 編號（下位數字，不加數字記號，Par. 33.2.2）+ 點 3。
   * 表裡沒有的英文名稱取前兩個字母（Par. 33.2.1：兩三個字母、讓人聯想到名稱）；中文查不到時用 pt 加編號。
   */
  function instrumentAbbrs(parts) {
    const base = parts.map((p, k) => {
      // 鋼琴的左手沒有名稱：沿用右手（同一個樂器）
      const name = (p.name || (p.hand === 'L' && parts[k - 1] ? parts[k - 1].name : '') || '').trim().toLowerCase();
      const num = /\b(\d+|i{1,3})$/i.exec(name);
      const hit = INSTR_ABBR.find(([re]) => re.test(name));
      let a = hit ? hit[1] : (name.match(/[a-z]/g) || []).slice(0, 2).join('');
      if (!a) a = 'pt';
      // 鋼琴、豎琴：右手、左手（Table 29：pr/pl、hr/hl）
      if (p.hand && (a === 'p' || a === 'h')) a += p.hand === 'L' ? 'l' : 'r';
      const n = num ? (/^\d+$/.test(num[1]) ? +num[1] : num[1].length) : null;
      return { a, n: hit || a !== 'pt' ? n : k + 1 };
    });
    // 沒有編號、同一個縮寫出現兩次以上時依序編號
    const count = {};
    base.forEach((b) => b.n == null && (count[b.a] = (count[b.a] || 0) + 1));
    const seen = {};
    return base.map((b) => {
      const n = b.n == null && count[b.a] > 1 ? (seen[b.a] = (seen[b.a] || 0) + 1) : b.n;
      return '>' + b.a.toUpperCase() + (n != null ? B.lowerNumber(n) : '') + "'";
    });
  }

  /** 樂器表（Par. 33.2）：左欄樂器名稱（不用縮寫字），右欄縮寫；名稱比最長的短三格以上時補點 5 的引導點。 */
  function instrumentTable(parts, abbrs, env, lines) {
    const names = parts.map((p, k) => {
      const nm = p.name || (p.hand && parts[k - 1] ? parts[k - 1].name : '') || '';
      const full = p.hand ? nm + (p.hand === 'L' ? ' left hand' : ' right hand') : nm;
      const t = titleBrf(full.trim() || String(k + 1), []);
      if (t == null) env.warnings.push({ msg: '樂器名稱「' + full + '」需要國語點字表，樂器表改用編號' });
      return t == null ? B.upperNumber(k + 1) : t;
    });
    const longest = Math.max(...names.map((t) => t.length));
    names.forEach((t, k) => {
      const l = new Line('', 'text');
      let s = t;
      if (longest - t.length >= 3) s += ' ' + '"'.repeat(longest - t.length - 1);
      l.add(s.padEnd(longest + 2) + abbrs[k]);
      lines.push(l);
    });
    lines.push(new Line());
  }

  /**
   * 合奏總譜的小節對齊（Sec. 33）：每個樂器一行，行首是縮寫（調號不同時接在後面），音樂從最長縮寫後空一方開始；
   * 同一組（parallel）的小節上下對齊，空隙超過六方用引導點。整組都是休止的樂器省略（Par. 33.1）。
   * 每一行第一個音寫音層記號（Par. 33.4）；組與組之間空一行，再一行寫起始小節號（Par. 33.3、33.4.6）。
   */
  function writeEnsemble(score, env, lines, abbrs, ownKeys) {
    const { opts, numbers } = env;
    const parts = score.parts;
    const W = opts.width;
    const prefixes = parts.map((p, k) => abbrs[k] + (ownKeys ? keySig(p.measures[0].key ? p.measures[0].key.fifths : 0) : ''));
    const colW = Math.max(...prefixes.map((x) => x.length)) + 1;
    const N = parts[0].measures.length;
    const slurs = parts.map((p) => analyseSlurs(p, opts.slurStyle));
    const abcStarts = opts.lineMode === 'abc' ? abcLineStarts(parts[0]) : null;
    const hasNotes = (p, mi) => p.measures[mi].voices.some((v) => v.some((ev) => ev.kind === 'note'));
    // 一行裡的一小節：同一行裡明顯的小節重複可以用（Par. 33.4.3），不用數字重複
    const render = (k, mi, prev, first) => {
      env.slurs = slurs[k];
      if (!first && opts.measureRepeat && sameAsPrev(parts[k], mi)) return { pieces: [{ text: '7' + repeatTail(parts[k].measures[mi]), id: null, ids: measureIds(parts[k].measures[mi]) }], prev };
      return renderMeasure(parts[k], mi, env, { prev, forceFirst: first, grouping: true });
    };
    let mi = 0;
    let firstParallel = true;
    while (mi < N) {
      // 中途換拍號（各樂器調號相同時也含換調）：置中的段落標頭
      const m0 = parts[0].measures[mi];
      if (mi > 0 && (m0.meter || (!ownKeys && m0.key))) {
        const sig = signatureText(ownKeys ? null : m0.key, null, m0.meter);
        if (sig) {
          const l = new Line('', 'head');
          l.add(center(sig, W));
          lines.push(l);
        }
      }
      // 1. 決定這一組有哪些小節：用所有樂器的寬度估算（保守）
      const len = parts.map(() => colW);
      const prevs = parts.map(() => null);
      let end = mi;
      while (end < N) {
        const m = parts[0].measures[end];
        if (end > mi && (m.key || m.meter || m.segno || m.codaStart || (abcStarts && abcStarts.has(end)))) break;
        const r = parts.map((p, k) => render(k, end, prevs[k], end === mi));
        const col = end === mi ? colW : Math.max(...len) + 1;
        const wide = Math.max(...r.map((x) => piecesText(x.pieces).length));
        if (end > mi && col + wide > W) break;
        r.forEach((x, k) => {
          len[k] = col + piecesText(x.pieces).length;
          prevs[k] = x.prev;
        });
        end++;
      }
      // 2. 這組有音的樂器（都沒有時留第一個，休止也要寫出來）
      let active = parts.map((p, k) => k).filter((k) => parts[k].measures.slice(mi, end).some((m, j) => hasNotes(parts[k], mi + j)));
      if (!active.length) active = [0];
      // 3. 組與組之間：空一行，再寫起始小節號（縮排到音樂開始處再多一方）
      if (!firstParallel) {
        lines.push(new Line());
        const nl = new Line(' '.repeat(colW + 1));
        nl.add('#' + B.upperNumber(numbers[mi]));
        lines.push(nl);
      }
      firstParallel = false;
      // 4. 寫出各樂器的行，小節上下對齊
      const out = active.map((k) => ({ k, line: new Line(prefixes[k].padEnd(colW)), extra: [], prev: null }));
      for (let j = mi; j < end; j++) {
        const rs = out.map((o) => render(o.k, j, o.prev, j === mi));
        const col = j === mi ? colW : Math.max(...out.map((o) => o.line.text.length)) + 1;
        out.forEach((o, i) => {
          const pieces = rs[i].pieces;
          o.prev = rs[i].prev;
          if (j > mi) {
            const gap = col - o.line.text.length;
            o.line.add(gap >= 7 ? ' ' + "'".repeat(gap - 2) + ' ' : ' '.repeat(gap));
          }
          // 只有一小節而放不下：run-over，續行縮排兩方（Par. 33.4.7）
          if (end === mi + 1 && colW + piecesText(pieces).length > W) {
            env.slurs = slurs[o.k];
            const sp = splitMeasure(parts[o.k], j, env, null, W - colW, W - colW - 2, true);
            sp.rows.forEach((row, ri) => {
              if (ri === 0) o.line.addPieces(row, j);
              else {
                const x = new Line(' '.repeat(colW + 2));
                x.addPieces(row, j);
                o.extra.push(x);
              }
            });
          } else o.line.addPieces(pieces, j);
        });
      }
      for (const o of out) lines.push(o.line, ...o.extra);
      mi = end;
    }
  }

  /**
   * 分譜依序的點字（r 是 MB.parseAbc 的結果，r.ensemble 是所有聲部；各聲部分譜依序寫出，BANA Sec. 24 單行格式；不是 Sec. 33 的小節對齊總譜；唯讀）：曲名，再依序寫出每個聲部（聲部名稱置中當標題，鋼琴雙手一起寫）。
   * map 只含轉點字的聲部（位置加上前面的長度），游標對照只對得到它。
   */
  function partsBraille(r, options) {
    const o = Object.assign({}, options, { title: false });
    const W = o.width || 40;
    let brf = '';
    const map = [];
    let warnings = [];
    // 中文標題需要國語點字表；沒有時改用聲部編號
    const heading = (t, k) => MB.brailleHeading(t, W) || (k ? MB.brailleHeading(String(k), W) : null) || '';
    const title = r.score.title ? heading(r.score.title, 0) : '';
    if (title) brf += title + '\n\n';
    // 依 group 分段：同一個 group 相連的是鋼琴雙手
    const blocks = [];
    for (const p of r.ensemble) {
      const last = blocks[blocks.length - 1];
      if (last && p.group != null && last[0].group === p.group) last.push(p);
      else blocks.push([p]);
    }
    blocks.forEach((blk, k) => {
      const isSel = blk.every((p) => r.score.parts.includes(p));
      const sc = isSel ? r.score : Object.assign({}, r.score, { keyboard: blk.length === 2, parts: blk.map((p, i) => Object.assign({}, p, { hand: blk.length === 2 ? (i ? 'L' : 'R') : null })) });
      let res;
      try {
        res = toBraille(sc, o);
      } catch (e) {
        console.error(e);
        return;
      }
      brf += heading(blk.map((p) => p.name).filter(Boolean).join(' ') || String(k + 1), k + 1) + '\n';
      if (isSel) {
        for (const m of res.map) map.push(Object.assign({}, m, { start: m.start + brf.length, end: m.end + brf.length }));
        warnings = res.warnings;
      }
      brf += res.brf.replace(/\n+$/, '') + '\n\n';
    });
    return { brf: brf.replace(/\n+$/, '\n'), map, warnings };
  }

  // ---------- 合唱總譜（Sec. 37）----------
  // 聲部識別記號（Table 31、32）：女高音 S、女低音 A、男高音 T、男低音 B，第一、第二部加下位數字
  const VOICE_ID = [
    [/^(soprano|sopran|女高音)/i, 'S'],
    [/^(alto|contralto|mezzo|女低音|女中音)/i, 'A'],
    [/^(tenor|男高音)/i, 'T'],
    [/^(bass|basso|baritone|男低音|男中音)/i, 'B'],
  ];
  /** 每個人聲部的識別記號（不含 ⠜ 與點 3）與音程方向；不是 SATB 的名稱照樂器縮寫的取法 */
  function voiceIds(parts) {
    const fallback = instrumentAbbrs(parts.map((p) => Object.assign({}, p, { hand: null })));
    const base = parts.map((p, k) => {
      const name = (p.name || '').trim();
      const hit = VOICE_ID.find(([re]) => re.test(name));
      if (!hit) return { id: fallback[k].slice(1, -1), up: null };
      const num = /(\d+|\bi{1,3})$/i.exec(name);
      return { a: hit[1], n: num ? (/^\d+$/.test(num[1]) ? +num[1] : num[1].length) : null, up: hit[1] === 'T' || hit[1] === 'B' };
    });
    const count = {};
    base.forEach((b) => b.a && b.n == null && (count[b.a] = (count[b.a] || 0) + 1));
    const seen = {};
    return base.map((b) => {
      if (!b.a) return b;
      const n = b.n == null && count[b.a] > 1 ? (seen[b.a] = (seen[b.a] || 0) + 1) : b.n;
      return { id: b.a + (n != null ? B.lowerNumber(n) : ''), up: b.up };
    });
  }

  /** 行首加上前綴（span、墨字標示跟著移動） */
  function prefixLine(l, pre) {
    if (!pre) return l;
    const n = new Line(pre + l.text, l.kind);
    n.content = l.content;
    n.spans = l.spans.map((x) => Object.assign({}, x, { start: x.start + pre.length, end: x.end + pre.length }));
    n.labels = l.labels.map((x) => Object.assign({}, x, { start: x.start + pre.length, end: x.end + pre.length }));
    return n;
  }

  /**
   * 合唱總譜（Sec. 37）：擴充的小節對齊格式。每個平行段先寫歌詞行（從邊界開始），再寫各聲部的音樂行（從第 3 方開始），
   * 平行段之間不空行、不寫小節號。各聲部歌詞相同時只寫一行、不加識別記號（37.2）；不同時每個聲部一行，
   * 行首是識別記號加空方，歌詞開頭上下對齊，不能 run-over（37.3）。音樂行行首是 ⠜ 識別記號，
   * 只有第一個平行段與聲部組合改變時才寫（37.1(f)）。整段休止的聲部省略（37.1(c)）。
   * 音程：女高音、女低音由上往下讀，男高音、男低音由下往上讀（37.1(j)）。
   */
  function writeChoral(score, env, lines) {
    const { opts } = env;
    const W = opts.width;
    const ids = voiceIds(score.parts);
    const parts = score.parts.map((p, k) => (ids[k].up == null ? p : Object.assign({}, p, { dir: ids[k].up ? 'up' : 'down' })));
    const N = parts[0].measures.length;
    const slurs = parts.map((p) => analyseSlurs(p, opts.slurStyle, true));
    // 歌詞：先整首轉一次（國語點字表等警告只出現一次），各平行段再依範圍重轉
    const hasWords = parts.map((p) => !!vocalLayout(p, env));
    const quiet = { opts, warnings: [] };
    const words = (k, a, b) => {
      if (!hasWords[k]) return [];
      const lay = vocalLayout(parts[k], quiet, b < N ? [a, b] : [a]);
      return (lay && lay.linesAt.get(a)) || [];
    };
    const sameWords = (ws) => new Set(ws.filter((w) => w.length).map((w) => w.map((l) => l.text.trim()).join(' '))).size <= 1;
    const brk = new Set();
    parts[0].measures.forEach((m, i) => i > 0 && (m.lineStart || m.key || m.meter || m.segno || m.codaStart) && brk.add(i));
    const hasNotes = (p, mi) => p.measures[mi].voices.some((v) => v.some((ev) => ev.kind === 'note'));
    const render = (k, mi, prev, first) => {
      env.slurs = slurs[k];
      return renderMeasure(parts[k], mi, env, { prev, forceFirst: first, grouping: true });
    };
    const idW = Math.max(...ids.map((x) => x.id.length)) + 2; // ⠜ + 字母 + 點 3
    let prevKey = parts[0].measures[0].key;
    let prevMusic = null;
    let prevWords = null;
    let mi = 0;
    while (mi < N) {
      const m0 = parts[0].measures[mi];
      if (mi > 0 && (m0.key || m0.meter)) {
        const sig = signatureText(m0.key, prevKey, m0.meter);
        if (sig) {
          const l = new Line('', 'head');
          l.add(center(sig, W));
          lines.push(l);
        }
      }
      if (m0.key) prevKey = m0.key;
      // 1. 這個平行段有哪些小節：音樂行放得下，各聲部歌詞不同時每行歌詞也放得下
      const col0 = 2 + idW;
      const len = parts.map(() => col0);
      const prevs = parts.map(() => null);
      let end = mi;
      while (end < N) {
        if (end > mi && brk.has(end)) break;
        const r = parts.map((p, k) => render(k, end, prevs[k], end === mi));
        const col = end === mi ? col0 : Math.max(...len) + 1;
        if (end > mi && col + Math.max(...r.map((x) => piecesText(x.pieces).length)) > W) break;
        if (end > mi) {
          const ws = parts.map((p, k) => words(k, mi, end + 1));
          if (!sameWords(ws) && ws.some((w) => w.length > 1 || (w[0] && idW + w[0].text.length > W))) break;
        }
        r.forEach((x, k) => {
          len[k] = col + piecesText(x.pieces).length;
          prevs[k] = x.prev;
        });
        end++;
      }
      let active = parts.map((p, k) => k).filter((k) => parts[k].measures.slice(mi, end).some((m, j) => hasNotes(parts[k], mi + j)));
      if (!active.length) active = [0];
      // 2. 歌詞行
      const ws = active.map((k) => ({ k, ls: words(k, mi, end) })).filter((w) => w.ls.length);
      if (ws.length && sameWords(ws.map((w) => w.ls))) {
        for (const l of ws[0].ls) lines.push(l);
        prevWords = null;
      } else if (ws.length) {
        const assign = ws.map((w) => w.k).join();
        const show = assign !== prevWords;
        prevWords = assign;
        const wW = Math.max(...ws.map((w) => ids[w.k].id.length + 1)) + 1;
        for (const w of ws) w.ls.forEach((l, i) => lines.push(prefixLine(l, show && i === 0 ? (ids[w.k].id + "'").padEnd(wW) : '')));
      }
      // 3. 音樂行：小節上下對齊
      const assign = active.join();
      const showM = assign !== prevMusic;
      prevMusic = assign;
      const out = active.map((k) => ({ k, line: new Line('  ' + (showM ? ('>' + ids[k].id + "'").padEnd(idW) : '')), prev: null }));
      for (let j = mi; j < end; j++) {
        const rs = out.map((o) => render(o.k, j, o.prev, j === mi));
        const col = Math.max(...out.map((o) => o.line.text.length)) + 1;
        out.forEach((o, i) => {
          o.prev = rs[i].prev;
          if (j > mi) {
            const gap = col - o.line.text.length;
            o.line.add(gap >= 7 ? ' ' + "'".repeat(gap - 2) + ' ' : ' '.repeat(gap));
          }
          o.line.addPieces(rs[i].pieces, j);
        });
      }
      for (const o of out) lines.push(o.line);
      mi = end;
    }
  }

  // ---------- 人聲與伴奏（Par. 29.8）----------
  const VOCAL_NAME = /^(voice|vocals?|solo voice|singer|soprano|mezzo|contralto|人聲|歌聲|獨唱|主唱|女高音|女中音|女低音|男高音|男中音|男低音)/i;
  // 名稱就是聲部名（可加編號）：Bass、Alto 也可能是樂器，要有兩個以上這樣的聲部才算合唱
  const SATB_NAME = /^(soprano|alto|contralto|mezzo|tenor|bass|baritone|女高音|女中音|女低音|男高音|男中音|男低音)s*(d+|i{1,3})?$/i;
  /** 人聲聲部：有歌詞、名稱是人聲，或總譜裡有兩個以上 SATB 名稱的聲部 */
  function isVocal(p, all) {
    const name = (p.name || '').trim();
    if (VOCAL_NAME.test(name)) return true;
    if (SATB_NAME.test(name) && all && all.filter((q) => SATB_NAME.test((q.name || '').trim())).length > 1) return true;
    return p.measures.some((m) => m.voices.some((v) => v.some((ev) => ev.lyrics && ev.lyrics.some(Boolean))));
  }

  /** 伴奏的旋律提示（Par. 29.8）：只留音符、休止、連結線與延長記號，不寫歌詞、表情、圓滑線 */
  function outlinePart(p) {
    const ev2 = (ev) => ({
      id: ev.id,
      kind: ev.kind,
      value: ev.value,
      dots: ev.dots,
      tuplet: ev.tuplet,
      measureRest: ev.measureRest,
      notes: (ev.notes || []).map((n) => ({ step: n.step, octave: n.octave, accidental: n.accidental, alter: n.alter, tie: n.tie })),
      articulations: (ev.articulations || []).filter((a) => a === 'fermata'),
      src: ev.src,
    });
    const measures = p.measures.map((m) => Object.assign({}, m, { segno: false, codaStart: false, toCoda: false, fine: false, jump: null, voices: m.voices.map((v) => v.map(ev2)) }));
    return Object.assign({}, p, { hand: 'O', dir: null, measures });
  }

  /**
   * 總譜的點字（「內容」選總譜時）：有人聲又有伴奏時照 Par. 29.8 分開寫——人聲照歌曲格式（Sec. 35，含歌詞），
   * 伴奏另外寫；鋼琴伴奏在右手上方加人聲的旋律提示。其他情形是器樂合奏總譜（Sec. 33）。
   * map 只含轉點字的聲部（同 partsBraille）。
   */
  function scoreBraille(r, options) {
    const vocal = r.ensemble.filter((p) => isVocal(p, r.ensemble));
    const acc = r.ensemble.filter((p) => !vocal.includes(p));
    const choral = vocal.length > 1 ? Object.assign({}, r.score, { keyboard: false, ensemble: false, choral: true, parts: vocal }) : null;
    if (choral && !acc.length) return toBraille(choral, options);
    if (!vocal.length || !acc.length) return toBraille(ensembleScore(r), options);
    const o = Object.assign({}, options, { title: false });
    const W = o.width || 40;
    let brf = '';
    const map = [];
    const warnings = [];
    const heading = (t, k) => MB.brailleHeading(t, W) || (k ? MB.brailleHeading(String(k), W) : null) || '';
    if (r.score.title) {
      const t = heading(r.score.title, 0);
      if (t) brf += t + '\n\n';
    }
    // 依 group 分段：同一個 group 相連的是鋼琴雙手
    const blocks = (parts) => {
      const out = [];
      for (const p of parts) {
        const last = out[out.length - 1];
        if (last && p.group != null && last[0].group === p.group) last.push(p);
        else out.push([p]);
      }
      return out;
    };
    const handed = (blk) => blk.map((p, i) => Object.assign({}, p, { hand: blk.length === 2 ? (i ? 'L' : 'R') : null }));
    const accBlocks = blocks(acc);
    // 人聲：一部照歌曲格式，兩部以上是合唱總譜；伴奏的旋律提示用第一個人聲部
    const items = choral ? [{ name: 'Choir', parts: vocal, score: choral }] : [{ name: vocal[0].name, parts: vocal, score: Object.assign({}, r.score, { keyboard: false, ensemble: false, parts: vocal }) }];
    if (accBlocks.length === 1 && accBlocks[0].length === 2) {
      // 鋼琴伴奏：右手上方加旋律提示
      const blk = accBlocks[0];
      items.push({ name: blk[0].name || '伴奏', parts: blk, score: Object.assign({}, r.score, { keyboard: true, ensemble: false, parts: handed(blk), outline: outlinePart(vocal[0]) }) });
    } else if (acc.length === 1) items.push({ name: acc[0].name || '伴奏', parts: acc, score: Object.assign({}, r.score, { keyboard: false, ensemble: false, parts: acc }) });
    else
      // 樂器合奏的伴奏：照 Sec. 33 寫成總譜
      items.push({ name: '伴奏', parts: acc, score: ensembleScore(Object.assign({}, r, { ensemble: acc })) });
    items.forEach((it, k) => {
      let res;
      try {
        res = toBraille(it.score, o);
      } catch (e) {
        console.error(e);
        return;
      }
      brf += heading(it.name || String(k + 1), k + 1) + '\n';
      // 選到的聲部就是這一段（同一個物件）時，游標對照對得到
      if (r.score.parts.every((p) => it.parts.includes(p)))
        for (const m of res.map) map.push(Object.assign({}, m, { start: m.start + brf.length, end: m.end + brf.length }));
      for (const w of res.warnings) if (!warnings.some((x) => x.msg === w.msg)) warnings.push(w);
      brf += res.brf.replace(/\n+$/, '') + '\n\n';
    });
    return { brf: brf.replace(/\n+$/, '\n'), map, warnings };
  }

  /**
   * 合奏總譜（BANA Sec. 33）用的樂譜，交給 toBraille：ABC 裡所有聲部依原本順序；同一個 group 相連的兩個聲部是鋼琴的右手、左手。
   * 事件物件沿用（id 相同），點字區的游標仍對得到轉點字的聲部。
   */
  function ensembleScore(r) {
    const a = r.ensemble;
    const parts = a.map((p, i) => {
      const g = p.group;
      const left = g != null && a[i - 1] && a[i - 1].group === g;
      const right = g != null && !left && a[i + 1] && a[i + 1].group === g;
      return Object.assign({}, p, { hand: left ? 'L' : right ? 'R' : null });
    });
    return Object.assign({}, r.score, { keyboard: false, ensemble: true, parts });
  }

  MB.toBraille = toBraille;
  MB.partsBraille = partsBraille;
  MB.scoreBraille = scoreBraille;
  MB.isVocalPart = isVocal;
  MB.ensembleScore = ensembleScore;
  MB.instrumentAbbrs = instrumentAbbrs;
  /** 置中的文字標題（曲名、總譜裡的聲部名稱）；中文需要國語點字表，沒有時回傳 null。 */
  MB.brailleHeading = (text, width) => {
    const t = titleBrf(text, []);
    return t ? center(t, width || 40) : null;
  };
  MB.brailleSigns = { NOTE, REST, OCT, ACC, INTERVAL, ARTIC, HAND, needOctave, keySig, meterSig, tempoSig };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
