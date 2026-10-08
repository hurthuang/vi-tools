/*
 * 點字樂譜練習（學生版）：給初學者的點字樂譜編輯器。
 * 只有點字區：打完一個音就播放並念出音名與時值，Ctrl+Enter 播放，可存成 BRF、匯出 MusicXML。
 * 每一行都當作音樂（不寫曲名、標頭），時值一律讀成全、二分、四分、八分音符；
 * 分小節可以交給程式依拍號自動分，或自己打空方分小節（檢查每小節拍數）。
 * 聲音用瀏覽器內建合成（WebAudio），不用連網，網頁與桌面版離線都能用。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const B = MB.brf;
  const M = MB.model;
  const D = MB.describe;

  // ---------- 分析（不碰畫面，可以在 Node 測試） ----------
  const BEAT_NAME = (ticks) => {
    // 以四分音符為一拍念出長度：1 拍、半拍、1 拍半
    const q = M.TPW / 4;
    const whole = Math.floor(ticks / q);
    const half = ticks % q === q / 2;
    if (ticks % (q / 2)) return '一點點';
    if (!whole) return '半拍';
    return whole + ' 拍' + (half ? '半' : '');
  };

  function parseMeter(s) {
    const [num, den] = String(s || '4/4').split('/').map(Number);
    return { num: num || 4, den: den || 4, symbol: null };
  }

  /**
   * 依目前設定讀入點字。opts：{meter: '4/4', key: 0, tempo: 90, bars: 'auto'|'manual', title}
   * 回傳 {score, events: [{ev, mi, start, end}], measures: [{events, ticks, target, over, partial}]}
   */
  function analyse(text, opts) {
    const o = opts || {};
    const meter = parseMeter(o.meter);
    const key = { fifths: +o.key || 0, mode: 'major' };
    const r = MB.parseBraille(text, { musicOnly: true, largeOnly: true, meter, key });
    const score = r.score;
    score.title = o.title || '';
    score.tempo = { value: 4, dots: 0, bpm: +o.tempo || 90 };
    const part = score.parts[0];
    const target = M.meterTicks(meter);
    const all = [];
    part.measures.forEach((m) => (m.voices[0] || []).forEach((ev) => all.push(ev)));
    let groups = [];
    if (o.bars === 'manual') {
      // 自己分小節：照點字裡的空方
      groups = part.measures.map((m) => (m.voices[0] || []).slice()).filter((x) => x.length);
    } else {
      // 自動分小節：依拍號，一個小節滿了就換下一小節；跨過小節線的音留在原來的小節
      let cur = [];
      let t = 0;
      for (const ev of all) {
        cur.push(ev);
        t += M.eventTicks(ev);
        if (t >= target) {
          groups.push(cur);
          cur = [];
          t = 0;
        }
      }
      if (cur.length) groups.push(cur);
    }
    for (const ev of all) ev.measureRest = false; // 學生版的 ⠍ 就是全休止符
    const first = part.measures[0] || {};
    const measures = groups.map((evs, i) => {
      const ticks = evs.reduce((s, ev) => s + M.eventTicks(ev), 0);
      return { events: evs, ticks, target, over: ticks > target, partial: ticks < target };
    });
    part.measures = (groups.length ? groups : [[]]).map((evs, i, a) =>
      Object.assign({ voices: [evs], barline: i === a.length - 1 ? 'final' : 'single' }, i === 0 ? { key: first.key || key, meter: first.meter || meter } : {})
    );
    // 自動分小節後，臨時記號的有效範圍跟著新的小節重新計算
    M.resolveAlters(score);
    const events = [];
    measures.forEach((m, mi) => m.events.forEach((ev) => ev.src && ev.src.brl && events.push({ ev, mi, start: ev.src.brl[0], end: ev.src.brl[1] })));
    return { score, events, measures, warnings: r.warnings };
  }

  /** 一個音的念法：「Sol 四分音符」「升 Fa 八分音符」「四分休止符」。 */
  function noteText(ev, names) {
    const dur = D.durationName(ev);
    if (ev.kind === 'rest') return dur;
    const n = ev.notes[0];
    const name = D.pitchName(n, { solfege: names !== 'letter' });
    return name + ' ' + dur;
  }

  /** 一個小節的拍數檢查。 */
  function measureCheck(m) {
    if (m.ticks === m.target) return '拍數正確';
    if (m.over) return '多了 ' + BEAT_NAME(m.ticks - m.target);
    return '少了 ' + BEAT_NAME(m.target - m.ticks);
  }

  /** 一個小節的內容：「第 2 小節：Sol 四分音符、Mi 四分音符…」 */
  function measureText(a, mi, names) {
    const m = a.measures[mi];
    if (!m) return '';
    return '第 ' + (mi + 1) + ' 小節：' + m.events.map((ev) => noteText(ev, names)).join('、');
  }

  // 前置記號（音層記號、臨時記號）：打完時先念出名稱，等打完音符才發聲
  // 音符與休止符本身；附點是 ⠄（BRF 的 '）；指法 1–5 的點字（Par. 15）
  const NOTE_CELLS = new Set([].concat(...Object.values(MB.brailleSigns.NOTE), MB.brailleSigns.REST));
  const FINGER_CELLS = { A: '1', B: '2', L: '3', 1: '4', K: '5' };
  const PREFIX = { '@': '第 1 八度記號', '^': '第 2 八度記號', _: '第 3 八度記號', '"': '第 4 八度記號', '.': '第 5 八度記號', ';': '第 6 八度記號', ',': '第 7 八度記號', '%': '升記號', '<': '降記號', '*': '還原記號' };

  /**
   * 打字之後的回饋。caret：游標位置（剛打完的字元在它前面）。
   * 回傳 {say, event, error}：event 是剛打完的音（要播放）；error 表示打的不是音符。
   */
  function feedback(text, a, caret, o) {
    const opts = o || {};
    const prev = text[caret - 1];
    if (prev == null) return { say: '' };
    const c = B.toBrf(prev);
    const done = a.events.find((x) => x.end === caret);
    if (done) {
      // 加在音符後面的其他記號（例如點 1 是指法 1）：說出打了什麼，不重複念這個音
      if (!NOTE_CELLS.has(c) && c !== "'") {
        const n = done.ev.notes && done.ev.notes[0];
        if (n && FINGER_CELLS[c] && n.finger && n.finger.endsWith(FINGER_CELLS[c])) return { say: '指法 ' + FINGER_CELLS[c] + '（加在前一個音上）' };
        return { say: '點 ' + B.dotsOf(c) + '，加在前一個音上的記號', error: true };
      }
      let say = noteText(done.ev, opts.names);
      const m = a.measures[done.mi];
      const last = m.events[m.events.length - 1] === done.ev;
      if (opts.bars !== 'manual' && last && !m.partial) say += m.over ? '，超過小節線' : '，第 ' + (done.mi + 1) + ' 小節完成';
      return { say, event: done.ev };
    }
    if (c === ' ' || c === '\n') {
      if (opts.bars !== 'manual') return { say: '' };
      // 自己分小節：打空方時檢查剛結束的小節
      const before = a.events.filter((x) => x.end < caret).pop();
      if (!before) return { say: '' };
      const m = a.measures[before.mi];
      return { say: '第 ' + (before.mi + 1) + ' 小節，' + measureCheck(m), error: m.ticks !== m.target };
    }
    // 在某個音的中間（例如八度記號後面接著音符，游標在中間）
    if (a.events.some((x) => x.start < caret && caret < x.end)) return { say: '' };
    if (PREFIX[c]) {
      const dbl = caret >= 2 && B.toBrf(text[caret - 2]) === c && (c === '@' || c === ',');
      return { say: dbl ? (c === '@' ? '第 0 八度記號' : '第 8 八度記號') : PREFIX[c] };
    }
    return { say: '點 ' + B.dotsOf(c) + '，不是音符', error: true };
  }

  /** 游標所在的音：游標在音裡面或開頭就是它；在兩個音之間取前面的。 */
  function eventAt(a, caret) {
    let before = null;
    for (const x of a.events) {
      if (x.start <= caret && caret < x.end) return x;
      if (x.end <= caret) before = x;
    }
    return before || a.events[0] || null;
  }

  MB.student = { analyse, feedback, noteText, measureText, measureCheck, eventAt, parseMeter };
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = MB;
    return;
  }

  // ---------- 畫面 ----------
  const $ = (id) => document.getElementById(id);
  const ta = $('brl');
  const KEY = 'vi-music-student';
  const store = {
    get() {
      try {
        return JSON.parse(localStorage.getItem(KEY)) || {};
      } catch (e) {
        return {};
      }
    },
    set(v) {
      try {
        localStorage.setItem(KEY, JSON.stringify(v));
      } catch (e) {
        /* 瀏覽器不允許儲存時略過 */
      }
    },
  };
  const FIELDS = { 's-title': 'title', 's-meter': 'meter', 's-key': 'key', 's-tempo': 'tempo', 's-bars': 'bars', 's-names': 'names' };
  const CHECKS = { 's-echo': 'echo', 's-speak': 'speak', 's-tts': 'tts', 'six-key': 'sixKey', 's-staff': 'staff' };
  const saved = store.get();
  for (const [id, k] of Object.entries(FIELDS)) if (saved[k] != null) $(id).value = saved[k];
  for (const [id, k] of Object.entries(CHECKS)) if (saved[k] != null) $(id).checked = !!saved[k];
  ta.value = toCells(saved.text || '');
  function opts() {
    const o = {};
    for (const [id, k] of Object.entries(FIELDS)) o[k] = $(id).value;
    for (const [id, k] of Object.entries(CHECKS)) o[k] = $(id).checked;
    return o;
  }
  function save() {
    store.set(Object.assign(opts(), { text: ta.value }));
  }

  /** 點字顯示器打進來的 ASCII 點字、一般空白，換成 Unicode 點字與空方（一個字元換一個，游標位置不變）。 */
  function toCells(s) {
    return /[\x20-\x7e]/.test(s) ? B.toUnicode(B.toBrf(s), { blankCell: true }) : s;
  }

  let state = null;
  function refresh() {
    try {
      state = analyse(ta.value, opts());
    } catch (e) {
      console.error(e);
      state = null;
    }
    scheduleStaff();
    return state;
  }

  // ---------- 五線譜（給明眼老師、家長看；abcjs，桌面版有內附） ----------
  let staffTimer = null;
  let noteEls = []; // [{id, els}]
  function scheduleStaff() {
    clearTimeout(staffTimer);
    staffTimer = setTimeout(renderStaff, 150);
  }
  function renderStaff() {
    const paper = $('paper');
    $('paper').hidden = !$('s-staff').checked;
    noteEls = [];
    if (!$('s-staff').checked) return;
    if (!window.ABCJS) {
      paper.innerHTML = '<p class="hint" style="padding:12px">無法載入五線譜（需要網路連線）；打點字、播放不受影響。</p>';
      return;
    }
    if (!state || !state.events.length) {
      paper.innerHTML = '';
      return;
    }
    try {
      const out = MB.toAbc(state.score);
      paper.removeAttribute('style');
      const vis = ABCJS.renderAbc('paper', out.abc, {
        add_classes: true,
        responsive: 'resize',
        selectionColor: '#000000',
        paddingleft: 10,
        paddingright: 10,
        clickListener: (el) => {
          const hit = el && el.startChar != null && out.map.find((m) => m.start <= el.startChar && el.startChar < m.end);
          const x = hit && state.events.find((e) => e.ev.id === hit.id);
          if (!x) return;
          ta.focus();
          ta.setSelectionRange(x.start, x.start);
          markStaff();
          try {
            playEvent(x.ev, audio().currentTime + 0.01, 1.2);
          } catch (err) {
            /* 沒有聲音裝置 */
          }
          say('第 ' + (x.mi + 1) + ' 小節，' + noteText(x.ev, $('s-names').value));
        },
      })[0];
      (vis.lines || []).forEach((line) =>
        (line.staff || []).forEach((st) =>
          (st.voices || []).forEach((v) =>
            v.forEach((el) => {
              if (el.el_type !== 'note' || !el.abselem) return;
              const hit = out.map.find((m) => m.start <= el.startChar && el.startChar < m.end);
              if (hit) noteEls.push({ id: hit.id, els: el.abselem.elemset || [] });
            })
          )
        )
      );
      markStaff();
    } catch (e) {
      console.error(e);
      paper.textContent = '五線譜顯示失敗：' + e.message;
    }
  }
  /** 標示游標所在的音（播放時標示正在播放的音）。 */
  function markStaff(id) {
    const cur = id || (state && document.activeElement === ta ? (eventAt(state, ta.selectionStart) || {}).ev : null);
    const want = id || (cur && cur.id);
    for (const n of noteEls) n.els.forEach((el) => el && el.classList && el.classList.toggle('hl', n.id === want));
  }

  // ---------- 念出 ----------
  let sayTimer = null;
  function say(text) {
    $('status').textContent = text;
    if (!text) return;
    if ($('s-tts').checked && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW';
      const v = speechSynthesis.getVoices().find((x) => /zh[-_]TW/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
      return;
    }
    // 報讀軟體：等它念完剛打的字元再送出；內容相同時先清空，才會再念一次
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      const el = $('say');
      el.textContent = '';
      setTimeout(() => (el.textContent = text), 30);
    }, 150);
  }

  // ---------- 聲音（WebAudio 合成） ----------
  let ctx = null;
  const voices = [];
  function audio() {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, vol, type) {
    const c = audio();
    const gn = c.createGain();
    const end = start + dur;
    gn.gain.setValueAtTime(0.0001, start);
    gn.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    gn.gain.exponentialRampToValueAtTime(vol * 0.5, start + Math.min(0.25, dur));
    gn.gain.setValueAtTime(vol * 0.5, Math.max(start + 0.02, end - 0.06));
    gn.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
    gn.connect(c.destination);
    const oscs = [];
    // 三角波加一點高八度的正弦波，聽起來比較像樂器
    for (const [mul, v, t] of type ? [[1, 1, type]] : [[1, 1, 'triangle'], [2, 0.25, 'sine']]) {
      const o = c.createOscillator();
      o.type = t;
      o.frequency.value = freq * mul;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og).connect(gn);
      o.start(start);
      o.stop(end + 0.1);
      oscs.push(o);
    }
    voices.push(...oscs);
    oscs[0].onended = () => oscs.forEach((o) => voices.splice(voices.indexOf(o), 1));
  }
  const freqOf = (n) => 440 * Math.pow(2, (M.midiOf(n) - 69) / 12);
  const secPerTick = () => 60 / (+$('s-tempo').value || 90) / (M.TPW / 4);
  function playEvent(ev, at, maxSec) {
    const dur = Math.min(M.eventTicks(ev) * secPerTick(), maxSec || 99);
    if (ev.kind === 'note') for (const n of ev.notes) tone(freqOf(n), at, Math.max(0.08, dur - 0.03), 0.25);
    return dur;
  }
  function beep() {
    try {
      tone(160, audio().currentTime, 0.12, 0.15, 'square');
    } catch (e) {
      /* 沒有聲音裝置 */
    }
  }
  function silence() {
    for (const o of voices.slice()) {
      try {
        o.stop();
      } catch (e) {
        /* 已停止 */
      }
    }
    voices.length = 0;
  }

  // ---------- 播放 ----------
  let play = null; // {timers, last}
  function startPlay(fromStart) {
    stopPlay(true);
    const a = refresh();
    if (!a || !a.events.length) return say('還沒有音符可以播放');
    const first = fromStart ? a.events[0] : eventAt(a, ta.selectionStart);
    const list = a.events.slice(a.events.indexOf(first));
    const c = audio();
    let t = c.currentTime + 0.08;
    const t0 = t;
    play = { timers: [], last: list[0] };
    for (const x of list) {
      const at = t;
      play.timers.push(
        setTimeout(() => {
          if (!play) return;
          play.last = x;
          markStaff(x.ev.id);
        }, (at - t0) * 1000)
      );
      t += playEvent(x.ev, at);
    }
    play.timers.push(setTimeout(() => stopPlay(false, true), (t - t0) * 1000 + 200));
    $('btn-play').textContent = '■ 停止播放';
  }
  /** 停止：游標留在最後播放的音（再按 Ctrl+Enter 從這裡接著播）。 */
  function stopPlay(quiet, ended) {
    if (!play) return;
    play.timers.forEach(clearTimeout);
    silence();
    const last = play.last;
    play = null;
    $('btn-play').textContent = '▶ 播放';
    if (quiet) return;
    if (ended) return say('播放結束');
    if (last) ta.setSelectionRange(last.start, last.start);
    markStaff();
    say('停止' + (last ? '，在' + (state ? '第 ' + (last.mi + 1) + ' 小節，' : '') + noteText(last.ev, $('s-names').value) : ''));
  }

  // ---------- 輸入與回饋 ----------
  let lastInputType = '';
  ta.addEventListener('beforeinput', (e) => (lastInputType = e.inputType || ''));
  ta.addEventListener('input', () => {
    const pos = [ta.selectionStart, ta.selectionEnd];
    const v = toCells(ta.value);
    if (v !== ta.value) {
      ta.value = v;
      ta.setSelectionRange(pos[0], pos[1]);
    }
    save();
    stopPlay(true);
    const a = refresh();
    if (!a || /^delete/.test(lastInputType)) return;
    const f = feedback(ta.value, a, ta.selectionStart, opts());
    if (f.event && $('s-echo').checked) {
      try {
        playEvent(f.event, audio().currentTime + 0.01, 1.2);
      } catch (e) {
        /* 沒有聲音裝置 */
      }
    }
    if (f.error) beep();
    if ($('s-speak').checked || f.error) say(f.say);
    else $('status').textContent = f.say;
  });

  // 六點輸入：F D S J K L 同時按下，全部放開時打出一方
  const KEYS = { f: 1, d: 2, s: 3, j: 4, k: 5, l: 6 };
  let chord = 0;
  const down = new Set();
  function insert(text) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    lastInputType = 'insertText';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function gotoMeasure(dir) {
    const a = refresh();
    if (!a || !a.events.length) return;
    const cur = eventAt(a, ta.selectionStart);
    let mi = cur ? cur.mi : 0;
    // 往上：游標不在小節開頭時，先回到這一小節的開頭
    const startOf = (k) => a.measures[k] && a.measures[k].events[0].src.brl[0];
    if (dir < 0 && ta.selectionStart > startOf(mi)) dir = 0;
    mi = Math.max(0, Math.min(a.measures.length - 1, mi + dir));
    ta.setSelectionRange(startOf(mi), startOf(mi));
    say(measureText(a, mi, $('s-names').value));
  }
  ta.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (play && !e.shiftKey) stopPlay();
      else startPlay(e.shiftKey);
      return;
    }
    if (e.key === 'Escape' && play) {
      e.preventDefault();
      stopPlay();
      return;
    }
    if (e.altKey && !e.ctrlKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      gotoMeasure(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.altKey && !e.ctrlKey && (k === 'n' || k === 'm')) {
      e.preventDefault();
      const a = refresh();
      const x = a && eventAt(a, ta.selectionStart);
      if (!x) return say('還沒有音符');
      if (k === 'm') return say(measureText(a, x.mi, $('s-names').value));
      try {
        playEvent(x.ev, audio().currentTime + 0.01, 1.2);
      } catch (err) {
        /* 沒有聲音裝置 */
      }
      return say('第 ' + (x.mi + 1) + ' 小節，' + noteText(x.ev, $('s-names').value));
    }
    if (!$('six-key').checked || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Process') return say('六點輸入需要英文輸入法，請先切換輸入法');
    if (e.key === ' ') {
      e.preventDefault();
      insert('⠀');
      return;
    }
    if (KEYS[k]) {
      e.preventDefault();
      if (e.repeat) return;
      down.add(k);
      chord |= 1 << (KEYS[k] - 1);
    }
  });
  ta.addEventListener('keyup', (e) => {
    const k = (e.key || '').toLowerCase();
    if (!$('six-key').checked || !KEYS[k]) return;
    e.preventDefault();
    down.delete(k);
    if (down.size === 0 && chord) {
      insert(String.fromCodePoint(0x2800 + chord));
      chord = 0;
    }
  });
  // 移動游標時，五線譜標示游標所在的音
  for (const ev of ['keyup', 'click', 'focus']) ta.addEventListener(ev, () => !play && markStaff());
  ta.addEventListener('blur', () => {
    down.clear();
    chord = 0;
  });

  // ---------- 按鈕 ----------
  $('btn-play').addEventListener('click', () => (play ? stopPlay() : startPlay(false)));
  $('btn-play-all').addEventListener('click', () => startPlay(true));
  $('btn-stop').addEventListener('click', () => stopPlay());
  for (const id of [...Object.keys(FIELDS), ...Object.keys(CHECKS)]) $(id).addEventListener('change', () => (save(), refresh()));

  const baseName = () => ($('s-title').value.trim() || '點字樂譜').replace(/[\\/:*?"<>|]+/g, '_');
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }
  $('btn-new').addEventListener('click', () => {
    if (ta.value.trim() && !confirm('清除目前的內容，開新檔？')) return;
    stopPlay(true);
    ta.value = '';
    $('s-title').value = '';
    save();
    refresh();
    ta.focus();
    say('已開新檔');
  });
  $('btn-open').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async () => {
    const f = $('file').files[0];
    $('file').value = '';
    if (!f) return;
    stopPlay(true);
    ta.value = toCells((await f.text()).replace(/\r/g, ''));
    $('s-title').value = f.name.replace(/\.[^.]+$/, '');
    save();
    refresh();
    ta.focus();
    ta.setSelectionRange(0, 0);
    say('已開啟 ' + f.name);
  });
  $('btn-save').addEventListener('click', () => {
    const brf = B.toLowerBrf(B.toBrf(ta.value)).split('\n').join('\r\n') + '\r\n';
    download(new Blob([brf], { type: 'text/plain' }), baseName() + '.brf');
  });
  $('btn-xml').addEventListener('click', () => {
    const a = refresh();
    if (!a || !a.events.length) return say('還沒有音符可以匯出');
    download(new Blob([MB.toMusicXML(a.score)], { type: 'application/vnd.recordare.musicxml+xml' }), baseName() + '.musicxml');
  });
  $('btn-full').addEventListener('click', () => {
    const a = refresh();
    if (!a || !a.events.length) return say('還沒有音符');
    // 點字樂譜轉換器啟動時會讀回上次的 ABC
    try {
      localStorage.setItem('mbc:abc', JSON.stringify(MB.toAbc(a.score).abc));
    } catch (e) {
      /* 瀏覽器不允許儲存 */
    }
    location.href = 'index.html';
  });

  refresh();
})(typeof globalThis !== 'undefined' ? globalThis : this);
