/*
 * 譜例方框的文字說明（MB.examMarks）：樂理試題常用「方框 A 內的音」「括號 B」指出譜例的某一段。
 * 點字樂譜照 BANA Par. 1.13.1 用方括號標出範圍（braille-write.js），這裡另外產生文字說明，
 * 給報讀員念、給聽讀的學生用，例如「方框 A：第 3 小節第 2 拍到第 4 拍，3 個音：E4、升 F4、G4」。
 * ABC 寫法："^[A" 開始、"^A]" 結束、"^[A]" 只框一個音（見 abc-parse.js）。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const M = MB.model;
  const ACC = { '-2': '重降 ', '-1': '降 ', 0: '', 1: '升 ', 2: '重升 ' };

  function noteName(n) {
    return ACC[n.alter || 0] + n.step + n.octave;
  }
  function eventName(ev) {
    if (ev.kind === 'rest') return '休止符';
    return ev.notes.map(noteName).join('＋');
  }
  /** 拍點：第 2 拍、第 2 拍後半、第 2 拍的第 3 個十六分音符。 */
  function beatText(ticks, meter) {
    const beat = M.TPW / meter.den;
    const k = Math.floor(ticks / beat);
    const rest = ticks - k * beat;
    if (!rest) return '第 ' + (k + 1) + ' 拍';
    if (rest * 2 === beat) return '第 ' + (k + 1) + ' 拍後半';
    const q = beat / 4;
    if (rest % q === 0) return '第 ' + (k + 1) + ' 拍的第 ' + (rest / q + 1) + ' 個十六分音符';
    return '第 ' + (k + 1) + ' 拍中間';
  }

  // 弱起小節的編號是 0
  const barText = (n) => (n === 0 ? '弱起小節' : '第 ' + n + ' 小節');

  /** 回傳 [{label, text}]，依方框開始的順序。 */
  function describe(score) {
    const out = [];
    if (!score || !score.parts) return out;
    const numbers = M.measureNumbers(score);
    score.parts.forEach((part, pi) => {
      const open = {};
      // 總譜（score.ensemble）裡的鋼琴寫成「Primo 右手」「鋼琴左手」，只有一個樂器時寫「右手」
      const hand = part.hand === 'R' ? '右手' : part.hand === 'L' ? '左手' : '';
      const mate = part.hand === 'L' ? score.parts[pi - 1] : part.hand === 'R' ? score.parts[pi + 1] : null;
      const inst = part.name || (mate && mate.hand && mate.name) || '';
      const who = hand ? (score.ensemble ? (inst ? inst + ' ' : '鋼琴') : '') + hand : inst || '第 ' + (pi + 1) + ' 聲部';
      const partName = score.parts.length > 1 ? who + '的' : '';
      part.measures.forEach((m, mi) => {
        const meter = M.meterAt(part, mi);
        m.voices.forEach((voice, vi) => {
        let t = 0;
        voice.forEach((ev) => {
          const where = { mi, at: t, num: numbers[mi] };
          for (const l of ev.markStart || []) open[l] = { start: where, events: [], vi };
          for (const l in open) if (open[l].vi === vi) open[l].events.push(ev);
          for (const l of ev.markEnd || []) {
            const o = open[l];
            if (!o) continue;
            delete open[l];
            const a = o.start;
            const startText = barText(a.num) + beatText(a.at, M.meterAt(part, a.mi));
            // 結束：最後一個音延續到的那一拍
            const lastTick = t + M.eventTicks(ev) - 1;
            const endText = (mi === a.mi ? '' : barText(numbers[mi])) + '第 ' + (Math.floor(lastTick / (M.TPW / meter.den)) + 1) + ' 拍';
            // 同一拍內（例如一拍裡的三十二分音符）只寫一次拍子
            const sameBeat = mi === a.mi && Math.floor(a.at / (M.TPW / meter.den)) === Math.floor(lastTick / (M.TPW / meter.den));
            const span = o.events.length === 1 || sameBeat ? startText + (o.events.length > 1 && sameBeat ? '（同一拍內）' : '') : startText + '到' + endText;
            // 同一小節有兩個聲部（in-accord）時，標出是哪一個
            const avg = (v) => {
              const ns = v.filter((e) => e.kind === 'note').flatMap((e) => e.notes.map(M.diatonic));
              return ns.length ? ns.reduce((x, y) => x + y, 0) / ns.length : null;
            };
            const mine = avg(m.voices[vi]);
            const others = m.voices.filter((v, k) => k !== vi).map(avg).filter((x) => x != null);
            const voiceName = m.voices.length > 1 && mine != null && others.length ? (others.every((x) => mine > x) ? '上方聲部' : others.every((x) => mine < x) ? '下方聲部' : '') : '';
            const names = o.events.map(eventName);
            out.push({ label: l, order: a.mi * 1e6 + a.at, text: '方框 ' + l + '：' + partName + voiceName + span + '，' + (o.events.length === 1 ? '' : o.events.length + ' 個音：') + names.join('、') });
          }
          t += M.eventTicks(ev);
        });
        });
      });
      for (const l in open) out.push({ label: l, order: 1e12, text: '方框 ' + l + '：只有開始（"^[' + l + '"），找不到結束（"^' + l + ']"）' });
    });
    return out.sort((x, y) => x.order - y.order);
  }

  MB.examMarks = { describe };
})(typeof window !== 'undefined' ? window : globalThis);
