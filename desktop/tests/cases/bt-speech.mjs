// 文字轉點字的「🔊 報讀」區塊：朗讀內容「原文」／「點字讀音」（照轉出來的點字念：多音字、UEB 縮寫、Nemeth）
export default {
  name: '文字轉點字的報讀區塊（點字讀音）',
  needsApp: true,
  async run({ cdp, check, win, doc, waitFor, sleep, realClick }) {
    const W = win('frame-bt'), D = doc('frame-bt');
    await cdp.ev(`document.getElementById('tab-bt').click()`);
    await sleep(500);
    check('注音點字引擎載入完成', await waitFor(cdp, `${W}.eval('mcbReady')`, 20000));

    const setInput = t => cdp.ev(`(() => { const e = ${D}.getElementById('input-text'); e.value = ${JSON.stringify(t)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const setMode = v => cdp.ev(`(() => { const s = ${D}.getElementById('en-mode'); s.value = '${v}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const setSource = v => cdp.ev(`(() => { const s = ${D}.getElementById('bt-speech-source'); s.value = '${v}'; s.dispatchEvent(new Event('change')); })()`);
    const speech = () => cdp.ev(`${D}.getElementById('bt-speech').speechText`);
    const st = () => cdp.ev(`${D}.getElementById('bt-speech-st').textContent`);

    await setMode('ueb-g2');
    await setInput('我去銀行領錢，然後行走回家。the children');
    await waitFor(cdp, `${D}.getElementById('output-text').value.length > 0`, 8000);

    check('浮動面板不再出現（改由報讀區塊）', await cdp.ev(`!${D}.getElementById('vtd-btn') && !!${D}.getElementById('bt-speech')`));
    await cdp.ev(`${D}.getElementById('bt-speech').open = true`);
    check('預設念「原文」', await waitFor(cdp, `${D}.getElementById('bt-speech').speechText === ${D}.getElementById('input-text').value`, 5000), await speech());

    await setSource('reading');
    const r = await waitFor(cdp, `/音節/.test(${D}.getElementById('bt-speech-st').textContent) && ${D}.getElementById('bt-speech').speechText`, 10000);
    // 「銀行」的行是 ㄏㄤˊ、「行走」的行是 ㄒㄧㄥˊ：點字讀音照點字實際的音，兩個「行」念出不同的字
    const bank = await cdp.ev(`${W}.vitoolsBrlReading.zh(${W}.mcbopomofo.BopomofoBrailleConverter.convertBpmfToBraille('ㄏㄤˊ').trim()).text`);
    const walk = await cdp.ev(`${W}.vitoolsBrlReading.zh(${W}.mcbopomofo.BopomofoBrailleConverter.convertBpmfToBraille('ㄒㄧㄥˊ').trim()).text`);
    check(`點字讀音：兩個「行」照點字念成不同的字（ㄏㄤˊ→${bank}、ㄒㄧㄥˊ→${walk}）`, bank !== walk && (r || '').includes(bank) && (r || '').includes(walk), r);
    check('點字讀音：UEB 二級縮寫反向翻譯回英文', /the children/i.test(r || ''), r);
    check('狀態列出音節數與英文段數', /注音 \d+ 個音節/.test(await st()) && /英文 \d+ 段/.test(await st()), await st());

    // Nemeth 數學
    await cdp.ev(`(() => { const c = ${D}.getElementById('nemeth-mode'); if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
    await setInput('答案是 123。');
    const r2 = await waitFor(cdp, `/數學/.test(${D}.getElementById('bt-speech-st').textContent) && ${D}.getElementById('bt-speech').speechText`, 8000);
    check('Nemeth 數學念成「數學」', /（數學）/.test(r2 || ''), r2 || await st());
    await cdp.ev(`(() => { const c = ${D}.getElementById('nemeth-mode'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); })()`);

    // 點一行朗讀
    await setInput('第一行測試。\n第二行測試。');
    await waitFor(cdp, `${D}.querySelectorAll('#bt-speech-list .sb-line').length === 2`, 8000);
    await realClick(cdp, 'frame-bt', '#bt-speech-list .sb-line[data-idx="1"]');
    check('點第 2 行從那行朗讀', await waitFor(cdp, `/從第 2 行開始朗讀/.test(${D}.getElementById('bt-speech-st').textContent)`, 3000), await st());
    await cdp.ev(`${D}.getElementById('bt-speech-stop').click()`);
    await setSource('text');
  },
};
