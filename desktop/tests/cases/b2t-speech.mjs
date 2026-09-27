// 點字轉文字的「🔊 報讀」區塊：朗讀內容「轉出的文字」／「點字讀音」（注音音節換成同音字、UEB 英文反向翻譯）
export default {
  name: '點字轉文字的報讀區塊（點字讀音）',
  needsApp: true,
  async run({ cdp, check, win, doc, waitFor, sleep, realClick }) {
    const W = win('frame-g2'), D = doc('frame-g2');
    await cdp.ev(`document.getElementById('tab-g2').click()`);
    await sleep(500);
    check('注音點字引擎載入完成', await waitFor(cdp, `!!${W}.eval('svcMcB')`, 20000));

    // 「銀行」的注音點字 + 英文 hello（UEB）
    const brl = await cdp.ev(`(() => { const c = ${W}.mcbopomofo.BopomofoBrailleConverter;
      return ['ㄧㄣˊ', 'ㄏㄤˊ'].map(s => c.convertBpmfToBraille(s).trim()).join(''); })()`);
    const setInput = t => cdp.ev(`(() => { const e = ${D}.getElementById('input-text'); e.value = ${JSON.stringify(t)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await setInput(brl + '⠀⠓⠑⠇⠇⠕');
    await waitFor(cdp, `${D}.getElementById('output-text').value.length > 0`, 5000);

    check('有報讀區塊與「朗讀內容」選單', await cdp.ev(`!!${D}.getElementById('b2t-speech') && ${D}.getElementById('b2t-speech-source').options.length === 2`));
    await cdp.ev(`${D}.getElementById('b2t-speech').open = true`);
    const out = await cdp.ev(`${D}.getElementById('output-text').value`);
    check('預設念「轉出的文字」', await waitFor(cdp, `${D}.getElementById('b2t-speech').speechText === ${JSON.stringify(out)}`, 5000),
      await cdp.ev(`${D}.getElementById('b2t-speech').speechText`));

    await cdp.ev(`(() => { const s = ${D}.getElementById('b2t-speech-source'); s.value = 'reading'; s.dispatchEvent(new Event('change')); })()`);
    const reading = await waitFor(cdp, `/音節/.test(${D}.getElementById('b2t-speech-st').textContent) && ${D}.getElementById('b2t-speech').speechText`, 8000);
    check('點字讀音：ㄏㄤˊ 念成念法固定的「航」', /航/.test(reading || ''), reading);
    check('點字讀音：英文反向翻譯', /hello/i.test(reading || ''), reading);
    const note = await cdp.ev(`${D}.getElementById('b2t-speech-st').textContent`);
    check('狀態列出音節數與英文段數', /注音 2 個音節/.test(note) && /英文 1 段/.test(note), note);

    // 改輸入自動更新；沒有對應字的音節念注音加聲調並列在狀態列：
    // ㄟˋ、ㄓㄨㄞ 字典（DictSwitcher 1.5.0）寫成注音
    const rare = await cdp.ev(`['ㄟˋ', 'ㄓㄨㄞ'].map(s => ${W}.mcbopomofo.BopomofoBrailleConverter.convertBpmfToBraille(s).trim()).join('')`);
    await setInput(brl + rare);
    const note2 = await waitFor(cdp, `/改念注音/.test(${D}.getElementById('b2t-speech-st').textContent) && ${D}.getElementById('b2t-speech-st').textContent`, 8000);
    check('改輸入後自動更新；沒有對應字的音節列在狀態列', /ㄟˋ/.test(note2 || '') && /ㄓㄨㄞ/.test(note2 || ''), note2 || await cdp.ev(`${D}.getElementById('b2t-speech-st').textContent`));
    const rareText = await cdp.ev(`${D}.getElementById('b2t-speech').speechText`);
    check('沒有對應字的音節念注音加聲調（ㄟ第四聲、ㄓㄨㄞ第一聲）', /ㄟ第四聲ㄓㄨㄞ第一聲/.test(rareText), rareText);

    // DictSwitcher 補上的音節（ㄘㄡˋ 湊、ㄙㄨㄣˋ 潠）與改過的 ㄏㄞˊ（孩），不列在狀態列
    const sup = await cdp.ev(`['ㄘㄡˋ', 'ㄙㄨㄣˋ', 'ㄏㄞˊ'].map(s => ${W}.mcbopomofo.BopomofoBrailleConverter.convertBpmfToBraille(s).trim()).join('')`);
    await setInput(sup);
    const supText = await waitFor(cdp, `/湊潠孩/.test(${D}.getElementById('b2t-speech').speechText) && ${D}.getElementById('b2t-speech').speechText`, 8000);
    const supNote = await cdp.ev(`${D}.getElementById('b2t-speech-st').textContent`);
    check('補上的音節念成 Hanhan 念對的字（湊、潠、孩），不列在狀態列', /湊潠孩/.test(supText || '') && !/改念注音/.test(supNote), `${supText}｜${supNote}`);

    // 從左到右切音節：ㄦ 跟在其他音節後面（McBopomofo 會當成兒化韻併進前一個音節）、輕聲後面接零聲母
    // 用一般的句子（太短或三聲太多，頁面會判斷成英文點字）：他的女兒來了，好的安排
    const er = await cdp.ev(`['ㄊㄚ', 'ㄉㄜ˙', 'ㄋㄩˇ', 'ㄦˊ', 'ㄌㄞˊ', 'ㄌㄜ˙', 'ㄏㄠˇ', 'ㄉㄜ˙', 'ㄢ', 'ㄆㄞˊ'].map(s => ${W}.mcbopomofo.BopomofoBrailleConverter.convertBpmfToBraille(s).trim()).join('')`);
    await setInput(er);
    const erText = await waitFor(cdp, `/他/.test(${D}.getElementById('b2t-speech').speechText) && ${D}.getElementById('b2t-speech').speechText`, 8000);
    check('ㄦ 接在音節後面、輕聲後面接零聲母都切對（女而、的安；ㄦˊ 的固定字是「而」）', /女而/.test(erText || '') && /的安/.test(erText || ''),
      erText || await cdp.ev(`${D}.getElementById('b2t-speech').speechText + '｜' + ${D}.getElementById('b2t-speech-st').textContent`));

    // 點一行朗讀
    await realClick(cdp, 'frame-g2', '#b2t-speech-list .sb-line[data-idx="0"]');
    check('點一行開始朗讀', await waitFor(cdp, `${W}.speechSynthesis.speaking`, 5000));
    await cdp.ev(`${D}.getElementById('b2t-speech-stop').click()`);
    await cdp.ev(`(() => { const s = ${D}.getElementById('b2t-speech-source'); s.value = 'text'; s.dispatchEvent(new Event('change')); })()`);
  },
};
