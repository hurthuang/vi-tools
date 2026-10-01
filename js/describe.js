/*
 * 將音符事件轉成中文描述，供語音報讀與螢幕閱讀器使用。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});

  const VALUE_NAME = { 1: '全', 2: '二分', 4: '四分', 8: '八分', 16: '十六分', 32: '三十二分', 64: '六十四分', 128: '一百二十八分' };
  const SOLFEGE = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
  const ALTER_NAME = { 1: '升', 2: '重升', '-1': '降', '-2': '重降' };
  const DYN_NAME = { pp: '很弱', p: '弱', mp: '中弱', mf: '中強', f: '強', ff: '很強' };
  const ARTIC_NAME = { arpeggio: '琶音', staccato: '斷奏', staccatissimo: '短斷奏', accent: '重音', tenuto: '持音', fermata: '延長記號' };
  const ORN_NAME = { trill: '顫音', mordent: '下漣音', uppermordent: '上漣音', turn: '迴音', invertedturn: '逆迴音' };

  function fingerName(f) {
    if (!f) return '';
    return f.length > 1 ? '換指 ' + f.split('').join(' 到 ') : '指法 ' + f;
  }

  function pitchName(n, opts) {
    const name = opts && opts.solfege ? SOLFEGE[n.step] : n.step;
    let pre = '';
    if (n.accidental === 'natural') pre = '還原';
    else if (n.alter) pre = ALTER_NAME[n.alter] || '';
    return pre + name + (opts && opts.solfege ? '' : n.octave);
  }

  function durationName(ev) {
    if (ev.measureRest) return '全小節休止';
    const dots = ev.dots === 1 ? '附點' : ev.dots === 2 ? '複附點' : '';
    return dots + VALUE_NAME[ev.value] + (ev.kind === 'rest' ? '休止符' : '音符');
  }

  /** ctx: {number, hand} */
  function describeEvent(ev, ctx, opts) {
    const parts = [];
    if (ctx && ctx.number != null) parts.push('第' + ctx.number + '小節');
    if (ctx && ctx.hand) parts.push(ctx.hand === 'R' ? '右手' : '左手');
    if (ev.pedalChange) parts.push('換踏板');
    else if (ev.pedalDown) parts.push('踩踏板');
    if (ev.dynamic) parts.push(DYN_NAME[ev.dynamic] || ev.dynamic);
    if (ev.graces && ev.graces.length) {
      const one = ev.graces.length === 1 && !ev.graces[0].slash;
      parts.push((one ? '長倚音 ' : '倚音 ') + ev.graces.map((g) => pitchName(g.notes[0], opts)).join('、'));
    }
    if (ev.tuplet && ev.tuplet.start) parts.push(ev.tuplet.n === 3 ? '三連音' : ev.tuplet.n + '連音');
    for (const a of ev.articulations || []) if (ARTIC_NAME[a]) parts.push(ARTIC_NAME[a]);
    for (const o of ev.ornaments || []) if (ORN_NAME[o]) parts.push(ORN_NAME[o]);
    if (ev.kind === 'rest') {
      parts.push(durationName(ev));
    } else {
      const names = ev.notes.map((n) => pitchName(n, opts));
      parts.push(durationName(ev));
      parts.push(ev.notes.length > 1 ? '和弦 ' + names.join('、') : names[0]);
      const fingers = ev.notes.filter((n) => n.finger);
      const alts = ev.notes.filter((n) => n.fingerAlt && n.fingerAlt !== 'x');
      if (ev.notes.length === 1 && alts.length) parts.push('指法 ' + (ev.notes[0].finger || '－') + ' 或 ' + alts[0].fingerAlt);
      else if (fingers.length === 1 && ev.notes.length === 1) parts.push(fingerName(fingers[0].finger));
      else if (fingers.length) parts.push('指法 ' + ev.notes.map((n) => n.finger || '－').join('、'));
      if (ev.notes.some((n) => n.tie)) parts.push('連結');
    }
    if (ev.pedalUp) parts.push('放開踏板');
    return parts.join('，');
  }

  MB.describe = { describeEvent, pitchName, durationName };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
