/*
 * ABC → 內部模型。支援國中小常見的子集：
 * 單音、和弦、休止符、附點、三連音、連結線、圓滑線、反覆與房號、
 * 調號、拍號、速度、力度記號、常用奏法、多聲部（鋼琴雙手）與 & 重疊聲部。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const M = MB.model;

  const ACC = { '^': 'sharp', '^^': 'dsharp', _: 'flat', __: 'dflat', '=': 'natural' };
  const DYNAMICS = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff', 'sfz', 'sf', 'fp', 'fz', 'rfz'];
  const DECO_ARTIC = {
    staccato: 'staccato', '.': 'staccato',
    accent: 'accent', '>': 'accent', emphasis: 'accent', L: 'accent',
    tenuto: 'tenuto', arpeggio: 'arpeggio',
    fermata: 'fermata', H: 'fermata',
    staccatissimo: 'staccatissimo', wedge: 'staccatissimo',
  };
  const DECO_ORN = {
    trill: 'trill', T: 'trill', t: 'trill',
    // 愛爾蘭音樂的 roll（~）效果近似迴音，比照迴音處理
    '~': 'turn', roll: 'turn', irishroll: 'turn',
    mordent: 'mordent', lowermordent: 'mordent', M: 'mordent',
    uppermordent: 'uppermordent', pralltriller: 'uppermordent', P: 'uppermordent',
    turn: 'turn', invertedturn: 'invertedturn', turnx: 'turn', invertedturnx: 'invertedturn',
  };
  const DECO_NAV = {
    segno: 'segno', S: 'segno', coda: 'coda', O: 'coda', fine: 'fine', dacoda: 'toCoda',
    'D.C.': { type: 'DC', to: null }, dacapo: { type: 'DC', to: null },
    'D.C.alfine': { type: 'DC', to: 'fine' }, 'D.C.alcoda': { type: 'DC', to: 'coda' },
    'D.S.': { type: 'DS', to: null }, 'D.S.alfine': { type: 'DS', to: 'fine' }, 'D.S.alcoda': { type: 'DS', to: 'coda' },
  };
  /** 文字註記（如 "^Fine"、"^D.C. al Fine"）轉成反覆指示；不是則回傳 null。 */
  function navFromText(text) {
    const t = text.replace(/^[\^_<>@]/, '').trim();
    if (/^fine\.?$/i.test(t)) return 'fine';
    if (/^to\s*coda$/i.test(t)) return 'toCoda';
    if (/^coda\.?$/i.test(t)) return 'codaStart';
    if (/^segno$/i.test(t)) return 'segno';
    const m = /^(d\.?\s*c\.?|da\s*capo|d\.?\s*s\.?|dal\s*segno)(?:\s*al\s*(fine|coda))?\.?$/i.exec(t);
    if (m) return { type: /^(d\.?\s*c|da\s*capo)/i.test(m[1]) ? 'DC' : 'DS', to: m[2] ? m[2].toLowerCase() : null };
    return null;
  }
  const DECO_HAIRPIN = {
    '<(': ['start', 'cresc'], 'crescendo(': ['start', 'cresc'],
    '<)': ['end', 'cresc'], 'crescendo)': ['end', 'cresc'],
    '>(': ['start', 'dim'], 'diminuendo(': ['start', 'dim'],
    '>)': ['end', 'dim'], 'diminuendo)': ['end', 'dim'],
  };

  function parseFraction(s) {
    const m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(s);
    return m ? { num: +m[1], den: +m[2] } : null;
  }

  function parseMeter(s) {
    s = s.trim();
    if (s === 'C') return { num: 4, den: 4, symbol: 'C' };
    if (s === 'C|') return { num: 2, den: 2, symbol: 'C|' };
    const f = /^(\d+(?:\+\d+)*)\s*\/\s*(\d+)/.exec(s);
    if (f) {
      const num = f[1].split('+').reduce((a, b) => a + +b, 0);
      return { num, den: +f[2], symbol: null };
    }
    return null;
  }

  function parseKey(s) {
    const out = { key: null, clef: null };
    const cm = /clef\s*=\s*(\S+)/.exec(s);
    if (cm) out.clef = /bass|F/.test(cm[1]) ? 'bass' : 'treble';
    let body = s.replace(/\w+\s*=\s*\S+/g, '').trim();
    if (/^bass\b/.test(body)) { out.clef = 'bass'; body = body.slice(4).trim(); }
    if (/^treble\b/.test(body)) { out.clef = 'treble'; body = body.slice(6).trim(); }
    if (!body || /^none/i.test(body)) {
      out.key = body ? { fifths: 0, mode: 'major' } : null;
      return out;
    }
    const m = /^([A-Ga-g])([#b]?)\s*([A-Za-z]*)/.exec(body);
    if (!m) return out;
    const tonic = m[1].toUpperCase() + m[2];
    const modeStr = m[3].toLowerCase();
    let mode = 'major';
    if (modeStr === 'm' || modeStr.startsWith('min') || modeStr.startsWith('aeo')) mode = 'minor';
    else if (modeStr.startsWith('dor')) mode = 'dorian';
    else if (modeStr.startsWith('mix')) mode = 'mixolydian';
    else if (modeStr.startsWith('lyd')) mode = 'lydian';
    else if (modeStr.startsWith('phr')) mode = 'phrygian';
    else if (modeStr.startsWith('loc')) mode = 'locrian';
    const fifths = M.tonicFifths(tonic) + M.MODE_OFFSET[mode];
    out.key = { fifths: Math.max(-7, Math.min(7, fifths)), mode };
    return out;
  }

  function parseTempo(s) {
    const m = /(\d+)\s*\/\s*(\d+)\s*=\s*(\d+)/.exec(s);
    if (m) {
      const ticks = (M.TPW * +m[1]) / +m[2];
      const v = M.exactValue(ticks);
      if (v) return { value: v.value, dots: v.dots, bpm: +m[3] };
    }
    const n = /^\s*(\d+)\s*$/.exec(s);
    if (n) return { value: 4, dots: 0, bpm: +n[1] };
    return null;
  }

  function parseAbc(text) {
    const warnings = [];
    const warnOnce = new Set();
    function warn(msg, pos) {
      warnings.push({ msg, pos });
    }
    function warnKind(kind, msg, pos) {
      if (warnOnce.has(kind)) return;
      warnOnce.add(kind);
      warn(msg, pos);
    }

    const score = { title: '', composer: '', tempo: null, keyboard: false, parts: [] };
    let unitLen = null; // {num, den}
    let meter = null;
    let key = null;
    let headerClef = null;

    const voices = []; // {id, name, clef, measures, cur, ...}
    const userDeco = {}; // U: 自訂裝飾記號
    const voiceById = {};
    let curVoice = null;

    function getVoice(id) {
      if (!voiceById[id]) {
        const v = {
          id, clef: null, name: '', measures: [],
          cur: null, pendingTie: null, tuplet: null, broken: null,
          deco: newDeco(), slurPending: 0, lastEvent: null, overlay: 0,
          pendingKey: null, pendingMeter: null, pendingStartRepeat: false, pendingVolta: null,
        };
        voiceById[id] = v;
        voices.push(v);
      }
      return voiceById[id];
    }
    function newDeco() {
      return { dynamic: null, artic: [], hairpinStart: null, hairpinEnd: null, fingers: [], ornaments: [], pedal: [], nav: [], graces: null };
    }
    function ensureMeasure(v) {
      if (!v.cur) {
        v.cur = {
          voices: [[]], startRepeat: v.pendingStartRepeat, endRepeat: false,
          volta: v.pendingVolta, barline: 'single',
        };
        if (v.pendingKey) v.cur.key = v.pendingKey;
        if (v.pendingMeter) v.cur.meter = v.pendingMeter;
        v.pendingKey = v.pendingMeter = null;
        v.pendingStartRepeat = false;
        v.pendingVolta = null;
        for (const k of v.pendingNav || []) applyNav(v, v.cur, k, true);
        v.pendingNav = [];
      }
      return v.cur;
    }
    function curList(v) {
      const m = ensureMeasure(v);
      return m.voices[m.voices.length - 1];
    }
    function closeMeasure(v, bar) {
      const m = v.cur;
      if (!m || m.voices.every((vv) => vv.length === 0)) {
        // 空小節（例如行首的 |: 或連續的小節線）：只把旗標記到前後小節
        const last = v.measures[v.measures.length - 1];
        if (bar.endRepeat && last) last.endRepeat = true;
        if (bar.type !== 'single' && last) last.barline = bar.type;
        if (bar.startRepeat) {
          if (m) m.startRepeat = true;
          else v.pendingStartRepeat = true;
        }
        if (bar.volta) {
          if (m) m.volta = bar.volta;
          else v.pendingVolta = bar.volta;
        }
        return;
      }
      m.voices = m.voices.filter((vv) => vv.length);
      // 小節線前的反覆指示（如 "^Fine"|）屬於這個小節的結尾；Segno 屬於下一小節
      for (const k of v.deco.nav) {
        if (k === 'segno') (v.pendingNav = v.pendingNav || []).push(k);
        else applyNav(v, m, k, false);
      }
      v.deco.nav = [];
      m.endRepeat = !!bar.endRepeat;
      m.barline = bar.type;
      v.measures.push(m);
      v.cur = null;
      v.tuplet = null;
      if (bar.startRepeat) v.pendingStartRepeat = true;
      if (bar.volta) v.pendingVolta = bar.volta;
    }

    function unitTicks() {
      const u = unitLen || (meter && meter.num / meter.den < 0.75 ? { num: 1, den: 16 } : { num: 1, den: 8 });
      return (M.TPW * u.num) / u.den;
    }

    function applyField(name, value, v, pos) {
      switch (name) {
        case 'T':
          if (!score.title) score.title = value.trim();
          break;
        case 'C':
          if (!score.composer) score.composer = value.trim();
          break;
        case 'L': {
          const f = parseFraction(value);
          if (f) unitLen = f;
          break;
        }
        case 'M': {
          const mt = parseMeter(value);
          if (!mt) {
            warn('無法辨識的拍號「' + value.trim() + '」，改用 4/4', pos);
          }
          const nm = mt || { num: 4, den: 4, symbol: null };
          if (v) {
            if (!meter) meter = nm;
            setPending(v, 'meter', nm);
          } else meter = nm;
          break;
        }
        case 'U': {
          const um = /^\s*([~H-Wh-w])\s*=\s*[!+]?([^!+\s]+)[!+]?/.exec(value);
          if (um) userDeco[um[1]] = um[2];
          break;
        }
        case 'Q': {
          const t = parseTempo(value);
          if (t && !score.tempo) score.tempo = t;
          break;
        }
        case 'K': {
          const k = parseKey(value);
          if (!v) {
            key = k.key || { fifths: 0, mode: 'major' };
            if (k.clef) headerClef = k.clef;
          } else {
            // 還沒有任何音符時出現的 K:，視為整首曲子的調號
            if (k.key && voices.every((vv) => !vv.measures.length && (!vv.cur || vv.cur.voices.every((x) => !x.length)))) key = k.key;
            if (k.key) setPending(v, 'key', k.key);
            if (k.clef) v.clef = k.clef;
          }
          break;
        }
        case 'V': {
          const m = /^\s*(\S+)(.*)$/.exec(value);
          if (!m) break;
          const vv = getVoice(m[1]);
          const rest = m[2];
          const cm = /clef\s*=\s*(\S+)/.exec(rest);
          if (cm) vv.clef = /bass|F/.test(cm[1]) ? 'bass' : 'treble';
          else if (/\bbass\b/.test(rest)) vv.clef = 'bass';
          const nm = /(?:name|nm)\s*=\s*"([^"]*)"/.exec(rest);
          if (nm) vv.name = nm[1];
          curVoice = vv;
          break;
        }
        default:
          break;
      }
    }
    function setPending(v, what, val) {
      const m = v.cur;
      if (m && m.voices.every((vv) => vv.length === 0)) m[what] = val;
      else if (m) {
        if (what === 'key') v.pendingKey = val;
        else v.pendingMeter = val;
        warn('調號或拍號在小節中途改變，已移到下一小節', null);
      } else if (what === 'key') v.pendingKey = val;
      else v.pendingMeter = val;
    }

    // ---- 逐行處理 ----
    const lines = [];
    {
      let pos = 0;
      for (const line of text.split('\n')) {
        lines.push({ text: line.replace(/\r$/, ''), pos });
        pos += line.length + 1;
      }
    }

    let inHeader = true;
    for (const { text: raw, pos } of lines) {
      const line = raw;
      if (/^\s*%/.test(line)) continue; // 註解與 %% 指令
      if (inHeader) {
        const f = /^([A-Za-z]):(.*)$/.exec(line);
        if (f) {
          if (f[1] === 'V') {
            applyField('V', f[2], null, pos);
            continue;
          }
          applyField(f[1], f[2], null, pos);
          if (f[1] === 'K') {
            inHeader = false;
            curVoice = null;
            if (!meter) meter = { num: 4, den: 4, symbol: null };
          }
          continue;
        }
        if (!line.trim()) continue;
        // 寫錯的標頭欄位（例如 Q="..."）：略過，不要因此提早結束標頭
        if (/^[A-Za-z]\s*=/.test(line)) {
          warn('無法辨識的標頭欄位「' + line.trim() + '」（欄位應寫成 字母:內容），已略過', pos);
          continue;
        }
        // 沒有 K: 就直接開始音符：容許省略標頭
        inHeader = false;
        curVoice = null;
        if (!meter) meter = { num: 4, den: 4, symbol: null };
        if (!key) key = { fifths: 0, mode: 'major' };
      }
      const f = /^([A-Za-z]):(.*)$/.exec(line);
      if (f) {
        if ('wWsr'.includes(f[1])) {
          if (f[1] === 'w') warnKind('lyrics', '歌詞（w:）目前不轉換，已略過', pos);
          continue;
        }
        if (f[1] === 'V') {
          applyField('V', f[2], null, pos);
          continue;
        }
        if (!curVoice) curVoice = voices[0] || getVoice('1');
        applyField(f[1], f[2], curVoice, pos);
        continue;
      }
      if (!line.trim()) continue;
      if (!curVoice) curVoice = voices[0] || getVoice('1');
      parseMusic(line, pos);
    }

    function parseMusic(line, base) {
      const v0 = curVoice;
      let v = v0;
      let i = 0;
      const n = line.length;
      while (i < n) {
        const c = line[i];
        const rest = line.slice(i);
        const pos = base + i;
        let m;
        // 註解
        if (c === '%') break;
        // 空白、斷行記號（$、\）、間距 y、反引號
        if (c === ' ' || c === '\t' || c === '`' || c === '\\' || c === 'y' || c === '$') { i++; continue; }
        // 行內欄位 [K:..] [M:..] [V:..]
        if ((m = /^\[([A-Za-z]):([^\]]*)\]/.exec(rest))) {
          if (m[1] === 'V') {
            applyField('V', m[2], null, pos);
            v = curVoice;
          } else applyField(m[1], m[2], v, pos);
          i += m[0].length;
          continue;
        }
        // 小節線
        if ((m = /^(:+\|*:+|:*\[\|:*|:*\|\]|:*\|\|:*|:+\|\d*|\|+:+|\|\d+|\||\[\d+)/.exec(rest))) {
          const tok = m[0];
          const bar = { type: 'single', startRepeat: false, endRepeat: false, volta: null };
          if (/^:/.test(tok)) bar.endRepeat = true;
          if (/:$/.test(tok)) bar.startRepeat = true;
          if (/^:+\|*:+$/.test(tok)) { bar.endRepeat = true; bar.startRepeat = true; }
          if (/\|\]/.test(tok)) bar.type = 'final';
          else if (/\|\||\[\|/.test(tok)) bar.type = 'double';
          const vm = /(\d+)$/.exec(tok);
          if (vm) bar.volta = vm[1];
          i += tok.length;
          // 小節線後緊接的房號 [1、[2
          const after = /^\s*\[(\d+)/.exec(line.slice(i));
          if (after && !bar.volta) {
            bar.volta = after[1];
            i += after[0].length;
          }
          if (tok[0] === '[' && /^\[\d/.test(tok)) {
            // 單獨的 [1 視為房號（不結束小節）
            ensureMeasure(v).volta = bar.volta;
            continue;
          }
          closeMeasure(v, bar);
          continue;
        }
        // 重疊聲部
        if (c === '&') {
          const mm = ensureMeasure(v);
          mm.voices.push([]);
          i++;
          continue;
        }
        // 裝飾
        if ((m = /^!([^!]*)!/.exec(rest)) || (m = /^\+([^+]*)\+/.exec(rest))) {
          addDeco(v, m[1], pos);
          i += m[0].length;
          continue;
        }
        // U: 自訂的裝飾記號（例如 U:w=!wedge!，之後的 w 代表 wedge）；也容許寫在行中
        if ((m = /^U:\s*([~H-Wh-w])\s*=\s*[!+]?([^!+\s|]+)[!+]?/.exec(rest))) {
          userDeco[m[1]] = m[2];
          i += m[0].length;
          continue;
        }
        if ('.~HJLMOPSTtuv'.includes(c) || userDeco[c]) {
          addDeco(v, c, pos);
          i++;
          continue;
        }
        // 和弦名稱 / 註解文字
        if ((m = /^"([^"]*)"/.exec(rest))) {
          const nav = navFromText(m[1]);
          if (nav) v.deco.nav.push(nav);
          else warnKind('chordsym', '和弦名稱與文字註記（"..."）目前不轉換，已略過', pos);
          i += m[0].length;
          continue;
        }
        // 倚音
        if ((m = /^\{(\/?)([^}]*)\}/.exec(rest))) {
          const graces = [];
          const gre = /(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*)(\/*)(\d*)/g;
          let gm;
          while ((gm = gre.exec(m[2]))) {
            // 倚音長度以八分音符為基準（與一般 ABC 軟體的顯示一致）
            const t = (M.TPW / 8) * lengthMult(gm[4], gm[5], gm[6]);
            const ex = M.exactValue(Math.round(t)) || { value: 8, dots: 0 };
            const n = makeNote(gm[1], gm[2], gm[3], false);
            delete n.tie;
            graces.push({ notes: [n], value: ex.value, dots: ex.dots, slash: false });
          }
          // 單一倚音：有斜線為短倚音，沒有為長倚音；多個倚音一律視為短倚音
          if (graces.length === 1) graces[0].slash = !!m[1];
          if (graces.length) v.deco.graces = (v.deco.graces || []).concat(graces);
          i += m[0].length;
          continue;
        }
        // 連音 (3 (3:2:3
        if ((m = /^\((\d+)(?::(\d*))?(?::(\d*))?/.exec(rest))) {
          const p = +m[1];
          const compound = meter && meter.num % 3 === 0 && meter.num > 3;
          const defQ = { 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 }[p] || (compound ? 3 : 2);
          const q = m[2] ? +m[2] : defQ;
          const r = m[3] ? +m[3] : p;
          v.tuplet = { n: p, of: q, left: r, first: true };
          i += m[0].length;
          continue;
        }
        // 圓滑線
        if (c === '(') { v.slurPending++; i++; continue; }
        if (c === ')') {
          if (v.lastEvent) v.lastEvent.slurEnd = (v.lastEvent.slurEnd || 0) + 1;
          i++;
          continue;
        }
        // 附點節奏 > <
        if ((m = /^(>+|<+)/.exec(rest))) {
          const k = m[0].length;
          const f = 1 - Math.pow(0.5, k);
          if (v.lastEvent && v.lastEvent._ticks) {
            if (m[0][0] === '>') {
              v.broken = 1 - f;
              v.lastEvent._ticks = v.lastEvent._ticks * (1 + f);
            } else {
              v.broken = 1 + f;
              v.lastEvent._ticks = v.lastEvent._ticks * (1 - f);
            }
          }
          i += k;
          continue;
        }
        // 連結線
        if (c === '-') {
          if (v.lastEvent && v.lastEvent.kind === 'note') v.lastEvent.notes.forEach((nn) => (nn.tie = true));
          i++;
          continue;
        }
        // 多小節休止 Z4
        if ((m = /^[ZX](\d*)/.exec(rest))) {
          const count = m[1] ? +m[1] : 1;
          for (let k = 0; k < count; k++) {
            const ev = { id: M.newId(), kind: 'rest', measureRest: true, value: 1, dots: 0, notes: [], src: { abc: [pos, pos + m[0].length] } };
            curList(v).push(ev);
            if (k < count - 1) closeMeasure(v, { type: 'single' });
          }
          i += m[0].length;
          continue;
        }
        // 休止符
        if ((m = /^[zx](\d*)(\/*)(\d*)/.exec(rest))) {
          const ev = { id: M.newId(), kind: 'rest', notes: [], src: { abc: [pos, pos + m[0].length] } };
          ev._ticks = unitTicks() * lengthMult(m[1], m[2], m[3]);
          // 長度為 0 的隱形休止符（如 x0）只是排版用途，略過
          if (ev._ticks > 0) pushEvent(v, ev);
          i += m[0].length;
          continue;
        }
        // 和弦
        if (c === '[') {
          const close = line.indexOf(']', i);
          if (close < 0) { warn('和弦缺少右括號 ]', pos); i++; continue; }
          const inner = line.slice(i + 1, close);
          let j = close + 1;
          const lm = /^(\d*)(\/*)(\d*)/.exec(line.slice(j));
          j += lm[0].length;
          const notes = [];
          let firstMult = null;
          const nre = /!([^!]*)!|(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*)(\/*)(\d*)(-?)/g;
          let nm;
          let innerFingers = [];
          while ((nm = nre.exec(inner))) {
            if (nm[1] !== undefined) {
              // 和弦內個別音的指法，如 [!1!C!3!E!5!G]
              if (/^[0-5]$/.test(nm[1])) innerFingers.push(nm[1]);
              continue;
            }
            const note = makeNote(nm[2], nm[3], nm[4], nm[8] === '-');
            if (innerFingers.length) note.finger = innerFingers.join('');
            innerFingers = [];
            notes.push(note);
            if (firstMult === null) firstMult = lengthMult(nm[5], nm[6], nm[7]);
          }
          if (!notes.length) { i = j; continue; }
          const ev = { id: M.newId(), kind: 'note', notes, src: { abc: [pos, base + j] } };
          ev._ticks = unitTicks() * (firstMult || 1) * lengthMult(lm[1], lm[2], lm[3]);
          pushEvent(v, ev);
          i = j;
          continue;
        }
        // 音符
        if ((m = /^(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*)(\/*)(\d*)/.exec(rest))) {
          const ev = { id: M.newId(), kind: 'note', notes: [makeNote(m[1], m[2], m[3], false)], src: { abc: [pos, pos + m[0].length] } };
          ev._ticks = unitTicks() * lengthMult(m[4], m[5], m[6]);
          pushEvent(v, ev);
          i += m[0].length;
          continue;
        }
        warn('無法辨識的字元「' + c + '」', pos);
        i++;
      }
    }

    function lengthMult(num, slashes, den) {
      const a = num ? +num : 1;
      if (!slashes) return a;
      if (den) return a / +den;
      return a / Math.pow(2, slashes.length);
    }

    function makeNote(acc, letter, marks, tie) {
      let octave = letter === letter.toUpperCase() ? 4 : 5;
      for (const ch of marks) octave += ch === "'" ? 1 : -1;
      return { step: letter.toUpperCase(), octave, accidental: acc ? ACC[acc] : null, tie: !!tie };
    }

    function addDeco(v, name, pos) {
      if (userDeco[name] && userDeco[name] !== name) name = userDeco[name];
      if (DYNAMICS.includes(name)) { v.deco.dynamic = name; return; }
      if (/^[0-5]$/.test(name)) { v.deco.fingers.push(name); return; }
      if (DECO_ORN[name]) { v.deco.ornaments.push(DECO_ORN[name]); return; }
      if (name === 'ped') { v.deco.pedal.push('down'); return; }
      if (name === 'ped-up') { v.deco.pedal.push('up'); return; }
      if (DECO_NAV[name]) { v.deco.nav.push(DECO_NAV[name]); return; }
      if (DECO_ARTIC[name]) { v.deco.artic.push(DECO_ARTIC[name]); return; }
      if (DECO_HAIRPIN[name]) {
        const [what, kind] = DECO_HAIRPIN[name];
        if (what === 'start') v.deco.hairpinStart = kind;
        else {
          // ABC 的 )! 標在結束的音符之前；點字的終止號放在該音符之後
          v.deco.hairpinEnd = kind;
        }
        return;
      }
      warnKind('deco:' + name, '裝飾記號「' + name + '」目前不轉換，已略過', pos);
    }

    /** 套用反覆指示。atStart：出現在小節開頭（還沒有音符）。 */
    function applyNav(v, m, k, atStart) {
      if (k === 'segno') m.segno = true;
      else if (k === 'fine') m.fine = true;
      else if (k === 'toCoda') m.toCoda = true;
      else if (k === 'codaStart') m.codaStart = true;
      else if (k === 'coda') {
        // Coda 記號：第一次出現是「跳到 Coda」的位置，之後出現在小節開頭是 Coda 段落的開始
        const seen = v.measures.some((x) => x.toCoda || x.jump);
        if (seen && atStart) m.codaStart = true;
        else m.toCoda = true;
      } else if (typeof k === 'object') m.jump = { type: k.type, to: k.to };
    }

    function pushEvent(v, ev) {
      if (v.broken) {
        ev._ticks *= v.broken;
        v.broken = null;
      }
      if (v.tuplet) {
        ev.tuplet = { n: v.tuplet.n, of: v.tuplet.of, start: v.tuplet.first, end: v.tuplet.left === 1 };
        v.tuplet.first = false;
        v.tuplet.left--;
        if (v.tuplet.left <= 0) v.tuplet = null;
      }
      const d = v.deco;
      if (d.dynamic) ev.dynamic = d.dynamic;
      if (d.artic.length) ev.articulations = d.artic.slice();
      if (d.hairpinStart) ev.hairpinStart = d.hairpinStart;
      if (d.hairpinEnd) ev.hairpinEnd = d.hairpinEnd;
      if (d.ornaments.length) ev.ornaments = d.ornaments.slice();
      if (d.graces) ev.graces = d.graces;
      // 踏板：!ped-up!!ped! 在同一音 = 換踏板；!ped! = 踩下；!ped-up! = 此音後放開
      if (d.pedal.length) {
        const up = d.pedal.indexOf('up');
        const down = d.pedal.indexOf('down');
        if (up >= 0 && down > up) ev.pedalChange = true;
        else {
          if (down >= 0) ev.pedalDown = true;
          if (up >= 0) ev.pedalUp = true;
        }
      }
      // 指法：寫在和弦外的指法依和弦內音的書寫順序對應（!1!!3!!5![CEG] → C=1、E=3、G=5）；
      // 單音有兩個指法時視為換指（!4!!3!）
      if (d.fingers.length && ev.kind === 'note') {
        if (ev.notes.length === 1) ev.notes[0].finger = d.fingers.join('');
        else d.fingers.forEach((f, k) => ev.notes[k] && (ev.notes[k].finger = f));
      }
      const mm = ensureMeasure(v);
      for (const k of d.nav) applyNav(v, mm, k, mm.voices.every((x) => !x.length));
      v.deco = newDeco();
      if (v.slurPending) {
        ev.slurStart = v.slurPending;
        v.slurPending = 0;
      }
      curList(v).push(ev);
      v.lastEvent = ev;
    }

    // 收尾：未結束的小節
    for (const v of voices) if (v.cur) closeMeasure(v, { type: 'single' });
    if (!voices.length) getVoice('1');

    // 時值換算：ticks → 音符時值（無法表示者拆成連結音）
    for (const v of voices) {
      for (const m of v.measures) {
        m.voices = m.voices.map((list) => {
          const out = [];
          for (const ev of list) {
            if (ev.measureRest) { out.push(ev); continue; }
            const ticks = Math.round(ev._ticks);
            delete ev._ticks;
            const ex = M.exactValue(ticks);
            if (ex) {
              ev.value = ex.value;
              ev.dots = ex.dots;
              out.push(ev);
              continue;
            }
            const parts = !ev.tuplet && M.decomposeTicks(ticks);
            if (!parts) {
              warn('無法表示的時值，已改為四分音符', ev.src.abc[0]);
              ev.value = 4;
              ev.dots = 0;
              out.push(ev);
              continue;
            }
            parts.forEach((p, k) => {
              const e = k === 0 ? ev : M.cloneEvent(ev);
              if (k > 0) {
                e.src = { abc: ev.src.abc.slice() };
                delete e.dynamic;
                delete e.articulations;
                delete e.slurStart;
                delete e.hairpinStart;
              }
              e.value = p.value;
              e.dots = p.dots;
              if (e.kind === 'note' && k < parts.length - 1) e.notes.forEach((nn) => (nn.tie = true));
              if (k < parts.length - 1) {
                delete e.slurEnd;
                delete e.hairpinEnd;
              }
              out.push(e);
            });
          }
          return out;
        });
      }
    }

    // 組成 Score
    const used = voices.filter((v) => v.measures.length);
    if (!used.length) used.push(voices[0]);
    if (used.length > 2) warn('目前只轉換前兩個聲部（右手、左手），其餘聲部已略過', null);
    const chosen = used.slice(0, 2);
    score.keyboard = chosen.length === 2;
    const maxLen = Math.max(...chosen.map((v) => v.measures.length));
    chosen.forEach((v, idx) => {
      if (v.measures.length < maxLen) {
        if (v.measures.length) warn('聲部 ' + v.id + ' 的小節數較少，已補上全休止', null);
        while (v.measures.length < maxLen)
          v.measures.push({ voices: [[{ id: M.newId(), kind: 'rest', measureRest: true, value: 1, dots: 0, notes: [], src: {} }]], barline: 'single' });
      }
      if (!v.measures.length) v.measures.push({ voices: [[]], barline: 'single' });
      const first = v.measures[0];
      first.key = first.key || key || { fifths: 0, mode: 'major' };
      first.meter = first.meter || meter || { num: 4, den: 4, symbol: null };
      let clef = v.clef || (idx === 0 ? headerClef : null);
      if (!clef) clef = score.keyboard && idx === 1 ? 'bass' : 'treble';
      score.parts.push({
        id: v.id,
        name: v.name,
        hand: score.keyboard ? (idx === 0 ? 'R' : 'L') : null,
        clef,
        measures: v.measures,
      });
    });
    // 單獨一個休止符填滿整小節 → 整小節休止（點字一律寫全休止符，Par. 5.1）
    for (const p of score.parts) markMeasureRests(p);
    // 鍵盤：兩手的調號、拍號變更同步
    if (score.keyboard) {
      const [a, b] = score.parts;
      a.measures.forEach((m, i) => {
        const o = b.measures[i];
        if (m.key && !o.key) o.key = m.key;
        if (o.key && !m.key) m.key = o.key;
        if (m.meter && !o.meter) o.meter = m.meter;
        if (o.meter && !m.meter) m.meter = o.meter;
      });
    }
    M.markSplitMeasures(score);
    M.syncNav(score);
    M.resolveAlters(score);
    return { score, warnings };
  }

  function markMeasureRests(part) {
    part.measures.forEach((m, mi) => {
      if (m.voices.length !== 1 || m.voices[0].length !== 1) return;
      const r = m.voices[0][0];
      if (r.kind === 'rest' && !r.measureRest && !r.tuplet && M.eventTicks(r) === M.meterTicks(M.meterAt(part, mi))) {
        r.measureRest = true;
        r.value = 1;
        r.dots = 0;
      }
    });
  }

  MB.parseAbc = parseAbc;
  MB.markMeasureRests = markMeasureRests;
  MB.abcUtil = { parseMeter, parseKey, parseTempo };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
