/*
 * 內部模型 → ABC 記譜。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const M = MB.model;

  const ACC = { sharp: '^', dsharp: '^^', flat: '_', dflat: '__', natural: '=' };
  // 斷奏用簡寫「.」：abcjs 不認得 !staccato!，會畫不出來
  const ARTIC = { arpeggio: '!arpeggio!', staccato: '.', staccatissimo: '!wedge!', accent: '!accent!', tenuto: '!tenuto!', fermata: '!fermata!', breath: '!breath!', caesura: '!breath!' }; // abcjs 沒有 caesura，用換氣記號顯示
  const UNIT = M.TPW / 8; // L:1/8
  const ORN = { trill: '!trill!', mordent: '!lowermordent!', uppermordent: '!uppermordent!', turn: '!turn!', invertedturn: '!invertedturn!' };
  const fingerDeco = (n) => (n.finger ? n.finger.split('').map((f) => '!' + f + '!').join('') : '');
  // ABC 標準的反覆裝飾記號（abcjs 會畫在正確位置）
  const JUMP_DECO = (j) => '!' + (j.type === 'DC' ? 'D.C.' : 'D.S.') + (j.to === 'fine' ? 'alfine' : j.to === 'coda' ? 'alcoda' : '') + '!';

  function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
  }

  function lenStr(ticks) {
    const k = gcd(ticks, UNIT);
    const p = ticks / k;
    const q = UNIT / k;
    if (q === 1) return p === 1 ? '' : String(p);
    return (p === 1 ? '' : String(p)) + '/' + (q === 2 ? '' : String(q));
  }

  function pitchStr(n) {
    let s;
    if (n.octave >= 5) s = n.step.toLowerCase() + "'".repeat(n.octave - 5);
    else s = n.step + ','.repeat(4 - n.octave);
    return (n.accidental ? ACC[n.accidental] : '') + s;
  }

  function meterStr(m) {
    if (m.symbol === 'C') return 'C';
    if (m.symbol === 'C|') return 'C|';
    return m.num + '/' + m.den;
  }

  function tempoStr(t) {
    const ticks = M.valueTicks(t.value, t.dots);
    const k = gcd(ticks, M.TPW);
    return ticks / k + '/' + M.TPW / k + '=' + t.bpm;
  }

  function eventStr(ev, meter, count, note) {
    let s = '';
    if (ev.tuplet && ev.tuplet.start) {
      const def = { 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 }[ev.tuplet.n];
      // (p:q:r：連音裡的音符數 r 與 p 不同時要寫出來
      if (count && count !== ev.tuplet.n) s += '(' + ev.tuplet.n + ':' + ev.tuplet.of + ':' + count;
      else s += '(' + ev.tuplet.n + (def === ev.tuplet.of ? '' : ':' + ev.tuplet.of);
    }
    s += '('.repeat(ev.slurStart || 0);
    // 點字對照：休止符與第二聲部以後的音，用譜下方的註解文字標示（歌詞只對得到第一聲部的音）
    if (note) s += note;
    // 倚音：單一且有斜線 {/g}；其餘 {g} 或 {gag}
    if (ev.graces && ev.graces.length) {
      const one = ev.graces.length === 1 && ev.graces[0].slash;
      s += '{' + (one ? '/' : '') + ev.graces.map((gr) => pitchStr(gr.notes[0]) + lenStr(M.valueTicks(gr.value, gr.dots))).join('') + '}';
    }
    if (ev.pedalChange) s += '!ped-up!!ped!';
    if (ev.pedalDown) s += '!ped!';
    if (ev.pedalUp) s += '!ped-up!';
    // 文字表情：寫成五線譜上方的註解文字
    for (const w of ev.words || []) s += '"^' + w.replace(/"/g, "'") + '"';
    if (ev.dynamic) s += '!' + ev.dynamic + '!';
    // 漸強漸弱用 !crescendo(! 等完整名稱（abcjs 不認得 !<(!）
    if (ev.hairpinStart) s += ev.hairpinStart === 'cresc' ? '!crescendo(!' : '!diminuendo(!';
    if (ev.hairpinEnd) s += ev.hairpinEnd === 'cresc' ? '!crescendo)!' : '!diminuendo)!';
    for (const a of ev.articulations || []) if (ARTIC[a]) s += ARTIC[a];
    for (const o of ev.ornaments || []) if (ORN[o]) s += ORN[o];
    if (ev.kind === 'rest') {
      const t = ev.measureRest ? M.meterTicks(meter) : M.valueTicks(ev.value, ev.dots);
      s += 'z' + lenStr(t);
    } else {
      const len = lenStr(M.valueTicks(ev.value, ev.dots));
      const notes = ev.notes.slice().sort((a, b) => M.diatonic(a) - M.diatonic(b));
      if (notes.length === 1) {
        s += fingerDeco(notes[0]) + pitchStr(notes[0]) + len + (notes[0].tie ? '-' : '');
      } else {
        // 和弦的指法寫在和弦內各音之前：[!1!C!3!E!5!G]
        const all = notes.every((n) => n.tie);
        s += '[' + notes.map((n) => fingerDeco(n) + pitchStr(n) + (n.tie && !all ? '-' : '')).join('') + ']' + len + (all ? '-' : '');
      }
    }
    s += ')'.repeat(ev.slurEnd || 0);
    return s;
  }

  /**
   * options.annot(ev, vi)：點字對照，回傳 { brl, name }（name 可省略）。第一聲部的音寫成兩行歌詞，
   * 其他用註解文字 "_…"（名稱前加 \u200b，畫譜後用來辨認）。options.fixedLines：照 measuresPerLine 分行，不用原本的分行。
   */
  function toAbc(score, options) {
    const opts = Object.assign({ measuresPerLine: 4 }, options || {});
    const annot = opts.annot;
    let out = '';
    const map = [];
    const add = (str, id) => {
      const s = out.length;
      out += str;
      if (id) map.push({ id, start: s, end: out.length });
    };
    const first = score.parts[0];
    const m0 = first.measures[0] || {};
    add('X:1\n');
    if (annot) add('%%vocalfont Helvetica 16\n%%annotationfont Helvetica 16\n');
    add('T:' + (score.title || '') + '\n');
    if (score.composer) add('C:' + score.composer + '\n');
    add('M:' + meterStr(m0.meter || { num: 4, den: 4 }) + '\n');
    add('L:1/8\n');
    if (score.tempo || score.tempoText) add('Q:' + [score.tempoText ? '"' + score.tempoText + '"' : '', score.tempo ? tempoStr(score.tempo) : ''].filter(Boolean).join(' ') + '\n');
    if (score.keyboard) {
      add('%%score {RH | LH}\n');
      add('V:RH clef=treble name="R.H."\n');
      add('V:LH clef=bass name="L.H."\n');
      add('K:' + M.keyName(m0.key || { fifths: 0 }) + '\n');
    } else {
      add('K:' + M.keyName(m0.key || { fifths: 0 }) + (first.clef === 'bass' ? ' clef=bass' : '') + '\n');
    }

    const N = first.measures.length;
    const per = opts.measuresPerLine;
    const writePartChunk = (part, from, to, nav) => {
      for (let mi = from; mi < to; mi++) {
        const m = part.measures[mi];
        const meter = M.meterAt(part, mi);
        if (mi === from && m.startRepeat) add('|:');
        if (mi > 0 && m.key) add('[K:' + M.keyName(m.key) + ']');
        if (mi > 0 && m.meter) add('[M:' + meterStr(m.meter) + ']');
        if (m.volta && mi === from) add('[' + m.volta + ' ');
        // 反覆指示只寫在第一個聲部
        if (nav && m.segno) add('!segno!');
        // Coda 段落開頭：前面已有「跳到 Coda」時用 Coda 記號，否則用文字
        if (nav && m.codaStart) add(part.measures.slice(0, mi).some((x) => x.toCoda) ? '!coda!' : '"^Coda"');
        // 小節結尾的反覆指示掛在第一聲部最後一個音上（abcjs 才會顯示在正確位置）
        let endNav = '';
        if (nav && m.toCoda) endNav += '!coda!';
        if (nav && m.fine) endNav += '!fine!';
        if (nav && m.jump) endNav += JUMP_DECO(m.jump);
        m.voices.forEach((voice, vi) => {
          if (vi > 0) add(' & ');
          voice.forEach((ev, ei) => {
            if (ei > 0) add(' ');
            if (vi === 0 && ei === voice.length - 1 && endNav) add(endNav);
            let count = 0;
            if (ev.tuplet && ev.tuplet.start) {
              for (let k = ei; k < voice.length && voice[k].tuplet; k++) {
                count++;
                if (voice[k].tuplet.end) break;
              }
            }
            let note = '';
            if (annot && (vi > 0 || ev.kind !== 'note')) {
              const a = annot(ev, vi);
              if (a && a.brl) note += '"_' + a.brl + '"';
              if (a && a.name) note += '"_\u200b' + a.name + '"';
            }
            add(eventStr(ev, meter, count, note), ev.id);
          });
        });
        // 小節線
        const next = part.measures[mi + 1];
        let bar;
        if (m.endRepeat) bar = next && next.startRepeat && mi + 1 < to ? '::' : ':|';
        else if (m.barline === 'final') bar = '|]';
        else if (next && next.startRepeat && mi + 1 < to) bar = '|:';
        else if (m.barline === 'double') bar = '||';
        else bar = '|';
        add(' ' + bar);
        if (next && next.volta && mi + 1 < to) add('[' + next.volta);
        add(mi + 1 < to ? ' ' : '');
      }
      add('\n');
      writeLyrics(part, from, to);
    };
    // w: 歌詞：每段一行，一個音一個音節；- 接同一個字的下一個音節，_ 延長，* 沒有歌詞
    const writeLyrics = (part, from, to) => {
      const notes = [];
      for (let mi = from; mi < to; mi++) for (const ev of part.measures[mi].voices[0] || []) if (ev.kind === 'note') notes.push(ev);
      const verses = Math.max(0, ...notes.map((ev) => (ev.lyrics ? ev.lyrics.length : 0)));
      for (let v = 0; v < verses; v++) {
        let line = '';
        notes.forEach((ev, k) => {
          const l = ev.lyrics && ev.lyrics[v];
          const tok = !l ? '*' : l.extend ? '_' : l.text.replace(/-/g, '\\-').replace(/ /g, '~');
          const joined = l && !l.extend && (l.syllabic === 'begin' || l.syllabic === 'middle');
          line += tok + (k < notes.length - 1 ? (joined ? '-' : ' ') : '');
        });
        line = line.replace(/( \*)+$/, '');
        if (line.replace(/[*_ ]/g, '')) add('w:' + line + '\n');
      }
      // 點字對照：一行點字、一行名稱（音名、唱名或簡譜）
      if (annot) {
        const as = notes.map((ev) => annot(ev, 0) || {});
        const tok = (t) => (t ? t.replace(/[\s~_*|-]/g, '') || '*' : '*');
        add('w:' + as.map((a) => tok(a.brl)).join(' ') + '\n');
        if (as.some((a) => a.name)) add('w:' + as.map((a) => tok(a.name)).join(' ') + '\n');
      }
    };
    // 分行：有原本 ABC 的分行（歌詞要跟著那一行）就照原本，否則每行固定小節數
    const starts = [];
    if (!opts.fixedLines && first.measures.some((m, i) => i > 0 && m.lineStart)) first.measures.forEach((m, i) => (i === 0 || m.lineStart) && starts.push(i));
    else for (let i = 0; i < N; i += per) starts.push(i);
    for (let si = 0; si < starts.length; si++) {
      const from = starts[si];
      const to = si + 1 < starts.length ? starts[si + 1] : N;
      if (score.keyboard) {
        add('V:RH\n');
        writePartChunk(score.parts[0], from, to, true);
        add('V:LH\n');
        writePartChunk(score.parts[1], from, to, false);
      } else writePartChunk(first, from, to, true);
    }
    return { abc: out, map };
  }

  MB.toAbc = toAbc;
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
