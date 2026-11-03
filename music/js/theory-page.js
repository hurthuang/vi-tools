/*
 * 樂理練習頁（theory.html）：出題、作答、解說、播放、點字譜例。
 * 出題邏輯在 theory-quiz.js，樂理運算在 theory.js。
 */
(function () {
  'use strict';
  const MB = window.MB;
  const T = MB.theory;
  const Q = MB.theoryQuiz;
  const B = MB.brf;
  const $ = (id) => document.getElementById(id);
  const STORE = 'vitools-theory-settings';

  // ---------- 設定 ----------
  const typeBox = $('types');
  for (const [code, t] of Object.entries(Q.TYPES)) {
    const l = document.createElement('label');
    l.innerHTML = '<input type="checkbox" value="' + code + '" checked> ' + t.name;
    typeBox.appendChild(l);
  }
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (s.types) for (const cb of typeBox.querySelectorAll('input')) cb.checked = s.types.includes(cb.value);
      for (const id of ['s-level', 's-count', 's-brl']) if (s[id]) $(id).value = s[id];
      for (const id of ['s-text', 's-auto', 's-staff']) if (id in s) $(id).checked = s[id];
    } catch (e) {
      /* 設定壞掉就用預設 */
    }
  }
  function saveSettings() {
    const s = { types: selectedTypes() };
    for (const id of ['s-level', 's-count', 's-brl']) s[id] = $(id).value;
    for (const id of ['s-text', 's-auto', 's-staff']) s[id] = $(id).checked;
    localStorage.setItem(STORE, JSON.stringify(s));
  }
  const selectedTypes = () => [...typeBox.querySelectorAll('input:checked')].map((x) => x.value);
  loadSettings();

  // ---------- 聲音 ----------
  let ctx = null;
  const oscs = [];
  function audio() {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(midi, start, dur, vol) {
    const c = audio();
    const gn = c.createGain();
    const end = start + dur;
    gn.gain.setValueAtTime(0.0001, start);
    gn.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    gn.gain.exponentialRampToValueAtTime(vol * 0.5, start + 0.25);
    gn.gain.setValueAtTime(vol * 0.5, end - 0.06);
    gn.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
    gn.connect(c.destination);
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    for (const [mul, v, t] of [[1, 1, 'triangle'], [2, 0.25, 'sine']]) {
      const o = c.createOscillator();
      o.type = t;
      o.frequency.value = f * mul;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og).connect(gn);
      o.start(start);
      o.stop(end + 0.1);
      oscs.push(o);
    }
  }
  function stop() {
    for (const o of oscs.splice(0)) {
      try {
        o.stop();
      } catch (e) {
        /* 已停止 */
      }
    }
  }
  function play(groups) {
    if (!groups || !groups.length) return;
    stop();
    try {
      let t = audio().currentTime + 0.05;
      groups.forEach((gr, k) => {
        const chord = gr.length > 1;
        const dur = chord && (k === 0 || k === groups.length - 1) ? 1.4 : 0.7;
        for (const n of gr) tone(T.midi(n), t, dur, chord ? 0.18 : 0.25);
        t += dur + 0.05;
      });
    } catch (e) {
      /* 沒有聲音裝置 */
    }
  }

  // ---------- 譜例 ----------
  /** 題目的點字：拿掉拍號和小節號（題目只有音，不分小節）。 */
  function questionBraille(q) {
    if (!q.abc) return '';
    try {
      const r = MB.parseAbc(q.abc, {});
      const b = MB.toBraille(r.score, { width: 40, title: false });
      const lines = b.brf.replace(/\n+$/, '').split('\n');
      const head = lines[0].trim().replace(/#[A-J]+[0-9]+$/i, '').trim();
      const body = lines.slice(1).map((l) => l.replace(/^#[A-J]+ /i, '').trim());
      if (q.keySigOnly) return head;
      return body.join('\n');
    } catch (e) {
      console.error(e);
      return '';
    }
  }
  function showBraille(brf) {
    const mode = $('s-brl').value;
    const el = $('brl');
    $('brl-wrap').hidden = mode === 'off' || !brf;
    el.classList.toggle('brf', mode === 'brf');
    el.textContent = mode === 'brf' ? B.toLowerBrf(brf) : B.toUnicode(brf);
    // 報讀軟體：Unicode 點字交給點字顯示器；念出來的說明放在標籤
    el.setAttribute('aria-label', '譜例點字：' + (mode === 'brf' ? B.toLowerBrf(brf) : B.toUnicode(brf)));
  }
  function showStaff(q) {
    const paper = $('paper');
    paper.innerHTML = '';
    paper.hidden = !$('s-staff').checked || !q.abc || !window.ABCJS;
    if (paper.hidden) return;
    try {
      window.ABCJS.renderAbc(paper, q.abc, { responsive: 'resize', staffwidth: 420, paddingtop: 0, paddingbottom: 0 });
    } catch (e) {
      paper.hidden = true;
    }
  }

  // ---------- 作答 ----------
  const state = { n: 0, right: 0, wrong: [], q: null, answered: false, done: false };

  // 題目文字裡括號內的音名：關掉「寫出音名」時拿掉
  const promptText = (q) => ($('s-text').checked || !q.abc ? q.prompt : q.prompt.replace(/（[^（）]*）$/, ''));
  const optLabel = (q, o) => (q.speakOptions ? T.speakRoman(o) : o);

  function newQuestion() {
    const types = selectedTypes();
    if (!types.length) {
      $('feedback').textContent = '請先在「題型與設定」勾選至少一種題型。';
      return;
    }
    const total = +$('s-count').value;
    if (total && state.n >= total) return finish();
    let q;
    try {
      q = Q.make(types, +$('s-level').value);
    } catch (e) {
      console.error(e);
      q = Q.make(types, 1);
    }
    state.q = q;
    state.answered = false;
    state.n++;
    $('h-q').textContent = '第 ' + state.n + ' 題' + (total ? '（共 ' + total + ' 題）' : '');
    $('prompt').textContent = promptText(q);
    showBraille(questionBraille(q));
    showStaff(q);
    $('btn-play').hidden = !q.play.length;
    const box = $('opts');
    box.innerHTML = '';
    q.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = i + 1 + '. ' + o;
      if (q.speakOptions) b.setAttribute('aria-label', i + 1 + '. ' + optLabel(q, o));
      b.setAttribute('aria-keyshortcuts', String(i + 1));
      b.addEventListener('click', () => answer(i));
      box.appendChild(b);
    });
    $('feedback').textContent = '';
    updateScore();
    if ($('s-auto').checked) play(q.play);
    $('h-q').setAttribute('tabindex', '-1');
    $('h-q').focus();
  }

  function answer(i) {
    const q = state.q;
    if (!q || state.answered) return;
    state.answered = true;
    const ok = i === q.answer;
    if (ok) state.right++;
    else state.wrong.push({ n: state.n, q, chose: i });
    const btns = $('opts').querySelectorAll('button');
    btns[q.answer].classList.add('right');
    if (!ok) btns[i].classList.add('wrong');
    btns.forEach((b) => b.setAttribute('aria-disabled', 'true'));
    const right = q.options[q.answer];
    $('feedback').textContent = (ok ? '答對了。' : '答錯了，正確答案是 ' + (q.answer + 1) + '. ' + optLabel(q, right) + '。') + q.explain;
    updateScore();
    $('btn-next').focus();
  }

  function updateScore() {
    const done = state.answered ? state.n : state.n - 1;
    $('score').textContent = done ? '答對 ' + state.right + ' / ' + done + ' 題' : '';
  }

  function finish() {
    state.done = true;
    const total = state.n;
    $('h-q').textContent = '這一回結束';
    $('prompt').textContent = '答對 ' + state.right + ' / ' + total + ' 題。' + (state.wrong.length ? '答錯的題目列在下面。' : '全部答對！');
    $('brl-wrap').hidden = true;
    $('paper').hidden = true;
    $('opts').innerHTML = '';
    $('btn-play').hidden = true;
    $('feedback').textContent = '';
    const list = $('review');
    list.innerHTML = '';
    for (const w of state.wrong) {
      const li = document.createElement('li');
      li.textContent = '第 ' + w.n + ' 題：' + w.q.prompt + ' 你選 ' + optLabel(w.q, w.q.options[w.chose]) + '，正確是 ' + optLabel(w.q, w.q.options[w.q.answer]) + '。' + w.q.explain;
      list.appendChild(li);
    }
    $('review-pane').hidden = !state.wrong.length;
    $('btn-next').textContent = '再練一回（N）';
    $('h-q').focus();
  }

  function restart() {
    Object.assign(state, { n: 0, right: 0, wrong: [], q: null, answered: false, done: false });
    $('review-pane').hidden = true;
    $('btn-next').textContent = '下一題（N）';
    newQuestion();
  }

  // ---------- 事件 ----------
  $('btn-next').addEventListener('click', () => (state.done ? restart() : newQuestion()));
  $('btn-restart').addEventListener('click', restart);
  $('btn-play').addEventListener('click', () => state.q && play(state.q.play));
  $('btn-copy').addEventListener('click', () => {
    const text = $('prompt').textContent + '\n' + [...$('review').children].map((li, k) => k + 1 + '. ' + li.textContent).join('\n');
    navigator.clipboard.writeText(text).then(() => ($('feedback').textContent = '已複製紀錄。'));
  });
  $('settings').addEventListener('change', () => {
    saveSettings();
    if (state.q && !state.done) {
      $('prompt').textContent = promptText(state.q);
      showBraille(questionBraille(state.q));
      showStaff(state.q);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (/^[1-4]$/.test(e.key) && state.q && !state.done) {
      e.preventDefault();
      answer(+e.key - 1);
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      $('btn-next').click();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (state.q) play(state.q.play);
    } else if (e.key === 'Escape') stop();
  });

  // 第一題不自動播放（瀏覽器要使用者先操作才能出聲）
  const auto = $('s-auto').checked;
  $('s-auto').checked = false;
  newQuestion();
  $('s-auto').checked = auto;
  $('h-q').blur();
})();
