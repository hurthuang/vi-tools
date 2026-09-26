// 點字讀音：把點字照「實際代表的音」轉成可以念的文字，用耳朵校對點字
//   注音點字：每個音節換成念法固定的同音常用字（brl-reading-data.js，來源 NVDA-DictSwitcher 的 brl_dict.dic，加上 tools/build-brl-reading.mjs 補的音節），
//             例：⠏⠵⠄（ㄆㄥ）→「烹」；字典沒有的音節改用 McBopomofo 的候選字（可能是多音字，列在 fallbacks 讓使用者知道）
//   英文點字：backTranslate() 用 liblouis 反向翻譯
// 需要：mcbopomofo-service.js（全域 mcbopomofo）、brl-reading-data.js（window.VITOOLS_BRL_READING）、
//       英文要 build-no-tables-utf32.js（全域 liblouisBuild）且頁面已載入點字表
// 對外：window.vitoolsBrlReading = {
//   zh(注音點字, mcbService?) → { text, count, fallbacks: [注音] }（mcbService 省略時自己建一個）
//   backTranslate(英文點字, 點字表檔名) → 英文或 null }
(function () {
  'use strict';

  // 以注音為鍵重建對照表：點字寫法可能有變體，用 McBopomofo 解出的注音對照比較穩
  let byBpmf = null;
  function table() {
    if (byBpmf) return byBpmf;
    byBpmf = new Map();
    const data = window.VITOOLS_BRL_READING || {};
    const conv = mcbopomofo.BopomofoBrailleConverter;
    for (const [brl, ch] of Object.entries(data)) {
      let tokens;
      try { tokens = conv.convertBrailleToTokens(brl); } catch (e) { continue; }
      // 只收剛好解成一個音節的
      if (tokens.length === 1 && tokens[0] && typeof tokens[0].bpmf === 'string' && !byBpmf.has(tokens[0].bpmf))
        byBpmf.set(tokens[0].bpmf, ch);
    }
    return byBpmf;
  }

  // 查不到的音節要用 McBopomofo 選字；頁面沒有自己的服務時才建一個（第一次用到才建）
  let ownService = null;
  function service(given) {
    if (given) return given;
    if (!ownService) ownService = new mcbopomofo.Service();
    return ownService;
  }

  // 一段注音點字 → 讀音文字；標點照 McBopomofo 解出的字，詞間空格保留
  function zh(braille, mcbService) {
    const map = table();
    const tokens = mcbopomofo.BopomofoBrailleConverter.convertBrailleToTokens(braille);
    let text = '', count = 0;
    const fallbacks = [];
    for (const t of tokens) {
      if (t && typeof t === 'object' && typeof t.bpmf === 'string') {
        count++;
        let ch = map.get(t.bpmf);
        if (!ch) {
          try { ch = service(mcbService).convertBrailleToText(t.braille); } catch (e) { ch = ''; }
          fallbacks.push(t.bpmf);
        }
        text += ch || t.bpmf;
      } else {
        const s = typeof t === 'string' ? t : String(t);
        text += s.trim() ? s : ' ';
      }
    }
    return { text, count, fallbacks };
  }

  // 英文點字（UEB、電腦點字）→ 英文：liblouis 反向翻譯；點字表要已由頁面載入到 liblouis 的 /tables/
  // 反向翻譯可以抓出縮寫用錯的地方。表格沒載入或翻不出來時回傳 null
  function backTranslate(uni, tableFile) {
    const M = typeof liblouisBuild !== 'undefined' ? liblouisBuild : null;
    if (!M || typeof M._lou_backTranslateString !== 'function' || !uni) return null;
    try { M.FS.stat('/tables/' + tableFile); } catch (e) { return null; }
    const cps = Array.from(uni).map(c => c.codePointAt(0));
    const n = cps.length, outMax = Math.max(n * 8, 256);
    const inBuf = M._malloc((n + 1) * 4), outBuf = M._malloc((outMax + 1) * 4);
    const inP = M._malloc(4), outP = M._malloc(4);
    const tbl = M.allocate(M.intArrayFromString('/tables/' + tableFile), 'i8', M.ALLOC_NORMAL);
    try {
      cps.forEach((c, i) => M.setValue(inBuf + i * 4, c, 'i32'));
      M.setValue(inBuf + n * 4, 0, 'i32');
      M.setValue(inP, n, 'i32'); M.setValue(outP, outMax, 'i32');
      if (M._lou_backTranslateString(tbl, inBuf, inP, outBuf, outP, 0, 0, 0) <= 0) return null;
      let out = '';
      const len = M.getValue(outP, 'i32');
      for (let i = 0; i < len; i++) out += String.fromCodePoint(M.getValue(outBuf + i * 4, 'i32'));
      // 這個 liblouis build 把少數規則裡的彎撇號拆成位元組輸出（見 braille-to-text.html 的 _fixBackTranslateMojibake）
      return out.replace(/â/g, "'");
    } catch (e) { return null; }
    finally { [tbl, inBuf, outBuf, inP, outP].forEach(p => M._free(p)); }
  }

  window.vitoolsBrlReading = { zh, backTranslate };
})();
