// 點字讀音：把點字照「實際代表的音」轉成可以念的文字，用耳朵校對點字
//   注音點字：每個音節換成念法固定的同音常用字（brl-reading-data.js，來源 NVDA-DictSwitcher 的 brl_dict.dic），
//             例：⠏⠵⠄（ㄆㄥ）→「烹」；沒有對應字的音節念注音加聲調（例：ㄌㄥ →「ㄌㄥ第一聲」，同字典的做法），
//             列在 spelled 讓使用者知道（這類音節幾乎沒有實際用到的字，常是點字打錯）
//   英文點字：backTranslate() 用 liblouis 反向翻譯
// 需要：mcbopomofo-service.js（全域 mcbopomofo）、brl-reading-data.js（window.VITOOLS_BRL_READING）、
//       英文要 build-no-tables-utf32.js（全域 liblouisBuild）且頁面已載入點字表
// 對外：window.vitoolsBrlReading = {
//   zh(注音點字) → { text, count, spelled: [念注音的音節] }
//   backTranslate(英文點字, 點字表檔名) → 英文或 null }
(function () {
  'use strict';

  // 對照表（brl-reading-data.js，Unicode 點字 → 字）：只收剛好解成一個音節的鍵
  //   byKey：點字 → { ch, bpmf }，從左到右切音節用（同 DictSwitcher 注音點字字庫的做法）
  //   byBpmf：注音 → 字，交給 McBopomofo 解的片段用
  let byKey = null, byBpmf = null, maxLen = 1;
  function table() {
    if (byKey) return byKey;
    byKey = new Map(); byBpmf = new Map();
    const data = window.VITOOLS_BRL_READING || {};
    const conv = mcbopomofo.BopomofoBrailleConverter;
    for (const [brl, ch] of Object.entries(data)) {
      let tokens;
      try { tokens = conv.convertBrailleToTokens(brl); } catch (e) { continue; }
      if (!(tokens.length === 1 && tokens[0] && typeof tokens[0].bpmf === 'string')) continue;
      const bpmf = realBpmf(tokens[0].bpmf);
      byKey.set(brl, { ch, bpmf });
      maxLen = Math.max(maxLen, brl.length);
      if (!byBpmf.has(tokens[0].bpmf)) byBpmf.set(tokens[0].bpmf, ch);
    }
    return byKey;
  }

  // 沒有對應字的音節：注音加聲調（字典裡也是這樣寫，例：ㄌㄥ第一聲；語音會一個一個念注音符號再念聲調）
  const TONE_NAME = { 'ˊ': '第二聲', 'ˇ': '第三聲', 'ˋ': '第四聲', '˙': '輕聲' };
  function spell(bpmf) {
    const m = bpmf.match(/[ˊˇˋ˙]$/);
    return m ? bpmf.slice(0, -1) + TONE_NAME[m[0]] : bpmf + '第一聲';
  }
  const isSpelled = s => /^[ㄅ-ㄩ]/.test(s);
  // 國語點字共用點位，McBopomofo 解出的注音要改正（同 tools/fix-brl-dict-hanhan.mjs 的 real()）：
  //   ㄍㄐ、ㄘㄑ、ㄙㄒ 同點位，看後面：ㄐㄑㄒ 只接 ㄧ、ㄩ（例：⠅⠴ 被解成 ㄐㄟ → ㄍㄟ）
  //   ⠴（ㄟ／ㄧㄛ）、⠢（ㄝ／ㄧㄞ）看聲調：一聲的 ㄟ 是 ㄧㄛ、二聲的 ㄝ 是 ㄧㄞ
  const realBpmf = b => b.replace(/^ㄐ(?![ㄧㄩ])/, 'ㄍ').replace(/^ㄑ(?![ㄧㄩ])/, 'ㄘ').replace(/^ㄒ(?![ㄧㄩ])/, 'ㄙ')
    .replace(/^ㄍ(?=[ㄧㄩ])/, 'ㄐ').replace(/^ㄘ(?=[ㄧㄩ])/, 'ㄑ').replace(/^ㄙ(?=[ㄧㄩ])/, 'ㄒ')
    .replace(/^ㄟ$/, 'ㄧㄛ').replace(/^ㄝˊ$/, 'ㄧㄞˊ');

  // 一段注音點字 → 讀音文字：從左到右，每個位置先試對照表裡最長的點字（音節）；
  // 對照表沒有的片段（標點等）交給 McBopomofo，詞間空格保留。
  // 不直接整段交給 McBopomofo：它會把音節後面的 ⠱（ㄦ）當兒化韻併進前一個音節，例：⠷⠈⠱⠈（偶爾）→「偶⠈」
  function zh(braille) {
    const keys = table();
    let text = '', count = 0, rest = '';
    const spelled = [];
    const flush = () => {
      if (!rest) return;
      for (const t of mcbopomofo.BopomofoBrailleConverter.convertBrailleToTokens(rest)) {
        if (t && typeof t === 'object' && typeof t.bpmf === 'string') {
          count++;
          const ch = byBpmf.get(t.bpmf) || spell(realBpmf(t.bpmf));
          if (isSpelled(ch)) spelled.push(realBpmf(t.bpmf));
          text += ch;
        } else {
          const s = typeof t === 'string' ? t : String(t);
          text += s.trim() ? s : ' ';
        }
      }
      rest = '';
    };
    for (let i = 0; i < braille.length;) {
      let hit = null, len = Math.min(maxLen, braille.length - i);
      for (; len >= 2 && !hit; len--) hit = keys.get(braille.substr(i, len));
      if (!hit) { rest += braille[i++]; continue; }
      flush();
      count++;
      text += hit.ch;
      if (isSpelled(hit.ch)) spelled.push(hit.bpmf);
      i += len + 1;
    }
    flush();
    return { text, count, spelled };
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
