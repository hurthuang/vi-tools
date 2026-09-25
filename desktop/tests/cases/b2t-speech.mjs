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

    // 改輸入自動更新；字典沒有的音節（ㄟˋ）改用候選字並列出來
    const rare = await cdp.ev(`${W}.mcbopomofo.BopomofoBrailleConverter.convertBpmfToBraille('ㄟˋ').trim()`);
    await setInput(brl + rare);
    const note2 = await waitFor(cdp, `/改用候選字/.test(${D}.getElementById('b2t-speech-st').textContent) && ${D}.getElementById('b2t-speech-st').textContent`, 8000);
    check('改輸入後自動更新；字典沒有的音節列在狀態列', /ㄟˋ/.test(note2 || ''), note2 || await cdp.ev(`${D}.getElementById('b2t-speech-st').textContent`));
    check('字典沒有的音節仍念出候選字（不是空白）', (await cdp.ev(`${D}.getElementById('b2t-speech').speechText`)).length >= 3);

    // 點一行朗讀
    await realClick(cdp, 'frame-g2', '#b2t-speech-list .sb-line[data-idx="0"]');
    check('點一行開始朗讀', await waitFor(cdp, `${W}.speechSynthesis.speaking`, 5000));
    await cdp.ev(`${D}.getElementById('b2t-speech-stop').click()`);
    await cdp.ev(`(() => { const s = ${D}.getElementById('b2t-speech-source'); s.value = 'text'; s.dispatchEvent(new Event('change')); })()`);
  },
};
