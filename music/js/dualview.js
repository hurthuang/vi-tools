/*
 * 雙視對照：以點字為主，每一方點字固定寬度，墨字印在對應的點字上方。
 * 給協助全盲生的明眼教學者看：音符上方標唱名（或音名、簡譜），小節之間畫小節線，
 * 八分音符、十六分音符在名稱下方畫底線（同一拍連在一起），歌詞每個字印在它的點字上方。
 * 分行和點字輸出完全相同（toBraille 的 layout），螢幕上看到的就是點字紙上的樣子。
 */
(function (g) {
  'use strict';
  const MB = (g.MB = g.MB || {});
  const B = MB.brf;
  const M = MB.model;
  const HALF_TO_FULL = { ',': '，', '.': '。', '!': '！', '?': '？', ';': '；', ':': '：' };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 每個事件：所在小節、聲部、在小節中的起點，以及調號（名稱用）與拍的分組（底線用）。 */
  function eventIndex(score) {
    const out = new Map();
    for (const part of score.parts) {
      let fifths = 0;
      part.measures.forEach((m, mi) => {
        if (m.key) fifths = m.key.fifths || 0;
        const meter = M.meterAt(part, mi);
        // 複拍子（6/8、9/8、12/8）一拍是附點四分音符；其他以分母為一拍
        const beat = meter.den === 8 && meter.num % 3 === 0 && meter.num > 3 ? (3 * M.TPW) / 8 : M.TPW / meter.den;
        m.voices.forEach((v, vi) => {
          let t = 0;
          for (const ev of v) {
            out.set(ev.id, { ev, part, mi, vi, fifths, group: part.id + ':' + mi + ':' + vi + ':' + Math.floor(t / beat) });
            t += ev.measureRest ? 0 : M.eventTicks(ev);
          }
        });
      });
    }
    return out;
  }

  /** 時值底線數：八分音符 1 條、十六分以下 2 條。整小節休止不畫。 */
  function underlines(ev) {
    if (ev.measureRest) return 0;
    return ev.value >= 16 ? 2 : ev.value === 8 ? 1 : 0;
  }

  /**
   * 畫出雙視對照。res：toBraille 的結果（要有 layout）；opts.names：'solfa' | 'letter' | 'jianpu' | 'none'；
   * opts.cell：一方 BRF 字元 → 顯示的文字（預設 Unicode 點字）。
   * 回傳 { highlight(id), playing(id) }。點音符或歌詞時呼叫 opts.onPick(id)。
   */
  function render(container, res, score, opts) {
    const o = opts || {};
    const idx = eventIndex(score);
    const marks = res.noteMarks || new Map();
    const names = o.names || 'solfa';
    const nameOf = (id) => {
      const x = idx.get(id);
      if (!x) return '';
      if (x.ev.kind === 'rest') return names === 'jianpu' ? '0' : '休';
      return MB.annotate.nameOf(x.ev, names, x.fifths, marks.get(id));
    };
    const lyricOf = (id) => {
      const x = idx.get(id);
      const l = x && x.ev.lyrics && x.ev.lyrics[0];
      if (!l || !l.text) return '';
      return /[㐀-鿿豈-﫿]/.test(l.text) ? l.text.replace(/[,.!?;:]/g, (c) => HALF_TO_FULL[c]) : l.text;
    };
    const lastMeasure = score.parts[0] ? score.parts[0].measures.length - 1 : -1;

    const rows = [];
    res.layout.forEach((line, li) => {
      const text = line.text;
      const labels = []; // {start, end, lines: [..], id, u, gapRight, cls}
      line.labels.forEach((l) => labels.push({ start: l.start, end: l.end, lines: [l.text], cls: 'dv-text' }));

      // 同一段點字對應的事件（小節重複記號、連續休止會對應好幾個）
      const ranges = new Map();
      for (const s of line.spans) {
        if (!s.id) continue;
        const key = s.start + ':' + s.end;
        if (!ranges.has(key)) ranges.set(key, { start: s.start, end: s.end, ids: [], measures: new Set() });
        const r = ranges.get(key);
        r.ids.push(s.id);
        r.measures.add(s.measure);
      }
      const list = [...ranges.values()].sort((a, b) => a.start - b.start);
      if (line.kind === 'lyric') {
        for (const r of list) {
          const t = lyricOf(r.ids[0]);
          if (t) labels.push({ start: r.start, end: r.end, lines: [t], id: r.ids[0], cls: 'dv-lyric' });
        }
      } else if (line.kind === 'music' && names !== 'none') {
        list.forEach((r, k) => {
          let lines;
          let u = 0;
          if (r.ids.length > 1) {
            const evs = r.ids.map((id) => idx.get(id)).filter(Boolean);
            if (evs.every((x) => x.ev.measureRest)) lines = ['休×' + evs.length];
            else lines = ['%' + (r.measures.size > 1 ? '×' + r.measures.size : '')]; // 小節重複記號
          } else {
            const x = idx.get(r.ids[0]);
            lines = nameOf(r.ids[0]).split('/').filter(Boolean);
            u = x ? underlines(x.ev) : 0;
          }
          // 底線在拍與拍之間斷開
          const next = list[k + 1];
          const gx = idx.get(r.ids[0]);
          const gn = next && idx.get(next.ids[0]);
          const gapRight = !next || next.start !== r.end || !gn || !gx || gn.group !== gx.group || !underlines(gn.ev);
          if (lines.length) labels.push({ start: r.start, end: r.end, lines, id: r.ids[0], ids: r.ids, u, gapRight, cls: 'dv-note' });
        });
      }

      // 小節線：兩個小節之間的空方；一行最後一個小節（不是全曲最後一小節）畫在行尾
      const bars = [];
      if (line.kind === 'music') {
        const cm = new Array(text.length).fill(null);
        for (const s of line.spans) if (s.measure != null) for (let i = s.start; i < s.end; i++) cm[i] = s.measure;
        const prevM = (i) => {
          for (let j = i - 1; j >= 0; j--) if (text[j] !== ' ') return cm[j];
          return null;
        };
        for (let i = 0; i < text.length; i++) {
          if (text[i] !== ' ' || cm[i] != null) continue;
          const a = prevM(i);
          let j = i;
          while (j < text.length && text[j] === ' ') j++;
          const b = j < text.length ? cm[j] : null;
          if (a != null && b != null && a !== b) bars.push(i + 0.5);
          i = j - 1;
        }
        const last = prevM(text.length);
        if (last != null && last !== lastMeasure && text.length) bars.push(text.length + 0.3);
      }

      const stack = labels.reduce((n, l) => Math.max(n, l.lines.length), 0);
      rows.push({ li, line, text, labels, bars, stack });
    });

    const html = rows
      .map((r) => {
        const cells = [...r.text]
          .map((c, i) => '<span class="dv-cell" data-i="' + i + '">' + esc(o.cell ? o.cell(c) : c === ' ' ? '⠀' : B.toUnicode(c)) + '</span>')
          .join('');
        const labs = r.labels
          .map((l) => {
            const cls = [l.cls, l.u === 1 ? 'u1' : l.u === 2 ? 'u2' : '', l.u && l.gapRight ? 'gap' : ''].filter(Boolean).join(' ');
            const style = 'left:calc(var(--cw)*' + l.start + ');width:calc(var(--cw)*' + (l.end - l.start) + ')';
            const id = l.id ? ' data-id="' + esc(l.id) + '"' : '';
            const ids = l.ids && l.ids.length > 1 ? ' data-ids="' + esc(l.ids.join(' ')) + '"' : '';
            return '<span class="' + cls + '" style="' + style + '"' + id + ids + '>' + l.lines.map((t) => '<span>' + esc(t) + '</span>').join('') + '</span>';
          })
          .join('');
        const bars = r.bars.map((x) => '<span class="dv-bar" style="left:calc(var(--cw)*' + x + ')"></span>').join('');
        const top = r.labels.length ? '<div class="dv-top" style="--stack:' + Math.max(1, r.stack) + '">' + labs + '</div>' : '<div class="dv-top dv-empty"></div>';
        return '<div class="dv-line dv-' + r.line.kind + '" data-li="' + r.li + '">' + top + '<div class="dv-brl">' + cells + '</div>' + bars + '</div>';
      })
      .join('');
    container.innerHTML = html;

    // 點一下：音符或歌詞 → 該音；其他點字方 → 涵蓋它的音（音樂行優先）
    container.onclick = (e) => {
      const lab = e.target.closest('[data-id]');
      let id = lab && lab.dataset.id;
      if (!id) {
        const cell = e.target.closest('.dv-cell');
        const row = cell && cell.closest('.dv-line');
        if (cell && row) {
          const line = res.layout[+row.dataset.li];
          const i = +cell.dataset.i;
          const s = line.spans.find((x) => x.id && x.start <= i && i < x.end);
          id = s && s.id;
        }
      }
      if (id && o.onPick) o.onPick(id);
    };

    // 標示：音符名稱、歌詞與其點字方
    const mark = (cls, id) => {
      container.querySelectorAll('.' + cls).forEach((el) => el.classList.remove(cls));
      if (!id) return null;
      let first = null;
      container.querySelectorAll('.dv-line').forEach((row) => {
        const line = res.layout[+row.dataset.li];
        const cells = row.querySelectorAll('.dv-cell');
        for (const s of line.spans) {
          if (s.id !== id) continue;
          for (let i = s.start; i < s.end; i++) cells[i] && cells[i].classList.add(cls);
          first = first || row;
        }
        row.querySelectorAll('[data-id]').forEach((el) => {
          if (el.dataset.id === id || (el.dataset.ids && el.dataset.ids.split(' ').includes(id))) el.classList.add(cls);
        });
      });
      return first;
    };
    return {
      highlight(id, reveal) {
        const row = mark('dv-hl', id);
        // 只捲動雙視區本身，不捲動整頁
        if (row && reveal) {
          const top = row.offsetTop; // 容器是 position: relative
          if (top < container.scrollTop || top + row.offsetHeight > container.scrollTop + container.clientHeight)
            container.scrollTop = Math.max(0, top - 20);
        }
      },
      playing(id) {
        mark('dv-play', id);
      },
    };
  }

  MB.dualView = { render };
  if (typeof module !== 'undefined' && module.exports) module.exports = MB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
