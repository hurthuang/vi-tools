// 文字裡的 HTML 表格（<table border="1"><tr><td>…</td></tr></table>）：
//   vi-tools 辨識套件的試卷輸出、老師手打的點字試卷都用這種寫法（一張表寫在同一行）
// 給文件整理（預覽畫成表格、朗讀逐格念、自動調整不拆表格）與文字轉點字（表格轉成條列文字）用
// 規則跟 vi-tools 辨識套件 app\exam\layout.py 的 table_text 相同，改一邊要一起改
// 對外：window.vitoolsHtmlTable = {
//   RE                          找表格的正規表示式（g）
//   has(text)                   有沒有表格
//   rows(html)                  → [[{ text, span }]]（span：跨幾欄）
//   heads(rows)                 → { hrow, hcol } 自動判斷第一列、第一欄是不是標題
//   toText(rows, axis, opts)    → [行]；axis 'rows' 一列一行（「月均溫：1月 -3.7℃，2月 …」）、'cols' 一欄一行（「1月：月均溫 -3.7℃，降水量 3mm」）
//                                 opts：{ hrow, hcol }（undefined＝自動）
//   replaceAll(text, axis)      → { text, count } 每張表換成條列文字（表格前面同一行的字自己一行）
//   element(html, doc)          → <table> 元素（只取格子文字與 colspan，不直接用原本的 HTML）
// }
(function () {
  'use strict';

  const RE = /<table\b[^>]*>[\s\S]*?<\/table>/gi;

  function rows(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const t = d.querySelector('table');
    if (!t) return [];
    return [...t.querySelectorAll('tr')].map(tr => [...tr.children].filter(c => /^T[DH]$/.test(c.tagName)).map(c => ({
      text: c.textContent.replace(/\s+/g, ' ').trim(),
      span: Math.max(1, parseInt(c.getAttribute('colspan'), 10) || 1),
      th: c.tagName === 'TH',
    }))).filter(r => r.length);
  }

  // 合併儲存格的字填進它跨的每一格
  function grid(rs) {
    const w = Math.max(...rs.map(r => r.reduce((s, c) => s + c.span, 0)));
    return rs.map(r => {
      const out = [];
      for (const c of r) for (let k = 0; k < c.span; k++) out.push(c.text);
      while (out.length < w) out.push('');
      return out;
    });
  }

  // 數字（可以帶短單位：30元、185mm、25%）
  const NUM = /^[\s$]*[-−－+]?\s*[\d.,，．]+\s*(?:[%％℃°]|[a-zA-Z]{1,3}|[一-鿿]{1,2})?[\s$]*$/;
  const isNum = c => NUM.test(c);
  const filled = a => a.filter(c => c.trim());

  function heads(rs) {
    const g = grid(rs);
    if (g.length < 2 || g[0].length < 2) return { hrow: g.length > 0, hcol: false };
    const body = filled(g.slice(1).flatMap(r => r.slice(1)));
    const firstCol = filled(g.slice(1).map(r => r[0]));
    const top = filled(g[0].slice(1));
    const numBody = body.filter(isNum).length >= 0.5 * Math.max(1, body.length);
    const hrow = top.filter(c => !isNum(c)).length >= 0.5 * Math.max(1, top.length) || numBody;
    const hcol = firstCol.length > 0 && firstCol.every(c => !isNum(c)) && numBody;
    return { hrow, hcol };
  }

  // 拆成好幾段的表（1～6 月一段、7～12 月一段，「月分」那列重複）接成一張寬表
  function joinBands(g) {
    const h = g[0][0];
    const starts = g.map((r, i) => (r[0].trim() && r[0] === h ? i : -1)).filter(i => i >= 0);
    if (starts.length < 2) return g;
    const bands = starts.map((a, k) => g.slice(a, k + 1 < starts.length ? starts[k + 1] : g.length));
    const n = bands[0].length, labels = bands[0].map(r => r[0]).join('\u0001');
    if (bands.some(b => b.length !== n || b.map(r => r[0]).join('\u0001') !== labels)) return g;
    return bands[0].map((r, i) => bands.slice(1).reduce((acc, b) => acc.concat(b[i].slice(1)), r.slice()));
  }

  // 兩層的標題列（「價格」底下分「中杯」「大杯」，左上角空白）合成一列：「價格 中杯」
  function collapseHeads(g) {
    let n = 1;
    while (n < g.length - 1 && !g[n][0].trim()) {
      const f = filled(g[n].slice(1));
      if (f.filter(isNum).length >= 0.5 * Math.max(1, f.length)) break;
      n++;
    }
    if (n === 1) return g;
    const head = g[0].map((_, j) => {
      const parts = [];
      for (const r of g.slice(0, n)) { const t = r[j].trim(); if (t && !parts.includes(t)) parts.push(t); }
      return parts.join(' ');
    });
    return [head, ...g.slice(n)];
  }

  // 「月均溫（℃）」→ 月均溫、℃；「大杯(1000毫升)」不是單位
  const UNIT = /^(.*?\S)\s*[（(]\s*([^()（）\d]{1,6}?)\s*[)）]\s*$/;
  function splitUnit(h) {
    const m = UNIT.exec(h.trim());
    return m ? [m[1], m[2]] : [h.trim(), ''];
  }

  function toText(rs, axis, opts = {}) {
    if (!rs.length) return [];
    const auto = heads(rs);
    let hrow = opts.hrow === undefined ? auto.hrow : opts.hrow;
    let hcol = opts.hcol === undefined ? auto.hcol : opts.hcol;
    let g = grid(rs);
    if (hrow) g = collapseHeads(joinBands(g));
    if (axis === 'cols') {   // 轉置：一欄變成一列，標題列、標題欄互換
      g = g[0].map((_, j) => g.map(r => r[j]));
      [hrow, hcol] = [hcol, hrow];
    }
    const hs = hrow ? g[0] : g[0].map(() => '');
    const out = [];
    for (const r of (hrow ? g.slice(1) : g)) {
      const [name, unit] = hcol ? splitUnit(r[0]) : ['', ''];
      const parts = [];
      r.forEach((c, j) => {
        if ((hcol && j === 0) || !c.trim()) return;
        const [hn, hu] = hs[j].trim() ? splitUnit(hs[j]) : ['', ''];
        const u = unit || hu;
        const v = c.trim() + (u && isNum(c) ? u : '');
        parts.push(hn ? `${hn} ${v}` : v);
      });
      if (!parts.length) continue;
      const line = parts.join('，');
      out.push(name ? `${name}：${line}` : line);
    }
    return out;
  }

  function replaceAll(text, axis) {
    let count = 0;
    const out = text.split('\n').map(line => {
      if (!/<table\b/i.test(line)) return line;
      const pieces = [];
      let last = 0;
      line.replace(RE, (m, at) => {
        const before = line.slice(last, at).trim();
        if (before) pieces.push(before);
        const t = toText(rows(m), axis);
        if (t.length) { pieces.push(...t); count++; } else pieces.push(m);
        last = at + m.length;
        return m;
      });
      const after = line.slice(last).trim();
      if (after) pieces.push(after);
      return pieces.join('\n');
    }).join('\n');
    return { text: out, count };
  }

  function element(html, doc = document) {
    const t = doc.createElement('table');
    t.className = 'html-table';
    const rs = rows(html), h = rs.length ? heads(rs) : {};
    rs.forEach((r, i) => {
      const tr = doc.createElement('tr');
      for (const [j, c] of r.entries()) {
        const th = c.th || (h.hrow && i === 0) || (h.hcol && j === 0);
        const td = doc.createElement(th ? 'th' : 'td');
        if (th) td.scope = i === 0 ? 'col' : 'row';
        if (c.span > 1) td.colSpan = c.span;
        td.textContent = c.text;
        tr.appendChild(td);
      }
      t.appendChild(tr);
    });
    return t;
  }

  window.vitoolsHtmlTable = { RE, has: t => /<table\b[\s\S]*?<\/table>/i.test(t), rows, heads, toText, replaceAll, element };
})();
