/*
 * 四部和聲檢查頁（harmony.html）。規則在 harmony-check.js，樂理運算在 theory.js。
 */
(function () {
  'use strict';
  const MB = window.MB;
  const T = MB.theory;
  const H = MB.harmony;
  const B = MB.brf;
  const $ = (id) => document.getElementById(id);
  const STORE = 'vitools-harmony';

  // ---------- 調 ----------
  const keySel = $('s-key');
  for (const mode of ['major', 'minor']) {
    const gr = document.createElement('optgroup');
    gr.label = mode === 'major' ? '大調' : '小調';
    for (let f = -7; f <= 7; f++) {
      const k = T.keyFromFifths(f);
      const t = mode === 'major' ? k.major : k.minor;
      const o = document.createElement('option');
      o.value = mode + ':' + f;
      o.textContent = T.keyNameZh(t, mode) + '（' + (f ? Math.abs(f) + ' 個' + (f > 0 ? '升' : '降') + '記號' : '沒有升降') + '）';
      gr.appendChild(o);
    }
    keySel.appendChild(gr);
  }
  keySel.value = 'major:0';
  const currentKey = () => {
    const [mode, f] = keySel.value.split(':');
    const k = T.keyFromFifths(+f);
    return { tonic: mode === 'major' ? k.major : k.minor, mode };
  };

  const SAMPLE = [
    '// 範例：C 大調 I–IV–V–I64–V7–I。第 2 到第 3 個和弦故意寫錯（平行八度、平行五度）',
    'E5 G4 C4 C3 I',
    'F5 A4 C4 F3 IV',
    'G5 B4 D4 G3 V',
    'E5 C5 G4 G3 I64',
    'D5 B4 F4 G3 V7',
    'C5 C5 E4 C3 I',
    '',
  ].join('\n');

  const src = $('src');
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s) {
      src.value = s.text || '';
      if (s.key) keySel.value = s.key;
      for (const id of ['s-warn', 's-info', 's-analysis']) if (id in s) $(id).checked = s[id];
      if (s.brl) $('s-brl').value = s.brl;
    }
  } catch (e) {
    /* 設定壞掉就用預設 */
  }
  if (!src.value.trim()) src.value = SAMPLE;
  function save() {
    const s = { text: src.value, key: keySel.value, brl: $('s-brl').value };
    for (const id of ['s-warn', 's-info', 's-analysis']) s[id] = $(id).checked;
    localStorage.setItem(STORE, JSON.stringify(s));
  }

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
    gn.gain.exponentialRampToValueAtTime(vol, start + 0.02);
    gn.gain.exponentialRampToValueAtTime(vol * 0.6, start + 0.3);
    gn.gain.setValueAtTime(vol * 0.6, end - 0.06);
    gn.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
    gn.connect(c.destination);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    o.connect(gn);
    o.start(start);
    o.stop(end + 0.1);
    oscs.push(o);
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
  function playChords(chords) {
    stop();
    try {
      const sec = 60 / (+$('s-tempo').value || 60);
      let t = audio().currentTime + 0.05;
      for (const c of chords) {
        for (const n of c.notes) tone(T.midi(n), t, sec * 0.95, 0.12);
        t += sec;
      }
    } catch (e) {
      /* 沒有聲音裝置 */
    }
  }

  // ---------- 檢查 ----------
  let last = null;
  function run(focusResult) {
    save();
    const p = H.parseText(src.value);
    const key = currentKey();
    const list = $('issues');
    list.innerHTML = '';
    const add = (level, msg) => {
      const li = document.createElement('li');
      li.className = level;
      li.tabIndex = -1;
      li.textContent = { error: '錯誤：', warn: '注意：', info: '建議：' }[level] + msg;
      list.appendChild(li);
    };
    for (const e of p.errors) add('error', e.msg);
    if (!p.chords.length) {
      $('summary').textContent = p.errors.length ? '格式有錯，請修正。' : '還沒有寫和弦。';
      last = null;
      renderBraille(null);
      return;
    }
    const r = H.check(p.chords, key);
    last = { chords: p.chords, key, r };
    const showWarn = $('s-warn').checked;
    const showInfo = $('s-info').checked;
    let ne = p.errors.length;
    let nw = 0;
    let ni = 0;
    for (const x of r.issues) {
      if (x.level === 'error') ne++;
      if (x.level === 'warn') nw++;
      if (x.level === 'info') ni++;
      if (x.level === 'warn' && !showWarn) continue;
      if (x.level === 'info' && !showInfo) continue;
      // 標出原始的行號，方便回去改
      const lines = [p.chords[x.at].line].concat(x.to != null ? [p.chords[x.to].line] : []);
      add(x.level, x.msg + '（第 ' + lines.join('、') + ' 行）');
    }
    $('summary').textContent =
      p.chords.length + ' 個和弦：' + (ne || nw ? ne + ' 個錯誤、' + nw + ' 個注意' : '沒有發現錯誤') + (ni && showInfo ? '、' + ni + ' 個建議' : '') + '。';
    // 分析表
    const tb = $('analysis');
    tb.innerHTML = '';
    r.info.forEach((inf, i) => {
      const tr = document.createElement('tr');
      const c = p.chords[i];
      const name = inf.ch ? T.nameZh(inf.ch.root) + ' ' + inf.ch.name + '，' + inf.ch.inversionName : '（無法辨認）';
      const rn = inf.rn ? inf.rn.secondary || inf.rn.symbol : '';
      for (const v of [String(i + 1), c.notes.map((n) => T.nameEn(n, { octave: true })).join(' '), name, rn]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      if (rn) tr.lastChild.setAttribute('aria-label', T.speakRoman(rn));
      tb.appendChild(tr);
    });
    $('analysis-wrap').hidden = !$('s-analysis').checked;
    renderBraille(last);
    if (focusResult && list.firstChild) list.firstChild.focus();
  }

  let lastBrf = '';
  function renderBraille(st) {
    const el = $('brl');
    const paper = $('paper');
    el.textContent = '';
    paper.innerHTML = '';
    lastBrf = '';
    if (!st) return;
    try {
      const abc = H.toAbc(st.chords, st.key);
      const r = MB.parseAbc(abc, {});
      const b = MB.scoreBraille(r, { width: 40, title: false });
      lastBrf = b.brf;
      const brf = $('s-brl').value === 'brf';
      el.classList.toggle('brf', brf);
      el.textContent = brf ? B.toLowerBrf(b.brf) : B.toUnicode(b.brf);
      st.abc = abc;
      if (window.ABCJS) window.ABCJS.renderAbc(paper, abc, { responsive: 'resize' });
    } catch (e) {
      console.error(e);
      el.textContent = '（轉點字時發生錯誤）';
    }
  }

  // ---------- 事件 ----------
  $('btn-check').addEventListener('click', () => run(true));
  $('btn-sample').addEventListener('click', () => {
    src.value = SAMPLE;
    keySel.value = 'major:0';
    run(false);
    src.focus();
  });
  $('btn-play').addEventListener('click', () => {
    const p = H.parseText(src.value);
    playChords(p.chords);
  });
  $('btn-stop').addEventListener('click', stop);
  keySel.addEventListener('change', () => run(false));
  for (const id of ['s-warn', 's-info', 's-analysis', 's-brl']) $(id).addEventListener('change', () => run(false));
  src.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      run(true);
    } else if (e.key === 'Escape') stop();
    else if (e.altKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      const lineNo = src.value.slice(0, src.selectionStart).split('\n').length;
      const p = H.parseText(src.value);
      const c = p.chords.find((x) => x.line === lineNo);
      if (c) playChords([c]);
    }
  });
  $('btn-brf').addEventListener('click', () => {
    if (!lastBrf) return;
    const blob = new Blob([lastBrf.replace(/\n/g, '\r\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '四部和聲.brf';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('btn-open').addEventListener('click', () => {
    if (!last || !last.abc) return;
    try {
      localStorage.setItem('mbc:abc', JSON.stringify(last.abc));
    } catch (e) {
      /* 瀏覽器不允許儲存 */
    }
    location.href = 'index.html';
  });

  run(false);
})();
