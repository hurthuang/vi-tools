// 試卷分段：把試卷文字切成「說明、題組文章、每題的題目、每題的選項」，給文件整理的「分段匯出」一段存成一個音檔
// 自動判斷認得的寫法（會考 NVDA 試題本 docx、會考 PDF 經文件整理抽出的文字）：
//   題目：行首「第1題」；或行首「1.」「1、」，依題號順序判斷（見下方），避免把文章裡的編號清單、注意事項當成題目
//   選項：行首「(A)」「（Ａ）」；一題的選項合成一段（從第一個選項到下一段開始前）
//   題組文章：「請閱讀以下短文，並回答25及26題」「閱讀下列選文，回答第 44 至 45 題」這類提示行，
//            或單獨一行「第20及21題」「(20-21)」；文章從提示行到下一題的題目
//   大標題（「一、單題」「第二部分：題組」）併入下一段，不單獨成段
//   第一段之前的文字是「說明」
// 手動分割記號（比照 Balabolka）：單獨一行 === （三個以上等號），後面可接名稱，例「=== 閱讀測驗一」；
//   從記號處切開，記號那行不念。一般試卷格式不整齊時，可以只用記號切（opts.auto = false）
// 每段以行首為界，所有段接起來等於原文（不漏字），朗讀與匯出可以依位置對應
// 對外：window.vitoolsExamSplit = {
//   split(text, { auto = true }) → [{ kind, q, from, to, start, end, speakStart, label }]
//     kind：'intro' 說明、'passage' 題組文章、'stem' 題目、'options' 選項、'mark' 手動記號開始的段
//     q：題號（題目、選項）；from、to：題組涵蓋的題號（依後面實際的題目，沒有題目時取提示行的題號）
//     start、end：在原文的位置（end 是下一段的 start）；speakStart：要念的部分從哪裡開始（跳過記號那行）
//     label：檔名用的名稱，例「第3題_選項」
//   isMarker(line) 這行是不是分割記號 }
(function () {
  'use strict';

  const NUM = '[0-9０-９]+';
  const RANGE = `(${NUM})\\s*(?:題)?\\s*(?:[及至到、,，~～\\-–－]|and)\\s*(${NUM})`;
  const Q_DOCX = new RegExp(`^\\s*第\\s*(${NUM})\\s*題`);
  const Q_NUM = new RegExp(`^\\s*(${NUM})\\s*[.．、](?![0-9０-９])`);
  const OPTION = /^\s*[(（]\s*[A-DＡ-Ｄ]\s*[)）]/;
  const GROUP_LINE = [
    new RegExp(`^\\s*第\\s*${RANGE}\\s*題`),                      // 第20及21題（英文科 NVDA 試題本）
    new RegExp(`^\\s*[(（]\\s*${RANGE}\\s*[)）]\\s*$`),            // (20-21)（英文科 PDF）
    new RegExp(`回答\\s*第?\\s*${RANGE}\\s*題`),                   // 請閱讀以下短文，並回答25及26題
  ];
  const HEADING = /^\s*(?:[一二三四五六七八九十]+\s*[、.．]|第[一二三四五六七八九十]+部分)/;
  const MARKER = /^\s*[=＝]{3,}\s*(.*?)\s*$/;

  const toInt = s => parseInt(s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), 10);
  const isMarker = line => MARKER.test(line);

  function split(text, opts) {
    const auto = !opts || opts.auto !== false;
    // 逐行，記下每行在原文的起點
    const lines = [];
    for (let pos = 0; ;) {
      const nl = text.indexOf('\n', pos);
      lines.push({ start: pos, text: text.slice(pos, nl < 0 ? text.length : nl) });
      if (nl < 0) break;
      pos = nl + 1;
    }
    const kindOf = t => {
      const mk = t.match(MARKER);
      if (mk) return { mark: mk[1] };
      if (!auto) return null;
      const g = GROUP_LINE.map(re => t.match(re)).find(Boolean);
      if (g && t.length < 80) return { group: [toInt(g[1]), toInt(g[2])] };
      let m = t.match(Q_DOCX);
      if (m) return { q: toInt(m[1]), sure: true };
      m = t.match(Q_NUM);
      if (m) return { q: toInt(m[1]), sure: false };
      if (OPTION.test(t)) return 'option';
      return null;
    };
    const kinds = lines.map(l => kindOf(l.text));
    const isQ = k => k && k.q != null;
    const isBreak = k => k && (k.group || k.mark != null);
    // 「1.」這類題號容易和文章、題目裡的編號清單、注意事項混淆，依題號順序判斷：
    //   接續上一題（上一題 + 1）就算題目（PDF 的選項若是圖片抽不出文字，也還認得到）；
    //   跳號（比上一題大）要在下一個編號之前出現選項才算；比上一題小的不算（題目裡的編號清單）
    //   還沒有題目時，要在下一個編號之前出現選項才算（排除開頭的注意事項 1. 2. 3.）
    //   大標題（第二部分：非選擇題）之後可以從 1 重新開始
    const optionsBeforeNext = i => {
      for (let j = i + 1; j < kinds.length; j++) {
        if (kinds[j] === 'option') return true;
        if (isBreak(kinds[j]) || isQ(kinds[j])) return false;
      }
      return false;
    };
    const afterHeading = i => {
      for (let j = i - 1; j >= 0; j--) if (lines[j].text.trim()) return HEADING.test(lines[j].text);
      return false;
    };
    let lastQ = null;
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i];
      if (!isQ(k)) continue;
      const ok = k.sure || (lastQ == null ? optionsBeforeNext(i)
        : k.q === lastQ + 1 || (k.q > lastQ && optionsBeforeNext(i)) || (k.q === 1 && afterHeading(i)));
      if (ok) lastQ = k.q; else kinds[i] = null;
    }

    // 依行的種類分段
    const segs = [];
    let cur = null;
    const open = (kind, i, extra, keepHeading = true) => {
      // 前面緊接的大標題與空行併入這一段（目前這段至少留下它的第一行；手動記號照使用者放的位置切）
      let s = i;
      while (keepHeading && cur && s - 1 > cur.firstLine && (HEADING.test(lines[s - 1].text) || !lines[s - 1].text.trim())) s--;
      cur = Object.assign({ kind, firstLine: s, markLine: -1 }, extra);
      segs.push(cur);
    };
    for (let i = 0; i < lines.length; i++) {
      const k = kinds[i];
      if (k && k.mark != null) { open('mark', i, { name: k.mark, markLine: i }, false); continue; }
      if (k && k.group) open('passage', i, { range: k.group });
      else if (isQ(k)) open('stem', i, { q: k.q });
      else if (k === 'option' && cur && cur.kind === 'stem') open('options', i, { q: cur.q });
      else if (!cur) { cur = { kind: 'intro', firstLine: 0, markLine: -1 }; segs.push(cur); }
    }

    // 位置；沒有要念的內容（只有空白或只有記號）的段：自動判斷的併入前一段，手動記號的保留（使用者自己放的）
    const out = [];
    segs.forEach((s, n) => {
      const start = lines[s.firstLine].start;
      const end = n + 1 < segs.length ? lines[segs[n + 1].firstLine].start : text.length;
      const speakStart = s.markLine >= 0 ? (s.markLine + 1 < lines.length ? lines[s.markLine + 1].start : text.length) : start;
      if (!text.slice(speakStart, end).trim() && out.length && s.kind !== 'mark') { out[out.length - 1].end = end; return; }
      out.push({ kind: s.kind, q: s.q, name: s.name, range: s.range, start, end, speakStart });
    });
    // 題組涵蓋的題號：依後面實際的題目；後面沒有題目（例：本題組視障生不作答）時取提示行的題號
    out.forEach((s, n) => {
      if (s.kind !== 'passage') return;
      const qs = [];
      // 手動記號只是切開，不是題組結束，照樣往後找
      for (let k = n + 1; k < out.length && out[k].kind !== 'passage'; k++) if (out[k].kind === 'stem') qs.push(out[k].q);
      [s.from, s.to] = qs.length ? [qs[0], qs[qs.length - 1]] : s.range;
    });
    out.forEach((s, n) => {
      const next = out[n + 1];
      s.label = s.kind === 'intro' ? '說明'
        : s.kind === 'mark' ? (s.name || '分段')
        : s.kind === 'passage' ? (s.from === s.to ? `第${s.from}題_題組` : `第${s.from}至${s.to}題_題組`)
        : s.kind === 'options' ? `第${s.q}題_選項`
        : next && next.kind === 'options' ? `第${s.q}題_題目` : `第${s.q}題`;
      delete s.name; delete s.range;
    });
    return out;
  }

  const api = { split, isMarker };
  if (typeof window !== 'undefined') window.vitoolsExamSplit = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
