// 數學點字：「🔊 報讀」區塊（網頁的 speech-block.js + math-speech.js）
// 算式轉 MathCAT 報讀文字、朗讀、自動更新、匯出 MP3（桌面版）、點字→數學方向、單個 $（沿用頁面的 MATH_RE）
export default {
  name: '數學點字的報讀區塊',
  needsApp: true,
  async run({ cdp, check, doc, win, waitFor, saveDialog, outPath, audioKind, sleep, realClick, captureDownloads, takeDownload }) {
    const D = doc('frame-nc'), W = win('frame-nc');
    const setInput = async (id, text) => {
      await cdp.ev(`(() => { const t = ${D}.getElementById('${id}'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    };
    const blockText = id => cdp.ev(`${D}.getElementById('${id}').speechText`);
    const blockSt = id => cdp.ev(`${D}.getElementById('${id}-st').textContent`);

    await cdp.ev(`document.getElementById('tab-nc').click()`);
    await sleep(800);
    await cdp.ev(`${D}.getElementById('t-l2n').click()`);
    const input = String.raw`設 \(\overline{AB}\perp\overline{CD}\)，則 \(\angle ABC=90^\circ\)。解方程式 \(x^2-5x+6=0\)，得 \(x=\frac{5\pm\sqrt{1}}{2}\)。錯誤測試 \(\frac{1}{\)。`;
    await setInput('l2n-in', input);
    await sleep(1500);

    check('舊的右下角面板已經拿掉（沒有 #vtd-btn）', !(await cdp.ev(`!!${D}.getElementById('vtd-btn')`)));
    check('兩個報讀區塊都在，預設收合', await cdp.ev(`!!${D}.getElementById('l2n-speech') && !!${D}.getElementById('n2l-speech') && !${D}.getElementById('l2n-speech').open`));
    check('桌面版顯示「匯出音檔」按鈕', await waitFor(cdp, `!${D}.getElementById('l2n-speech-export').hidden`, 3000));

    // 焦點在首頁分頁列時按 Alt+Shift+A：展開目前看得到的報讀區塊，焦點移到「朗讀」
    await cdp.ev(`document.getElementById('tab-nc').focus()`);
    await cdp.key('KeyA', 'A', 1 | 8);
    check('Alt+Shift+A 展開報讀區塊', await waitFor(cdp, `${D}.getElementById('l2n-speech').open`, 3000));
    check('焦點移到「朗讀」', await waitFor(cdp, `${D}.activeElement && ${D}.activeElement.id === 'l2n-speech-play'`, 3000));

    await waitFor(cdp, `/個算式/.test(${D}.getElementById('l2n-speech-st').textContent)`, 20000);
    const spoken = await blockText('l2n-speech');
    check('算式轉成報讀文字', /x 平方 減 5 x 加 6/.test(spoken) && /線段 大寫 a 大寫 b/.test(spoken), spoken);
    check('錯的算式念成「無法轉換的算式」', /無法轉換的算式/.test(spoken) && !/\\frac/.test(spoken), spoken);
    check('狀態列出算式數量與無法轉換的算式', /共 5 個算式，1 個無法轉換/.test(await blockSt('l2n-speech')), await blockSt('l2n-speech'));

    await realClick(cdp, 'frame-nc', 'l2n-speech-play');   // 真的點，瀏覽器才允許出聲
    check('朗讀：開始念', await waitFor(cdp, `${W}.speechSynthesis.speaking && /朗讀中/.test(${D}.getElementById('l2n-speech-st').textContent)`, 5000),
      await blockSt('l2n-speech'));
    await cdp.ev(`${D}.getElementById('l2n-speech-stop').click()`);
    check('停止：不再出聲', await waitFor(cdp, `!${W}.speechSynthesis.speaking && ${D}.getElementById('l2n-speech-st').textContent === '已停止'`, 3000));

    // 逐行清單：點第 2 行就從第 2 行念、念到的行反白；方向鍵移動；Esc 停止
    await setInput('l2n-in', String.raw`第一行 \(a^2\)。` + '\n' + String.raw`第二行 \(b^2\)。` + '\n' + String.raw`第三行 \(c^2\)。`);
    const LINE = i => `${D}.querySelector('#l2n-speech-list .sb-line[data-idx="${i}"]')`;
    check('報讀文字一行一個項目（3 行）', await waitFor(cdp, `${D}.querySelectorAll('#l2n-speech-list .sb-line').length === 3 && /c 平方/.test(${LINE(2)}.textContent)`, 10000),
      await cdp.ev(`[...${D}.querySelectorAll('#l2n-speech-list .sb-line')].map(b => b.textContent).join(' / ')`));
    await realClick(cdp, 'frame-nc', '#l2n-speech-list .sb-line[data-idx="1"]');
    check('點第 2 行：從第 2 行開始念', await waitFor(cdp, `/從第 2 行開始朗讀/.test(${D}.getElementById('l2n-speech-st').textContent)`, 3000), await blockSt('l2n-speech'));
    check('念到的行反白（第 2 行）', await waitFor(cdp, `${LINE(1)}.classList.contains('active') && !${LINE(0)}.classList.contains('active')`, 5000));
    await cdp.ev(`${LINE(1)}.focus(); ${LINE(1)}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    check('Esc 停止、取消反白', await waitFor(cdp, `!${W}.speechSynthesis.speaking && !${D}.querySelector('#l2n-speech-list .sb-line.active')`, 3000));
    await cdp.ev(`${LINE(1)}.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
    check('方向鍵移到下一行（只移動、不開始念）', await waitFor(cdp, `${D}.activeElement === ${LINE(2)} && ${LINE(2)}.tabIndex === 0 && ${LINE(1)}.tabIndex === -1`, 2000)
      && !(await cdp.ev(`${W}.speechSynthesis.speaking`)));

    // 存報讀檔：下載 .txt，內容就是報讀文字
    await captureDownloads(cdp, 'frame-nc');
    await cdp.ev(`${D}.getElementById('l2n-speech-save').click()`);
    const saved = await waitFor(cdp, `document.getElementById('frame-nc').contentWindow.__downloads.length`, 3000) && await takeDownload(cdp, 'frame-nc');
    check('存報讀檔：檔名 .txt、內容是報讀文字', saved && /\.txt$/.test(saved.name) && saved.text === (await blockText('l2n-speech')) && /c 平方/.test(saved.text), JSON.stringify(saved && { name: saved.name, len: saved.text.length }));
    check('存報讀檔：狀態顯示已存', /^已存報讀檔/.test(await blockSt('l2n-speech')), await blockSt('l2n-speech'));

    // 展開時改輸入，報讀文字自動更新
    await setInput('l2n-in', String.raw`更新測試 \(y^2=9\)。`);
    check('改輸入後自動更新', !!(await waitFor(cdp, `/y 平方 等於 9/.test(${D}.getElementById('l2n-speech').speechText)`, 8000)), await blockText('l2n-speech'));

    // 匯出 MP3
    await setInput('l2n-in', input);
    await waitFor(cdp, `/共 5 個算式/.test(${D}.getElementById('l2n-speech-st').textContent)`, 10000);
    const path = outPath('math.mp3');
    await cdp.ev(`${D}.getElementById('l2n-speech-export').click()`);
    const r = await saveDialog(path);
    check('匯出 MP3：檔案寫出、格式正確', r.ok && audioKind(path) === 'mp3', r.out);
    check('匯出後狀態顯示已儲存', await waitFor(cdp, `/^已儲存/.test(${D}.getElementById('l2n-speech-st').textContent)`, 5000), await blockSt('l2n-speech'));

    // 點字→數學：把 Nemeth 點字貼回去，報讀 LaTeX 輸出
    const brl = (await cdp.ev(`${D}.getElementById('l2n-out').textContent`)).split('\n')[0];
    await cdp.ev(`${D}.getElementById('t-n2l').click()`);
    await sleep(400);
    await setInput('n2l-in', brl);
    await sleep(1500);
    await cdp.ev(`${D}.getElementById('n2l-speech').open = true`);
    const sp2 = await waitFor(cdp, `/個算式/.test(${D}.getElementById('n2l-speech-st').textContent) && ${D}.getElementById('n2l-speech').speechText`, 20000);
    check('點字→數學：LaTeX 輸出的算式轉成報讀文字', /x 平方 減 5 x 加 6/.test(sp2 || ''), sp2);

    // 單個 $：數學點字頁轉點字認 \( \) 與 $ $，報讀也一樣
    await cdp.ev(`${D}.getElementById('t-l2n').click()`);
    await setInput('l2n-in', String.raw`若 $x^2$ 和 \(y^2\)。`);
    const sp3 = await waitFor(cdp, `/共 2 個算式/.test(${D}.getElementById('l2n-speech-st').textContent) && ${D}.getElementById('l2n-speech').speechText`, 10000);
    check('單個 $ 也當算式（和轉點字一致）', /x 平方/.test(sp3 || '') && /y 平方/.test(sp3 || '') && !(sp3 || '').includes('$'), sp3);

    // Nemeth 輸出和 n2l 的 LaTeX 輸出一樣：預設收合（輸入、預覽加高），收合時轉換與報讀照常
    const st = m => cdp.ev(`({ shown: ${D}.getElementById('${m}-out').style.display !== 'none', exp: ${D}.getElementById('${m}-out-toggle').getAttribute('aria-expanded'),
      label: ${D}.getElementById('${m}-out-toggle').textContent.trim(), tall: ${D}.getElementById('p-${m}').classList.contains('out-collapsed') })`);
    let s = await st('l2n');
    check('Nemeth 輸出預設收合（同 n2l）', !s.shown && s.exp === 'false' && s.label === '▶ 展開' && s.tall, JSON.stringify(s));
    await setInput('l2n-in', String.raw`解 \(z^2=4\)。`);
    const sp4 = await waitFor(cdp, `/z 平方/.test(${D}.getElementById('l2n-speech').speechText) && ${D}.getElementById('l2n-out').textContent`, 10000);
    check('收合時照常轉點字、報讀', /[⠀-⣿]/.test(sp4 || ''), sp4);
    await cdp.ev(`${D}.getElementById('l2n-out-toggle').click()`);
    s = await st('l2n');
    check('按「展開」顯示 Nemeth 輸出', s.shown && s.exp === 'true' && s.label === '▼ 收合' && !s.tall, JSON.stringify(s));
    await cdp.ev(`${D}.getElementById('l2n-out-toggle').click()`);
    s = await st('l2n');
    const n = await st('n2l');
    check('再按一次收合；n2l 不受影響', !s.shown && s.exp === 'false' && s.tall && !n.shown && n.tall, JSON.stringify({ s, n }));
  },
};
