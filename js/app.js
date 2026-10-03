/*
 * 網頁介面：ABC 與點字雙向即時轉換、五線譜預覽、播放、同步標示、語音報讀。
 */
(function () {
  'use strict';
  const MB = window.MB;
  const B = MB.brf;
  const $ = (id) => document.getElementById(id);
  const abcTA = $('abc');
  const brlTA = $('brl');

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('mbc:' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('mbc:' + k, JSON.stringify(v));
      } catch (e) {
        /* 瀏覽器不允許儲存時略過 */
      }
    },
  };

  const state = {
    score: null,
    infos: [], // [{id, ev, ctx, abc:[s,e], brl:[s,e], number, hand}]
    visual: null,
    noteEls: [],
    current: null,
    title: '',
    lastSource: 'abc',
  };

  // ---------- 編輯區（textarea + 標示背景層） ----------
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function Editor(ta) {
    this.ta = ta;
    this.back = ta.parentElement.querySelector('.backdrop');
    this.marks = [];
    ta.addEventListener('scroll', () => this.syncScroll());
    ta.addEventListener('input', () => {
      this.marks = [];
      this.render();
    });
  }
  Editor.prototype.setMarks = function (ranges) {
    this.marks = ranges.filter((r) => r && r.end > r.start);
    this.render();
  };
  Editor.prototype.render = function () {
    const text = this.ta.value;
    let html = '';
    let pos = 0;
    for (const r of this.marks.slice().sort((a, b) => a.start - b.start)) {
      if (r.start < pos || r.start > text.length) continue;
      html += esc(text.slice(pos, r.start)) + '<mark class="' + (r.cls || '') + '">' + esc(text.slice(r.start, r.end)) + '</mark>';
      pos = r.end;
    }
    this.back.innerHTML = html + esc(text.slice(pos)) + '\n\n';
    this.syncScroll();
  };
  Editor.prototype.syncScroll = function () {
    this.back.scrollTop = this.ta.scrollTop;
    this.back.scrollLeft = this.ta.scrollLeft;
  };
  /** 捲動到指定位置（不搶焦點）。 */
  Editor.prototype.reveal = function (start) {
    const ta = this.ta;
    const before = ta.value.slice(0, start);
    const lines = before.split('\n');
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const top = (lines.length - 1) * lh;
    if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - lh * 2) ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
    const cw = this.charWidth();
    const left = lines[lines.length - 1].length * cw;
    if (left < ta.scrollLeft || left > ta.scrollLeft + ta.clientWidth - cw * 4) ta.scrollLeft = Math.max(0, left - ta.clientWidth / 3);
    this.syncScroll();
  };
  Editor.prototype.charWidth = function () {
    const span = document.createElement('span');
    span.textContent = 'MMMMMMMMMM';
    this.back.appendChild(span);
    const w = span.getBoundingClientRect().width / 10;
    span.remove();
    return w || 10;
  };
  const abcEd = new Editor(abcTA);
  const brlEd = new Editor(brlTA);

  // ---------- 設定 ----------
  const settings = store.get('settings', {});
  function applySettingsToForm() {
    if (settings.width) $('opt-width').value = settings.width;
    if (settings.seg) $('opt-seg').value = settings.seg;
    if (settings.group === false) $('opt-group').checked = false;
    if (settings.dir) $('opt-dir').value = settings.dir;
    if (settings.slur) $('opt-slur').value = settings.slur;
    if (settings.lyrics) $('opt-lyrics').value = settings.lyrics;
    if (settings.lyricSpace) $('opt-lyric-space').value = settings.lyricSpace;
    // 舊版存的是勾選框（true/false）
    if (settings.repeat != null) $('opt-repeat').value = settings.repeat === false ? 'none' : settings.repeat === true ? 'all' : settings.repeat;
    if (settings.brlMode) $('brl-mode').value = settings.brlMode;
    if (settings.brfUpper) $('opt-brf-upper').checked = true;
    if (settings.sixKey === false) $('six-key').checked = false;
    if (settings.paperFit) $('paper-fit').value = settings.paperFit;
    if (settings.brlSize) $('brl-size').value = settings.brlSize;
    if (settings.autoSpeak) $('auto-speak').checked = true;
    if (settings.solfege) $('solfege').checked = true;
  }
  function saveSettings() {
    Object.assign(settings, {
      width: +$('opt-width').value,
      seg: +$('opt-seg').value,
      group: $('opt-group').checked,
      dir: $('opt-dir').value,
      slur: $('opt-slur').value,
      lyrics: $('opt-lyrics').value,
      lyricSpace: $('opt-lyric-space').value,
      repeat: $('opt-repeat').value,
      brlMode: $('brl-mode').value,
      brfUpper: $('opt-brf-upper').checked,
      paperFit: $('paper-fit').value,
      brlSize: $('brl-size').value,
      autoSpeak: $('auto-speak').checked,
      solfege: $('solfege').checked,
    });
    store.set('settings', settings);
  }
  function writeOpts() {
    return {
      width: Math.max(20, Math.min(80, +$('opt-width').value || 40)),
      segmentLines: Math.max(1, +$('opt-seg').value || 3),
      grouping: $('opt-group').checked,
      slurStyle: $('opt-slur').value,
      lyrics: $('opt-lyrics').value !== 'none',
      lyricSpacing: $('opt-lyric-space').value,
      measureRepeat: $('opt-repeat').value !== 'none',
      partRepeat: $('opt-repeat').value === 'all',
    };
  }
  // 點字顯示：unicode（Unicode 點字）、brf（ASCII）、brf-font（ASCII + SimBraille 字型，字元同 ASCII，只換字型）
  const brlMode = () => $('brl-mode').value;
  /** BRF 依設定用小寫（預設，與工具集其他工具相同）或大寫。 */
  const caseBrf = (brf) => ($('opt-brf-upper').checked ? brf : B.toLowerBrf(brf));
  /** 點字編輯區要顯示的文字。 */
  const showBrf = (brf) => (brlMode() === 'unicode' ? B.toUnicode(brf, { blankCell: true }) : caseBrf(brf));
  function applyBrlLook() {
    const ed = $('brl-editor');
    ed.classList.toggle('brf', brlMode() === 'brf');
    ed.classList.toggle('simbraille', brlMode() === 'brf-font');
    const size = +$('brl-size').value;
    const px = brlMode() === 'brf' ? Math.round(size * 0.75) : size;
    brlTA.style.fontSize = brlEd.back.style.fontSize = px + 'px';
    brlEd.render();
  }

  // ---------- 轉換 ----------
  let timer = null;
  function schedule(fn) {
    clearTimeout(timer);
    timer = setTimeout(fn, 350);
  }

  function setBraille(b) {
    brlTA.value = showBrf(b.brf);
    brlEd.marks = [];
    brlEd.render();
  }

  function convertFromAbc(extraWarnings) {
    const extra = Array.isArray(extraWarnings) ? extraWarnings : [];
    state.lastSource = 'abc';
    const text = abcTA.value;
    store.set('abc', text);
    if (!text.trim()) return clearAll('abc');
    let r;
    let b;
    try {
      r = MB.parseAbc(text);
      b = MB.toBraille(r.score, writeOpts());
    } catch (e) {
      console.error(e);
      return showMessages([{ msg: '轉換時發生錯誤：' + e.message, where: 'abc' }]);
    }
    setBraille(b);
    const infos = collect(r.score, (ev) => (ev.src && ev.src.abc) || null, null);
    const byId = new Map(infos.map((x) => [x.id, x]));
    for (const m of b.map) if (m.id && byId.has(m.id)) byId.get(m.id).brl = [m.start, m.end];
    finish(r.score, infos, extra.concat(tag(r.warnings, 'abc'), tag(b.warnings, 'brl')), text);
  }

  function convertFromBraille() {
    state.lastSource = 'brl';
    const text = brlTA.value;
    if (!text.trim()) return clearAll('brl');
    let r;
    let a;
    try {
      r = MB.parseBraille(text, { intervalDir: $('opt-dir').value || undefined });
      if (!r.score.title && state.title) r.score.title = state.title;
      keepLyrics(state.score, r.score, r.warnings);
      a = MB.toAbc(r.score);
    } catch (e) {
      console.error(e);
      return showMessages([{ msg: '轉換時發生錯誤：' + e.message, where: 'brl' }]);
    }
    abcTA.value = a.abc;
    abcEd.marks = [];
    abcEd.render();
    store.set('abc', a.abc);
    const infos = collect(r.score, null, (ev) => (ev.src && ev.src.brl) || null);
    const byId = new Map(infos.map((x) => [x.id, x]));
    for (const m of a.map) if (byId.has(m.id)) byId.get(m.id).abc = [m.start, m.end];
    finish(r.score, infos, tag(r.warnings, 'brl'), a.abc);
  }

  /**
   * 點字讀不回歌詞（只讀音樂）：修改點字時，把原本樂譜的歌詞依音符順序搬到新的樂譜。
   * 音符數目不同（例如增刪了音）就無法對應，提醒使用者到 ABC 補上。
   */
  function keepLyrics(oldScore, newScore, warnings) {
    if (!oldScore || newScore.keyboard) return;
    const notesOf = (sc) => {
      const out = [];
      if (sc.parts[0]) sc.parts[0].measures.forEach((m) => (m.voices[0] || []).forEach((ev) => ev.kind === 'note' && out.push(ev)));
      return out;
    };
    const oldNotes = notesOf(oldScore);
    if (!oldNotes.some((ev) => ev.lyrics)) return;
    const newNotes = notesOf(newScore);
    if (newNotes.some((ev) => ev.lyrics)) return;
    if (oldNotes.length !== newNotes.length) {
      warnings.push({ msg: '點字修改後音符數目不同（' + oldNotes.length + ' → ' + newNotes.length + '），歌詞無法自動對應，請到 ABC 的 w: 行補上' });
      return;
    }
    newNotes.forEach((ev, k) => oldNotes[k].lyrics && (ev.lyrics = JSON.parse(JSON.stringify(oldNotes[k].lyrics))));
    // 平行段（ABC 的分行）也沿用原本的
    const om = oldScore.parts[0].measures;
    if (om.length === newScore.parts[0].measures.length) newScore.parts[0].measures.forEach((m, i) => om[i].lineStart && (m.lineStart = true));
    // 讀入時「歌詞行已略過」的訊息不需要了
    for (let i = warnings.length - 1; i >= 0; i--) if (/^歌詞行（/.test(warnings[i].msg)) warnings.splice(i, 1);
  }

  function tag(ws, where) {
    return ws.map((w) => Object.assign({ where }, w));
  }

  function collect(score, abcOf, brlOf) {
    const numbers = MB.model.measureNumbers(score);
    const infos = [];
    MB.model.forEachEvent(score, (ev, c) => {
      infos.push({
        id: ev.id,
        ev,
        number: numbers[c.mi],
        hand: c.part.hand,
        abc: abcOf ? abcOf(ev) : null,
        brl: brlOf ? brlOf(ev) : null,
      });
    });
    return infos;
  }

  function clearAll(source) {
    stopPlay();
    if (source === 'abc') {
      brlTA.value = '';
      brlEd.setMarks([]);
    } else {
      abcTA.value = '';
      abcEd.setMarks([]);
    }
    state.infos = [];
    state.score = null;
    $('paper').innerHTML = '';
    state.visual = null;
    showMessages([]);
    $('abc-status').textContent = '';
    document.dispatchEvent(new Event('score-changed'));
  }

  function finish(score, infos, warnings, abcText) {
    stopPlay();
    state.score = score;
    state.infos = infos;
    state.current = null;
    state.title = score.title || state.title;
    const nMeasures = score.parts[0] ? score.parts[0].measures.length : 0;
    $('abc-status').textContent =
      (score.keyboard ? '鋼琴雙手' : '單聲部') + '・' + nMeasures + ' 小節';
    state.paperAbc = abcText;
    renderPaper(abcText);
    showMessages(warnings);
    $('cell-info').textContent = '';
    abcEd.setMarks([]);
    brlEd.setMarks([]);
    document.dispatchEvent(new Event('score-changed'));
  }

  // ---------- 五線譜 ----------
  /*
   * 只給五線譜顯示用的 ABC：D.C.、D.S.、Fine 等反覆文字改放在譜表下方。
   * abcjs 會把它們和指法、裝飾音一起放在譜表上方而疊在一起；印刷樂譜也常把這些文字放在下方。
   * D.C.、D.S.、To Coda 這類較長的文字從該小節第一個音開始寫，才不會穿過小節線；Fine 很短，留在原來的音。
   * 編輯區的 ABC 不變；toOrig() 把顯示用 ABC 的位置換回原本的位置（點音符、同步標示用）。
   */
  const NAV_TEXT = {
    'D.C.': 'D.C.', dacapo: 'D.C.', 'D.C.alfine': 'D.C. al Fine', 'D.C.alcoda': 'D.C. al Coda',
    'D.S.': 'D.S.', 'D.S.alfine': 'D.S. al Fine', 'D.S.alcoda': 'D.S. al Coda', fine: 'Fine', dacoda: 'To Coda',
  };
  const NAV_RE = /!(D\.C\.alfine|D\.C\.alcoda|D\.S\.alfine|D\.S\.alcoda|D\.C\.|D\.S\.|dacapo|dacoda|fine)!|"\^((?:D\.\s?[CS]\.|Da Capo|Dal Segno|Fine|To Coda)[^"]*)"/g;
  /** pos 所在小節第一個音的位置：往前找到小節線或行首，再跳過小節線剩下的部分、房號、空白、行內欄位。 */
  function measureStart(abc, pos) {
    let i = pos;
    while (i > 0 && abc[i - 1] !== '|' && abc[i - 1] !== '\n') i--;
    const skip = /^(?::+|\[?\d+(?:[,-]\d+)*|\s+|\[[A-Za-z]:[^\]\n]*\])*/.exec(abc.slice(i, pos));
    return i + skip[0].length;
  }
  function displayAbc(abc) {
    const edits = []; // { pos, del, ins }：在原本 ABC 的 pos 刪去 del 個字元、插入 ins
    abc.replace(NAV_RE, (m, deco, ann, off) => {
      const text = deco ? NAV_TEXT[deco] : ann;
      const label = '"_' + text + '"';
      const start = /^Fine/i.test(text) ? off : measureStart(abc, off);
      if (start === off) edits.push({ pos: off, del: m.length, ins: label });
      else edits.push({ pos: start, del: 0, ins: label }, { pos: off, del: m.length, ins: '' });
      return m;
    });
    edits.sort((a, b) => a.pos - b.pos || a.del - b.del);
    // 依序複製原文片段、插入新文字；segs 記下每段原文在兩邊的起點
    let text = '';
    let last = 0;
    const segs = [];
    for (const e of edits) {
      segs.push({ disp: text.length, orig: last, len: e.pos - last });
      text += abc.slice(last, e.pos) + e.ins;
      last = e.pos + e.del;
    }
    segs.push({ disp: text.length, orig: last, len: abc.length - last });
    text += abc.slice(last);
    const toOrig = (p) => {
      let s = segs[0];
      for (const g of segs) {
        if (g.disp > p) break;
        s = g;
      }
      return s.orig + Math.min(p - s.disp, s.len);
    };
    return { text, toOrig };
  }
  let paperMap = (p) => p;

  function renderPaper(abcText) {
    const paper = $('paper');
    if (!window.ABCJS) {
      paper.innerHTML = '<p class="hint" style="padding:12px">無法載入 abcjs（需要網路連線），五線譜預覽與播放暫時無法使用；轉換功能不受影響。</p>';
      return;
    }
    try {
      const disp = displayAbc(abcText);
      paperMap = disp.toOrig;
      // 「符合寬度」：縮放到預覽區寬度，不捲動；「原尺寸」：固定大小，預覽區有捲軸
      const fit = $('paper-fit').value === 'fit';
      paper.classList.toggle('scroll', !fit);
      paper.removeAttribute('style'); // abcjs「符合寬度」留下的 inline 樣式（overflow: hidden 等），換模式時要清掉
      const vis = ABCJS.renderAbc('paper', disp.text, {
        add_classes: true,
        responsive: fit ? 'resize' : undefined,
        clickListener: onScoreClick,
        paddingleft: 10,
        paddingright: 10,
      })[0];
      state.visual = vis;
      // abcjs 預設的英文標籤改成中文，報讀軟體才念得懂
      paper.querySelectorAll('svg').forEach((svg) => {
        const label = '五線譜' + (state.title ? '：' + state.title : '') + '（可用點字或 ABC 編輯區閱讀內容）';
        svg.setAttribute('aria-label', label);
        const t = svg.querySelector('title');
        if (t) t.textContent = label;
      });
      state.noteEls = [];
      (vis.lines || []).forEach((line) =>
        (line.staff || []).forEach((st) =>
          (st.voices || []).forEach((v) =>
            v.forEach((el) => {
              if (el.el_type === 'note' && el.abselem) state.noteEls.push({ start: paperMap(el.startChar), end: paperMap(el.endChar), els: el.abselem.elemset || [] });
            })
          )
        )
      );
    } catch (e) {
      console.error(e);
      paper.textContent = '五線譜顯示失敗：' + e.message;
    }
  }

  function overlap(a, s, e) {
    if (!a) return 0;
    return Math.min(a[1], e) - Math.max(a[0], s);
  }
  function findByAbc(s, e) {
    let best = null;
    let bo = 0;
    for (const inf of state.infos) {
      const o = overlap(inf.abc, s, e);
      if (o > bo) {
        bo = o;
        best = inf;
      }
    }
    return best;
  }
  function findByPos(which, pos) {
    let before = null;
    for (const inf of state.infos) {
      const r = inf[which];
      if (!r) continue;
      if (pos >= r[0] && pos <= r[1]) return inf;
      if (r[1] <= pos && (!before || before[which][1] < r[1])) before = inf;
    }
    return before;
  }

  function onScoreClick(abcelem) {
    if (!abcelem || abcelem.startChar == null) return;
    const inf = findByAbc(paperMap(abcelem.startChar), paperMap(abcelem.endChar));
    if (inf) select(inf, 'score');
  }

  function setScoreClass(cls, ranges) {
    document.querySelectorAll('#paper .' + cls).forEach((el) => el.classList.remove(cls));
    for (const n of state.noteEls) {
      if (ranges.some((r) => r && overlap(r, n.start, n.end) > 0)) n.els.forEach((el) => el && el.classList && el.classList.add(cls));
    }
  }

  function select(inf, from) {
    state.current = inf;
    setScoreClass('hl', [inf.abc]);
    if (inf.abc) abcEd.setMarks([{ start: inf.abc[0], end: inf.abc[1] }]);
    else abcEd.setMarks([]);
    if (inf.brl) brlEd.setMarks([{ start: inf.brl[0], end: inf.brl[1] }]);
    else brlEd.setMarks([]);
    if (from !== 'abc' && inf.abc) abcEd.reveal(inf.abc[0]);
    if (from !== 'brl' && inf.brl) brlEd.reveal(inf.brl[0]);
    const desc = describe(inf);
    let cells = '';
    if (inf.brl) {
      const s = B.toBrf(brlTA.value.slice(inf.brl[0], inf.brl[1]));
      cells = '　點字：' + B.toUnicode(s) + '（' + s.split('').map((c) => (c === ' ' ? '空方' : B.dotsOf(c))).join('・') + '）';
    }
    $('cell-info').textContent = desc + cells;
    if ($('auto-speak').checked && from !== 'play') speak(desc);
  }

  function describe(inf) {
    return MB.describe.describeEvent(inf.ev, { number: inf.number, hand: inf.hand }, { solfege: $('solfege').checked });
  }

  function onCaret(which) {
    const ta = which === 'abc' ? abcTA : brlTA;
    const inf = findByPos(which, ta.selectionStart);
    if (inf && inf !== state.current) select(inf, which);
    if (which === 'brl' && !inf) {
      const c = B.toBrf(ta.value.charAt(ta.selectionStart) || ' ');
      $('cell-info').textContent = c.trim() ? '點 ' + B.dotsOf(c) : '';
    }
  }

  // ---------- 訊息 ----------
  function showMessages(ws) {
    const ul = $('messages');
    // 內容沒變就不重畫，避免每打一個字報讀軟體就重念一次訊息
    const key = JSON.stringify(ws.map((w) => [w.where, w.msg, w.pos]));
    if (ul.dataset.key === key) return;
    ul.dataset.key = key;
    ul.innerHTML = '';
    if (!ws.length) {
      const li = document.createElement('li');
      li.className = 'ok';
      li.textContent = '轉換完成，沒有問題。';
      ul.appendChild(li);
      return;
    }
    for (const w of ws) {
      const li = document.createElement('li');
      li.className = 'warn';
      li.textContent = ({ abc: '［ABC］', brl: '［點字］', xml: '［MusicXML］' }[w.where] || '') + w.msg;
      if (typeof w.pos === 'number') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '跳到該處';
        btn.addEventListener('click', () => {
          const ta = w.where === 'abc' ? abcTA : brlTA;
          ta.focus();
          ta.setSelectionRange(w.pos, w.pos + 1);
          (w.where === 'abc' ? abcEd : brlEd).reveal(w.pos);
        });
        li.appendChild(btn);
      }
      ul.appendChild(li);
    }
  }

  // ---------- 播放 ----------
  const SOUNDFONT_URL = 'https://cdn.jsdelivr.net/gh/paulrosen/midi-js-soundfonts@cbd6b6f6d1af89ebfb69402860741288f08ff8b7/abcjs/';
  let synth = null;
  let timing = null;
  let audioCtx = null;
  function playerStatus(t) {
    $('player-status').textContent = t || '';
  }
  /**
   * 依演奏順序展開的 ABC（反覆、房號、D.C.、D.S.、Fine、Coda 都照實際順序展開），
   * 以隱藏的五線譜產生播放資料；map 記錄每個音在展開 ABC 中的位置與原本的事件 id。
   */
  function performance() {
    if (!state.score) return null;
    if (state.perf && state.perf.score === state.score) return state.perf;
    const out = MB.toAbc(MB.model.performanceScore(state.score));
    let holder = document.getElementById('perf-paper');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'perf-paper';
      holder.setAttribute('aria-hidden', 'true');
      holder.style.cssText = 'position:absolute;left:-20000px;top:0;width:1000px;visibility:hidden';
      document.body.appendChild(holder);
    }
    const vis = ABCJS.renderAbc(holder, out.abc, {})[0];
    state.perf = { score: state.score, abc: out.abc, map: out.map, visual: vis };
    return state.perf;
  }
  /** 展開 ABC 的字元位置 → 原本的事件。 */
  function infoFromPerf(start, end) {
    const perf = state.perf;
    if (!perf) return null;
    let best = null;
    let bo = 0;
    for (const m of perf.map) {
      const o = Math.min(m.end, end) - Math.max(m.start, start);
      if (o > bo) {
        bo = o;
        best = m.id;
      }
    }
    return best ? state.infos.find((x) => x.id === best) : null;
  }

  async function play() {
    if (!window.ABCJS || !state.visual) return playerStatus('沒有可播放的樂譜。');
    if (!ABCJS.synth.supportsAudio()) return playerStatus('這個瀏覽器不支援音訊播放。');
    stopPlay();
    const warp = +$('speed').value / 100;
    const perf = performance();
    const vis = perf ? perf.visual : state.visual;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      await audioCtx.resume();
      playerStatus('載入音色中…');
      synth = new ABCJS.synth.CreateSynth();
      await synth.init({
        audioContext: audioCtx,
        visualObj: vis,
        millisecondsPerMeasure: vis.millisecondsPerMeasure() / warp,
        // 鋼琴音色固定用 jsDelivr 上指定版本的檔案（內容與 abcjs 預設的 paulrosen.github.io 相同），
        // 視障輔助工具集桌面版會把這個網址改給內附的檔案，離線也能播放
        options: { program: 0, soundFontUrl: SOUNDFONT_URL },
      });
      await synth.prime();
      timing = new ABCJS.TimingCallbacks(vis, {
        qpm: vis.getBpm() * warp,
        eventCallback: onPlayEvent,
      });
      synth.start();
      timing.start();
      playerStatus('播放中');
      $('btn-play').textContent = '▶ 重新播放';
    } catch (e) {
      console.error(e);
      playerStatus('無法播放：' + (e && e.message ? e.message : '載入音色失敗（需要網路連線）'));
    }
  }
  function onPlayEvent(ev) {
    if (!ev) {
      stopPlay();
      playerStatus('播放結束');
      return 'continue';
    }
    const starts = ev.startCharArray || [];
    const ends = ev.endCharArray || [];
    const hits = [];
    starts.forEach((s, k) => {
      const inf = infoFromPerf(s, ends[k]);
      if (inf) hits.push(inf);
    });
    // 在原本的五線譜上標示（播放用的是展開後的隱藏樂譜）
    setScoreClass('playing', hits.map((h) => h.abc));
    brlEd.setMarks(hits.filter((h) => h.brl).map((h) => ({ start: h.brl[0], end: h.brl[1], cls: 'play' })));
    abcEd.setMarks(hits.filter((h) => h.abc).map((h) => ({ start: h.abc[0], end: h.abc[1], cls: 'play' })));
    if (hits[0] && hits[0].brl) brlEd.reveal(hits[0].brl[0]);
    return undefined;
  }
  function stopPlay() {
    if (synth) {
      try {
        synth.stop();
      } catch (e) {
        /* 已停止 */
      }
    }
    if (timing) timing.stop();
    synth = null;
    timing = null;
    document.querySelectorAll('#paper .playing').forEach((el) => el.classList.remove('playing'));
    $('btn-play').textContent = '▶ 播放';
  }

  // ---------- 語音 ----------
  function speak(text) {
    if (!('speechSynthesis' in window)) return playerStatus('這個瀏覽器不支援語音朗讀。');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => /zh[-_]TW/i.test(x.lang)) || voices.find((x) => /^zh/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  // ---------- 六點輸入 ----------
  const KEYS = { f: 1, d: 2, s: 3, j: 4, k: 5, l: 6 };
  let chord = 0;
  const down = new Set();
  function insertText(ta, text) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  brlTA.addEventListener('keydown', (e) => {
    if (!$('six-key').checked || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = (e.key || '').toLowerCase();
    if (e.key === 'Process') {
      $('cell-info').textContent = '六點輸入需要英文輸入法，請先切換輸入法。';
      return;
    }
    if (e.key === ' ' && brlMode() === 'unicode') {
      e.preventDefault();
      insertText(brlTA, '⠀');
      return;
    }
    if (KEYS[k]) {
      e.preventDefault();
      if (e.repeat) return;
      down.add(k);
      chord |= 1 << (KEYS[k] - 1);
    }
  });
  brlTA.addEventListener('keyup', (e) => {
    if (!$('six-key').checked) return;
    const k = (e.key || '').toLowerCase();
    if (!KEYS[k]) return;
    e.preventDefault();
    down.delete(k);
    if (down.size === 0 && chord) {
      const ch = String.fromCodePoint(0x2800 + chord);
      insertText(brlTA, showBrf(B.toBrf(ch)));
      chord = 0;
    }
  });

  // ---------- 檔案 ----------
  function baseName() {
    return (state.title || 'music').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'music';
  }
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
  $('btn-save-abc').addEventListener('click', () => download(new Blob([abcTA.value], { type: 'text/plain;charset=utf-8' }), baseName() + '.abc'));
  $('btn-save-brf').addEventListener('click', () => {
    const brf = caseBrf(B.toBrf(brlTA.value)).split('\n').join('\r\n') + '\r\n';
    download(new Blob([brf], { type: 'text/plain' }), baseName() + '.brf');
  });
  $('btn-save-midi').addEventListener('click', () => {
    if (!window.ABCJS) return playerStatus('需要網路連線載入 abcjs 才能匯出 MIDI。');
    try {
      // 依演奏順序展開（反覆、D.C.、D.S. 等）後再匯出
      const perf = performance();
      const midi = ABCJS.synth.getMidiFile(perf ? perf.abc : abcTA.value, { midiOutputType: 'binary' });
      const data = Array.isArray(midi) ? midi[0] : midi;
      download(new Blob([data], { type: 'audio/midi' }), baseName() + '.mid');
    } catch (e) {
      console.error(e);
      playerStatus('MIDI 匯出失敗：' + e.message);
    }
  });
  $('btn-save-xml').addEventListener('click', () => {
    if (!state.score) return playerStatus('沒有可匯出的樂譜。');
    const score = Object.assign({}, state.score, { title: state.title || state.score.title });
    const xml = MB.toMusicXML(score);
    download(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }), baseName() + '.musicxml');
  });

  /** 取得可獨立使用的五線譜 SVG 文字。 */
  function scoreSvgText() {
    const svg = document.querySelector('#paper svg');
    if (!svg) return null;
    const c = svg.cloneNode(true);
    c.querySelectorAll('.hl, .playing').forEach((el) => el.classList.remove('hl', 'playing'));
    const vb = (c.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const r = svg.getBoundingClientRect();
    const w = vb.length === 4 && vb[2] ? vb[2] : r.width;
    const h = vb.length === 4 && vb[3] ? vb[3] : r.height;
    if (!c.getAttribute('viewBox')) c.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    c.setAttribute('width', Math.round(w));
    c.setAttribute('height', Math.round(h));
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    c.setAttribute('style', 'color:#000;background:#fff');
    c.removeAttribute('class');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', vb.length === 4 ? vb[0] : 0);
    bg.setAttribute('y', vb.length === 4 ? vb[1] : 0);
    bg.setAttribute('width', w);
    bg.setAttribute('height', h);
    bg.setAttribute('fill', '#ffffff');
    c.insertBefore(bg, c.firstChild);
    return { text: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(c), w, h };
  }
  $('btn-save-svg').addEventListener('click', () => {
    const s = scoreSvgText();
    if (!s) return playerStatus('沒有可匯出的五線譜。');
    download(new Blob([s.text], { type: 'image/svg+xml' }), baseName() + '.svg');
  });
  $('btn-save-png').addEventListener('click', () => {
    const s = scoreSvgText();
    if (!s) return playerStatus('沒有可匯出的五線譜。');
    const scale = 2;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([s.text], { type: 'image/svg+xml' }));
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(s.w * scale);
      cv.height = Math.round(s.h * scale);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((blob) => download(blob, baseName() + '.png'), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      playerStatus('PNG 匯出失敗。');
    };
    img.src = url;
  });
  $('btn-print').addEventListener('click', () => {
    if (!document.querySelector('#paper svg')) return playerStatus('沒有可列印的五線譜。');
    const oldTitle = document.title;
    document.title = baseName();
    document.body.classList.add('print-score');
    const done = () => {
      document.body.classList.remove('print-score');
      document.title = oldTitle;
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  });

  /** 匯入目前保留的 MusicXML 的第 partIndex 個聲部；有多個聲部時顯示聲部選單。 */
  function importMusicXML(partIndex) {
    const { text, name } = state.xml;
    const r = MB.parseMusicXML(text, { part: partIndex });
    stopPlay();
    state.title = r.score.title || name.replace(/\.[^.]+$/, '');
    r.score.title = state.title;
    abcTA.value = MB.toAbc(r.score).abc;
    $('sample').value = '';
    const sel = $('part-select');
    sel.innerHTML = '';
    r.parts.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.index;
      o.textContent = p.name.replace(/\s+/g, ' ') + (p.staves >= 2 ? '（鋼琴雙手）' : '');
      sel.appendChild(o);
    });
    sel.value = String(r.partIndex);
    $('part-wrap').hidden = r.parts.length < 2;
    // 多聲部的提示改由選單呈現，不再列在轉換訊息
    convertFromAbc(tag(r.warnings.filter((w) => !/個聲部，目前轉換/.test(w.msg)), 'xml'));
  }
  $('part-select').addEventListener('change', () => {
    if (state.xml) importMusicXML(+$('part-select').value);
  });
  // 改成編輯其他內容時，聲部選單不再適用
  for (const id of ['sample']) $(id).addEventListener('change', () => ($('part-wrap').hidden = true));

  $('btn-open').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    e.target.value = '';
    if (/\.(musicxml|xml|mxl)$/i.test(f.name)) {
      try {
        const xmlText = await MB.readMusicXMLBytes(await f.arrayBuffer());
        state.xml = { text: xmlText, name: f.name };
        importMusicXML(0);
      } catch (err) {
        console.error(err);
        showMessages([{ msg: '無法讀取 MusicXML：' + err.message, where: 'xml' }]);
      }
      return;
    }
    const text = await f.text();
    if (/\.abc$/i.test(f.name)) {
      abcTA.value = text.replace(/\r/g, '');
      convertFromAbc();
    } else {
      const brf = B.toBrf(text.replace(/\f/g, '\n'));
      brlTA.value = showBrf(brf);
      state.title = f.name.replace(/\.[^.]+$/, '');
      convertFromBraille();
    }
  });

  // ---------- 事件繫結 ----------
  abcTA.addEventListener('input', () => {
    $('sample').value = '';
    schedule(convertFromAbc);
  });
  brlTA.addEventListener('input', () => {
    $('sample').value = '';
    schedule(convertFromBraille);
  });
  for (const ev of ['click', 'keyup', 'select']) {
    abcTA.addEventListener(ev, () => onCaret('abc'));
    brlTA.addEventListener(ev, () => onCaret('brl'));
  }
  // 換顯示方式或大小寫：同一份點字重新顯示（每個字元一對一，游標與標示位置不變）
  for (const id of ['brl-mode', 'opt-brf-upper'])
    $(id).addEventListener('change', () => {
      const pos = [brlTA.selectionStart, brlTA.selectionEnd];
      brlTA.value = showBrf(B.toBrf(brlTA.value));
      brlTA.setSelectionRange(pos[0], pos[1]);
      applyBrlLook();
      saveSettings();
    });
  $('brl-size').addEventListener('change', () => {
    applyBrlLook();
    saveSettings();
  });
  for (const id of ['opt-width', 'opt-seg', 'opt-group', 'opt-dir', 'opt-slur', 'opt-repeat', 'opt-lyrics', 'opt-lyric-space']) {
    $(id).addEventListener('change', () => {
      saveSettings();
      if (id === 'opt-dir' || state.lastSource === 'brl') convertFromBraille();
      else convertFromAbc();
    });
  }
  for (const id of ['auto-speak', 'solfege']) $(id).addEventListener('change', saveSettings);
  // 六點輸入預設開啟；使用者關掉後記住（工具集的浮動面板另外記，見下方）
  $('six-key').addEventListener('change', () => {
    settings.sixKey = $('six-key').checked;
    saveSettings();
  });
  $('paper-fit').addEventListener('change', () => {
    saveSettings();
    if (state.paperAbc != null) {
      renderPaper(state.paperAbc);
      if (state.current) setScoreClass('hl', [state.current.abc]);
    }
  });
  $('btn-play').addEventListener('click', play);
  $('btn-stop').addEventListener('click', () => {
    stopPlay();
    playerStatus('已停止');
  });
  $('speed').addEventListener('input', () => {
    $('speed-out').textContent = $('speed').value + '%';
    $('speed').setAttribute('aria-valuetext', $('speed').value + '%');
  });
  $('btn-speak').addEventListener('click', () => {
    if (state.current) speak(describe(state.current));
    else speak('請先在樂譜或編輯區選擇一個音符');
  });

  const sel = $('sample');
  MB.samples.forEach((s, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = s.name;
    sel.appendChild(o);
  });
  const custom = document.createElement('option');
  custom.value = '';
  custom.textContent = '（我的內容）';
  sel.insertBefore(custom, sel.firstChild);
  sel.addEventListener('change', () => {
    if (sel.value === '') return;
    stopPlay();
    abcTA.value = MB.samples[+sel.value].abc;
    state.title = '';
    convertFromAbc();
  });

  // ---------- 視障輔助工具集的共用元件（放在 vi-tools 裡才有） ----------
  if (typeof window.initBraillePanel === 'function') {
    // 改用工具集統一的六點輸入面板（六點鍵盤 + 點陣點選，Ctrl+B 切換），取代本頁的勾選框
    const lab = $('six-key').closest('label');
    $('six-key').checked = false;
    lab.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'brl-panel-btn';
    btn.className = 'btn brlp-trigger';
    btn.textContent = '⠿ 點字輸入';
    btn.title = '六點鍵盤（F D S J K L）與點陣輸入，在點字編輯區按 Ctrl+B 切換六點鍵盤';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    lab.after(btn);
    new MutationObserver(() => {
      const on = btn.classList.contains('kbd-on');
      if (settings.sixKey !== on) {
        settings.sixKey = on;
        saveSettings();
      }
    }).observe(btn, { attributes: true, attributeFilter: ['class'] });
    window.initBraillePanel({
      triggerId: 'brl-panel-btn',
      targetId: 'brl',
      startEnabled: settings.sixKey !== false, // 六點鍵盤預設開啟
      // 依顯示方式插入 Unicode 點字或 BRF；空方在 Unicode 模式用 U+2800
      insertFn: (bits) => {
        const ch = String.fromCodePoint(0x2800 + bits);
        insertText(brlTA, showBrf(B.toBrf(ch)));
        brlTA.focus();
      },
    });
  }
  if (typeof window.createSpeechBlock === 'function') {
    // 「🔊 全曲報讀」：每小節（鋼琴每手）一行，點一行從那裡念；可存報讀檔，桌面版可匯出音檔
    window.createSpeechBlock($('player-status'), {
      id: 'score-speech',
      title: '全曲報讀',
      getText: () => (state.score ? MB.describe.describeScore(state.score, { solfege: $('solfege').checked }) : ''),
      watch: (update) => {
        document.addEventListener('score-changed', update);
        $('solfege').addEventListener('change', update);
      },
      fileName: () => baseName() + '-報讀',
    });
  }

  // SimBraille 字型只在視障輔助工具集裡有（根目錄的 SIMBRL.TTF）；載不到就不提供這個顯示方式
  function hideFontOption() {
    const opt = $('brl-mode').querySelector('option[value="brf-font"]');
    opt.hidden = opt.disabled = true;
    if (brlMode() === 'brf-font') {
      $('brl-mode').value = 'brf';
      applyBrlLook();
    }
  }
  if (document.fonts && document.fonts.load) document.fonts.load("16px 'SimBraille'").then((f) => f.length || hideFontOption(), hideFontOption);
  else hideFontOption();

  // 國語點字表（中文歌詞用）：放在視障輔助工具集裡才有；載入後若目前的樂譜有歌詞就重新轉換
  if (MB.zhBraille)
    MB.zhBraille.loadFromSite('../').then((ok) => {
      if (ok && state.lastSource !== 'brl' && state.score && state.score.parts.some((p) => p.measures.some((m) => m.voices.some((v) => v.some((ev) => ev.lyrics))))) convertFromAbc();
    });

  // ---------- 啟動 ----------
  applySettingsToForm();
  applyBrlLook();
  const saved = store.get('abc', null);
  if (saved && saved.trim()) {
    abcTA.value = saved;
    sel.value = '';
  } else {
    abcTA.value = MB.samples[0].abc;
    sel.value = '0';
  }
  convertFromAbc();
})();
