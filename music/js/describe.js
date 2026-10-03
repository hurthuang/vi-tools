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
    if (ev.hairpinStart) parts.push(ev.hairpinStart === 'cresc' ? '漸強開始' : '漸弱開始');
    if (ev.slurStart) parts.push('圓滑線開始');
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
    // 歌詞（第一段）：一個音節唱好幾個音時，後面的音說「延長」
    const lyr = ev.lyrics && ev.lyrics[0];
    if (lyr) parts.push(lyr.extend ? '歌詞延長' : '歌詞「' + lyr.text + '」');
    if (ev.slurEnd) parts.push('圓滑線結束');
    if (ev.hairpinEnd) parts.push(ev.hairpinEnd === 'cresc' ? '漸強結束' : '漸弱結束');
    if (ev.pedalUp) parts.push('放開踏板');
    return parts.join('，');
  }

  function keyText(key) {
    const n = Math.abs(key.fifths || 0);
    const sig = n ? n + ' 個' + (key.fifths > 0 ? '升' : '降') + '記號' : '沒有升降記號';
    const name = MB.model.keyName(key);
    const m = /^([A-G])(#+|b+)?(m?)/.exec(name);
    const tonic = m ? (m[2] ? (m[2][0] === '#' ? '升' : '降').repeat(m[2].length) : '') + m[1] : name;
    const mode = key.mode && key.mode !== 'major' && key.mode !== 'minor' ? key.mode + ' 調式' : m && m[3] ? '小調' : '大調';
    return '調號 ' + sig + '（' + tonic + ' ' + mode + '）';
  }
  const meterText = (mt) => mt.den + ' 分之 ' + mt.num + ' 拍';

  /**
   * 整首曲子的報讀文字：開頭一行曲名、調號、拍號、速度，之後每小節（鋼琴每手）一行。
   * 給「全曲報讀」區塊使用，一行一個朗讀項目。
   */
  function describeScore(score, opts) {
    const M = MB.model;
    const lines = [];
    const p0 = score.parts[0];
    if (!p0) return '';
    const head = [];
    if (score.title) head.push('曲名 ' + score.title);
    if (score.composer) head.push('作曲 ' + score.composer);
    head.push(keyText(M.keyAt(p0, 0)), meterText(M.meterAt(p0, 0)));
    if (score.tempo && score.tempo.bpm) head.push('速度 每分鐘 ' + score.tempo.bpm + ' 個' + durationName({ value: score.tempo.value, dots: score.tempo.dots, kind: 'note' }));
    head.push('共 ' + p0.measures.length + ' 小節' + (score.keyboard ? '，鋼琴雙手' : ''));
    lines.push(head.join('，'));
    const numbers = M.measureNumbers(score);
    p0.measures.forEach((m0, mi) => {
      const nav = [];
      if (mi > 0 && m0.key) nav.push('改為' + keyText(m0.key));
      if (mi > 0 && m0.meter) nav.push('改為 ' + meterText(m0.meter));
      if (m0.segno) nav.push('記號 segno');
      if (m0.codaStart) nav.push('尾奏 Coda');
      if (m0.startRepeat) nav.push('反覆開始');
      if (m0.volta) nav.push('第 ' + m0.volta + ' 房');
      score.parts.forEach((part, pi) => {
        const m = part.measures[mi];
        if (!m) return;
        const label = '第 ' + (numbers[mi] != null ? numbers[mi] : mi + 1) + ' 小節' + (part.hand ? (part.hand === 'R' ? ' 右手' : ' 左手') : '');
        const voices = m.voices.filter((v) => v.length).map((v) => v.map((ev) => describeEvent(ev, null, opts)).join('；'));
        const body = voices.length > 1 ? voices.map((v, k) => '第 ' + (k + 1) + ' 聲部 ' + v).join('。') : voices[0] || '空小節';
        lines.push(label + '：' + (pi === 0 && nav.length ? nav.join('，') + '，' : '') + body);
      });
      const end = [];
      if (m0.toCoda) end.push('跳到尾奏');
      if (m0.fine) end.push('Fine 結束');
      if (m0.jump) end.push(m0.jump.type === 'DC' ? '從頭反覆' : '從 segno 反覆' + (m0.jump.to === 'fine' ? '到 Fine' : m0.jump.to === 'coda' ? '再跳到尾奏' : ''));
      if (m0.endRepeat) end.push('反覆結束');
      if (end.length) lines[lines.length - 1] += '，' + end.join('，');
    });
    return lines.join('\n');
  }

  MB.describe = { describeEvent, describeScore, pitchName, durationName };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
