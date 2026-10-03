/*
 * 點字對照：在五線譜每個音下方標示該音的點字，以及音名、唱名或簡譜。
 * 產生加了對照文字的 ABC（點字與名稱寫成兩行歌詞；休止符與第二聲部以後用註解文字），
 * 畫譜後的對齊與字型由 app.js 處理。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const B = MB.brf;

  const ACC = { sharp: '♯', flat: '♭', natural: '♮', dsharp: '×', dflat: '♭♭' };
  // 唱名用固定唱名（C 為 Do），和朗讀的「唱名」選項一致；簡譜用首調（調號的主音為 1）
  const SOLFA = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
  const STEPS = 'CDEFGAB';
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

  /** 大調主音的音名（小調用關係大調，也就是以 La 為主音的首調）。 */
  function tonicStep(fifths) {
    return 'FCGDAEB'[((((fifths || 0) + 1) % 7) + 7) % 7];
  }

  /** 每個事件在點字中的文字（Unicode 點字）。小節重複記號 ⠶ 只標在被重複小節的第一個音。 */
  function brailleByEvent(res) {
    const out = new Map();
    const used = new Set();
    for (const m of res.map) {
      if (!m.id) continue;
      const key = m.start + ':' + m.end;
      if (used.has(key) && !out.has(m.id)) {
        out.set(m.id, '');
        continue;
      }
      used.add(key);
      // 小節結尾的反覆指示文字（>FINE>、D.C.、Coda 記號）五線譜上已經有，不放進對照，免得太寬
      let brf = res.brf.slice(m.start, m.end);
      while (/ (>[^>]*>|\+L)$/.test(brf)) brf = brf.replace(/ (>[^>]*>|\+L)$/, '');
      const t = B.toUnicode(brf).replace(/\s+/g, '');
      out.set(m.id, (out.get(m.id) || '') + t);
    }
    return out;
  }

  /**
   * 名稱。mode：'letter' 音名、'solfa' 唱名、'jianpu' 簡譜。寫了音層記號的音前面加音層數字（例如 5E）。
   * 和弦依點字的書寫順序（主音、音程）以 / 分隔。
   */
  function nameOf(ev, mode, fifths, info) {
    if (ev.kind !== 'note') return '休';
    const notes = info ? info.notes : ev.notes;
    const tonic = STEPS.indexOf(tonicStep(fifths));
    return notes
      .map((n, k) => {
        const acc = n.accidental ? ACC[n.accidental] : '';
        let base;
        if (mode === 'solfa') base = SOLFA[n.step];
        else if (mode === 'jianpu') base = String(((STEPS.indexOf(n.step) - tonic + 7) % 7) + 1);
        else base = n.step;
        const marked = info && info.marked[k];
        // 簡譜本身是數字，音層數字改用上標，避免混淆
        const oct = !marked ? '' : mode === 'jianpu' ? String(n.octave).split('').map((d) => SUP[+d]).join('') : String(n.octave);
        return oct + acc + base;
      })
      .join('/');
  }

  /**
   * 產生點字對照用的 ABC。
   * opts.names：'none' | 'letter' | 'solfa' | 'jianpu'；opts.measuresPerLine：每行小節數（0 表示照原本的分行）。
   */
  function annotatedAbc(score, res, opts) {
    const o = opts || {};
    const brl = brailleByEvent(res);
    const marks = res.noteMarks || new Map();
    // 每個事件所在小節的調號
    const keyOf = new Map();
    for (const part of score.parts) {
      let fifths = 0;
      part.measures.forEach((m) => {
        if (m.key) fifths = m.key.fifths || 0;
        for (const v of m.voices) for (const ev of v) keyOf.set(ev.id, fifths);
      });
    }
    const annot = (ev) => ({
      brl: brl.get(ev.id) || '',
      name: o.names && o.names !== 'none' ? nameOf(ev, o.names, keyOf.get(ev.id), marks.get(ev.id)) : '',
    });
    const per = o.measuresPerLine || 0;
    return MB.toAbc(score, { annot, measuresPerLine: per || 4, fixedLines: !!per });
  }

  MB.annotate = { annotatedAbc, nameOf, brailleByEvent };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
