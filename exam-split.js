// 試卷分段：把試卷文字切成「說明、大標題、題組文章、每題的題目、每題的選項」，給文件整理的「分段匯出」一段存成一個音檔
// 規則依兩種資料整理：會考 NVDA 試題本 docx、會考 PDF 經文件整理抽出的文字；以及視巡雲端硬碟裡老師以前用
// Balabolka「依空行分割」做的語音卷（文字檔與 mp3 一一對應，12 份 1015 段，自動判斷找到 98% 的切點）
//   題目：行首「第1題」；或行首「1.」「1、」「1.( )」「( )1.」「2()」，依題號順序判斷（見下方），
//         避免把文章裡的編號清單、注意事項當成題目
//   選項：行首「(A)」「（Ａ）」，或選項是圖時的「（選項請參閱紙本試卷）」；一題的選項合成一段。
//         題號和 (A) 在同一行（英聽：6. (A)… (B)…）整題一段，不拆題目、選項
//   題組文章：「請閱讀以下短文，並回答25及26題」「請依圖回答21~23」這類提示行（可和文章接在同一行），
//            單獨一行「第20及21題」「(20-21)」「A.」（閱讀測驗），或「二、題組」大標題後直接接的文章；文章到下一題的題目為止
//   大標題（「二、閱讀選擇（每題2分）」「第二部分：題組」「題組：」）自己一段；第一題之前的大標題留在「說明」裡
//   第一段之前的文字是「說明」
// 手動分割記號（比照 Balabolka）：單獨一行 === （三個以上等號），後面可接名稱，例「=== 閱讀測驗一」；
//   從記號處切開，記號那行不念。一般試卷格式不整齊時，可以只用記號切（opts.auto = false）
// 每段以行首為界，所有段接起來等於原文（不漏字），朗讀與匯出可以依位置對應
// 對外：window.vitoolsExamSplit = {
//   split(text, { mode = 'auto' | 'manual' | 'blank' }) → [{ kind, q, from, to, start, end, speakStart, label }]
//     kind：'intro' 說明、'heading' 大標題、'passage' 題組文章、'stem' 題目、'options' 選項、'mark' 手動記號開始的段
//     q：題號（題目、選項）；from、to：題組涵蓋的題號（依後面實際的題目，沒有題目時取提示行的題號）
//     start、end：在原文的位置（end 是下一段的 start）；speakStart：要念的部分從哪裡開始（跳過記號那行）
//     label：檔名用的名稱，例「第3題_選項」「二、閱讀選擇」
//   mode 'blank'（依空行切，同 Balabolka「依空行分割」）：空行之後的第一行開始新的一段，段的種類看那一行，其他叫「分段」（kind 'part'）
//   isMarker(line) 這行是不是分割記號 }
(function () {
  'use strict';

  const NUM = '[0-9０-９]+';
  const RANGE = `(${NUM})\\s*(?:題)?\\s*(?:[及至到、,，~～\\-–－]|and)\\s*(${NUM})`;
  const BLANK = '[(（][\\s\\u3000]*[)）]';    // 作答括號：( )1.、1.( )、2()
  const Q_DOCX = new RegExp(`^\\s*第\\s*(${NUM})\\s*題`);
  const Q_NUM = new RegExp(`^\\s*(?:${BLANK}\\s*)?(${NUM})\\s*(?:[.．、,，]\\s*(?:${BLANK})?|${BLANK})(?![0-9０-９])`);
  const OPTION_A = /^\s*[(（]\s*[AＡ]\s*[)）]/;
  // 選項：(A)、（Ａ）；選項是圖、抽不出文字時的「（選項請參閱紙本試卷）」也算
  const OPTION = /^\s*(?:[(（]\s*[A-DＡ-Ｄ]\s*[)）]|[(（]?\s*選項請參閱)/;
  const GROUP_LINE = [
    new RegExp(`^\\s*第\\s*${RANGE}\\s*題`),                      // 第20及21題（英文科 NVDA 試題本）
    new RegExp(`^\\s*[(（]\\s*${RANGE}\\s*[)）]\\s*$`),            // (20-21)（英文科 PDF）
  ];
  // 請閱讀以下短文，並回答25及26題／請依圖回答21~23（提示行可能和文章接在同一行，只看行首附近）
  const GROUP_PROMPT = new RegExp(`回答\\s*第?\\s*${RANGE}`);
  const PASSAGE_LABEL = /^\s*[A-HＡ-Ｈ]\s*[.．]\s*$/;              // 閱讀測驗的 A. B. C.
  const HEADING_START = /^\s*(?:[一二三四五六七八九十]+\s*[、.．]|[壹貳參肆伍陸柒捌玖拾]+\s*[、.．]|第[一二三四五六七八九十]+部分)/;
  const HEADING_WORD = /題|分|測驗|閱讀|聽|作文|寫作|注音|翻譯|部分/;
  const isHeading = t => (HEADING_START.test(t) && HEADING_WORD.test(t) && t.trim().length <= 40) || /^\s*題組\s*[:：]?\s*$/.test(t);
  const RESTART = /非選|填充|填空|問答|計算|簡答|應用|作圖|翻譯|寫作|配合|是非/;
  const MARKER = /^\s*[=＝]{3,}\s*(.*?)\s*$/;

  const toInt = s => parseInt(s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), 10);
  const isMarker = line => MARKER.test(line);
  // 大標題當檔名：取到括號、冒號或逗號之前，例「二、閱讀選擇（每題 2 分）」→「二、閱讀選擇」、「二、題組，共5題」→「二、題組」
  const headingName = t => t.trim().split(/[（(：:，,]/)[0].replace(/\s+/g, '').slice(0, 20);

  function split(text, opts) {
    // mode：'auto' 自動判斷（預設）、'manual' 只用 === 記號切（舊寫法 { auto: false }）、'blank' 依空行切（同 Balabolka）
    const mode = (opts && opts.mode) || (opts && opts.auto === false ? 'manual' : 'auto');
    const auto = mode !== 'manual';
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
      const gp = t.match(GROUP_PROMPT);
      if (gp && gp.index < 40) return { group: [toInt(gp[1]), toInt(gp[2])] };
      if (PASSAGE_LABEL.test(t)) return { group: null };
      let m = t.match(Q_DOCX) || t.match(Q_NUM);
      if (m) return { q: toInt(m[1]), sure: Q_DOCX.test(t), inline: OPTION_A.test(t.slice(m[0].length)) };
      if (OPTION.test(t)) return 'option';
      if (isHeading(t)) return { heading: t };
      return null;
    };
    const kinds = lines.map(l => kindOf(l.text));
    const isQ = k => k && k.q != null;
    const isBreak = k => k && (k.group !== undefined || k.mark != null);
    // 「1.」這類題號容易和文章、題目裡的編號清單、注意事項混淆，依題號順序判斷：
    //   接續上一題（上一題 + 1）就算題目（PDF 的選項若是圖片抽不出文字，也還認得到）；
    //   跳號（比上一題大）要在下一個編號之前出現選項才算；比上一題小的不算（題目裡的編號清單）
    //   還沒有題目時，要在下一個編號之前出現選項才算（排除開頭的注意事項 1. 2. 3.）
    //   上一題之後有大標題時可以從 1 重新開始：後面有選項，或大標題是填充、非選擇題等
    const optionsBeforeNext = i => {
      if (kinds[i].inline) return true;
      for (let j = i + 1; j < kinds.length; j++) {
        if (kinds[j] === 'option') return true;
        if (isBreak(kinds[j]) || isQ(kinds[j])) return false;
      }
      return false;
    };
    let lastQ = null, heading = null;
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i];
      if (k && k.heading) { heading = k.heading; continue; }
      if (!isQ(k)) continue;
      const ok = k.sure || (lastQ == null ? optionsBeforeNext(i)
        : k.q === lastQ + 1 || (k.q > lastQ && optionsBeforeNext(i))
          || (k.q === 1 && heading != null && (optionsBeforeNext(i) || RESTART.test(heading))));
      if (ok) { lastQ = k.q; heading = null; } else kinds[i] = null;
    }

    // 依行的種類分段
    //   大標題自己一段（第一題之前的大標題留在「說明」裡）；「二、題組」後面直接接文章時，文章另成一段
    //   題號和 (A) 在同一行（英聽：6. (A)… (B)…）整題一段，不拆題目、選項
    const segs = [];
    let cur = null, seenQ = false, passageNext = false;
    const open = (kind, i, extra) => {
      cur = Object.assign({ kind, firstLine: i, markLine: -1 }, extra);
      segs.push(cur);
    };
    // 依空行切（同 Balabolka「依空行分割」，老師以前做語音卷的方式）：空行之後的第一行開始新的一段；
    // 段的種類（決定檔名）看那一行：題號、選項、題組提示、大標題，其他叫「分段」
    let lastStem = null;
    for (let i = 0; mode === 'blank' && i < lines.length; i++) {
      const k = kinds[i];
      if (!lines[i].text.trim() || (i > 0 && lines[i - 1].text.trim() && !(k && k.mark != null))) continue;
      if (k && k.mark != null) open('mark', i, { name: k.mark, markLine: i });
      else if (k && k.group !== undefined) open('passage', i, { range: k.group });
      else if (isQ(k)) { open('stem', i, { q: k.q, inline: k.inline }); lastStem = k.q; }
      else if (k === 'option' && lastStem != null) open('options', i, { q: lastStem });
      else if (k && k.heading) open('heading', i, { name: headingName(k.heading) });
      else open(segs.length ? 'part' : 'intro', i, {});
    }
    if (mode === 'blank') { if (!segs.length) open('intro', 0, {}); segs[0].firstLine = 0; }
    for (let i = 0; mode !== 'blank' && i < lines.length; i++) {
      const k = kinds[i];
      const t = lines[i].text;
      if (!cur) { cur = { kind: 'intro', firstLine: 0, markLine: -1 }; segs.push(cur); }
      if (k && k.mark != null) { open('mark', i, { name: k.mark, markLine: i }); passageNext = false; continue; }
      if (k && k.group !== undefined) { open('passage', i, { range: k.group }); passageNext = false; }
      else if (isQ(k)) { seenQ = true; passageNext = false; open('stem', i, { q: k.q, inline: k.inline }); }
      else if (k === 'option') { if (cur.kind === 'stem' && !cur.inline) open('options', i, { q: cur.q }); }
      else if (k && k.heading) {
        if (seenQ && cur.kind !== 'heading') open('heading', i, { name: headingName(k.heading) });
        passageNext = /題組/.test(k.heading);
      } else if (passageNext && t.trim()) { open('passage', i, { range: null }); passageNext = false; }
      if (i === 0 && segs.length > 1 && segs[0].kind === 'intro') segs.shift();
    }

    // 位置；沒有要念的內容（只有空白或只有記號）的段：自動判斷的併入前一段，手動記號的保留（使用者自己放的）
    const out = [];
    segs.forEach((s, n) => {
      const start = lines[s.firstLine].start;
      const end = n + 1 < segs.length ? lines[segs[n + 1].firstLine].start : text.length;
      const speakStart = s.markLine >= 0 ? (s.markLine + 1 < lines.length ? lines[s.markLine + 1].start : text.length) : start;
      if (!text.slice(speakStart, end).trim() && out.length && s.kind !== 'mark') { out[out.length - 1].end = end; return; }
      out.push({ kind: s.kind, q: s.q, inline: s.inline, name: s.name, range: s.range, start, end, speakStart });
    });
    // 題組涵蓋的題號：依後面實際的題目；後面沒有題目（例：本題組視障生不作答）時取提示行的題號
    out.forEach((s, n) => {
      if (s.kind !== 'passage') return;
      const qs = [];
      // 手動記號只是切開，不是題組結束，照樣往後找
      for (let k = n + 1; k < out.length && out[k].kind !== 'passage'; k++) if (out[k].kind === 'stem') qs.push(out[k].q);
      [s.from, s.to] = qs.length ? [qs[0], qs[qs.length - 1]] : s.range || [];
    });
    out.forEach((s, n) => {
      const next = out[n + 1];
      s.label = s.kind === 'intro' ? '說明'
        : s.kind === 'mark' ? (s.name || '分段')
        : s.kind === 'part' ? '分段'
        : s.kind === 'heading' ? s.name
        : s.kind === 'passage' ? (s.from == null ? '題組' : s.from === s.to ? `第${s.from}題_題組` : `第${s.from}至${s.to}題_題組`)
        : s.kind === 'options' ? `第${s.q}題_選項`
        : next && next.kind === 'options' ? `第${s.q}題_題目` : `第${s.q}題`;
      delete s.name; delete s.range; delete s.inline;
    });
    return out;
  }

  const api = { split, isMarker };
  if (typeof window !== 'undefined') window.vitoolsExamSplit = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
