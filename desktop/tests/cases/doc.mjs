// 文件整理（網頁 pdf-to-accessible.html 本身的功能）：朗讀內容三種模式、起始句保留、匯出內容與語音對應、轉換中按播放、沒有算式、單個 $
export default {
  name: '文件整理（朗讀內容模式與匯出）',
  needsApp: true,
  async run({ cdp, check, win, doc, waitFor, saveDialog, outPath, audioKind, sleep }) {
    const W = win('frame-p2a'), D = doc('frame-p2a');
    // 攔截送給原生層的訊息，檢查匯出的文字與語音
    await cdp.ev(`(() => { const h = window.chrome.webview; window.__sent = []; const o = h.postMessage.bind(h);
      h.postMessage = m => { window.__sent.push(m); o(m); }; })()`);
    await cdp.ev(`document.getElementById('tab-p2a').click()`);
    await sleep(800);

    const sentences = () => cdp.ev(`[...${D}.querySelectorAll('#tts-text-display .tts-sent')].map(s => ({ text: s.textContent, math: s.querySelectorAll('mjx-container').length }))`);
    const speak = () => cdp.ev(`${W}.eval('_ttsSentences')`);
    const setMode = async m => { await cdp.ev(`${D}.querySelector('input[name=tts-mode][value=${m}]').click()`); await sleep(400); };
    const status = () => cdp.ev(`${D}.getElementById('tts-status').textContent`);

    const text = String.raw`第一題：若 \(x^2=16\)，則 x 等於多少？
第二題：已知 \(n!=120\)，求 n。
第三題：這一句沒有算式。`;
    await cdp.ev(`${W}.setEditorText(${JSON.stringify(text)})`);
    await cdp.ev(`${W}.switchTab('tts')`);
    check('有算式時顯示「朗讀內容」選項', await waitFor(cdp, `!${D}.getElementById('tts-mode').hidden`, 3000));
    check('預設為「報讀文字」', await cdp.ev(`${D}.querySelector('input[name=tts-mode]:checked').value`) === 'speech');
    await waitFor(cdp, `/算式已轉成報讀文字/.test(${D}.getElementById('tts-status').textContent)`, 10000);

    let s = await sentences();
    check('切句避開算式內部（3 句，n! 沒被切開）', s.length === 3, JSON.stringify(s.map(x => x.text)));
    check('報讀文字：顯示轉換後的算式', /x 平方 等於 16/.test(s[0]?.text) && /n 階乘 等於 120/.test(s[1]?.text), JSON.stringify(s.map(x => x.text)));
    check('報讀文字：朗讀內容與顯示相同', JSON.stringify((await speak())) === JSON.stringify(s.map(x => x.text)));

    // 點第 2 句設定起點（會觸發網頁朗讀，立刻停止）
    await cdp.ev(`${D}.querySelector('.tts-sent[data-idx="1"]').click()`);
    await sleep(300);
    await cdp.ev(`${W}.ttsStop()`);
    await sleep(300);

    await setMode('render');
    await waitFor(cdp, `${D}.querySelectorAll('#tts-text-display mjx-container').length >= 2`, 8000);
    s = await sentences();
    check('數學式：算式渲染成數學式', s[0]?.math >= 1 && s[1]?.math >= 1, JSON.stringify(s));
    check('數學式：朗讀的仍是報讀文字', /x 平方/.test((await speak())[0]));
    check('切換模式後保留起始句（第 2 句）', await cdp.ev(`${W}.eval('_ttsStartIdx')`) === 1);

    await setMode('raw');
    s = await sentences();
    check('原文：顯示 LaTeX 原文', s[0]?.text.includes(String.raw`\(x^2=16\)`), s[0]?.text);
    check('原文：朗讀 LaTeX 原文', (await speak())[0].includes(String.raw`\(x^2=16\)`));

    // 報讀文字模式、指定語音 Yating、從第 2 句匯出 MP3
    await setMode('speech');
    const voice = await cdp.ev(`(() => { const s = ${D}.getElementById('tts-voice'); const o = [...s.options].find(o => /Yating/.test(o.value)); if (o) s.value = o.value; return s.value; })()`);
    await cdp.ev(`${W}.eval('_ttsStartIdx = 1')`);
    const path = outPath('doc.mp3');
    await cdp.ev(`${D}.getElementById('btn-tts-export').click()`);
    const r = await saveDialog(path);
    check('匯出：存檔視窗處理完成、檔案寫出', r.ok, r.out);
    check('匯出：MP3 格式正確', audioKind(path) === 'mp3', audioKind(path));
    const sent = await cdp.ev(`window.__sent.filter(m => m.type === 'export').pop()`);
    check('匯出：從第 2 句開始、內容是報讀文字', /^第二題：已知 n 階乘 等於 120/.test(sent?.text || ''), sent?.text);
    if (/Yating/.test(voice)) check('匯出：網頁選的 Yating 對應到 Windows 的 Yating 語音', /Yating/i.test(sent?.voiceId || ''), sent?.voiceId);
    check('匯出：狀態顯示已儲存與算式數量', await waitFor(cdp, `/^已儲存.*算式已轉成報讀文字/.test(${D}.getElementById('tts-status').textContent)`, 5000), await status());

    // 換新內容後馬上按播放：要等轉換完成再念報讀文字
    await cdp.ev(`${W}.switchTab('raw')`);
    await cdp.ev(`${W}.setEditorText(${JSON.stringify(String.raw`立刻播放測試：\(\sqrt{2}\approx 1.414\)。`)})`);
    await cdp.ev(`${W}.switchTab('tts')`);
    await cdp.ev(`${D}.getElementById('btn-tts-play').click()`);
    const playing = await waitFor(cdp, `${W}.eval('ttsPlaying') && ${W}.eval('_ttsSentences').join('')`, 8000);
    check('轉換中按播放：等轉完再念報讀文字', /根號 2/.test(playing || ''), playing);
    await cdp.ev(`${W}.ttsStop()`);

    // 單個 $...$（文件整理支援），金額不當算式
    await cdp.ev(`${W}.switchTab('raw')`);
    await cdp.ev(`${W}.setEditorText(${JSON.stringify(String.raw`若 $x^2=16$，則 x 等於多少？
售價 $100 和 $200 元，不是算式。
獨立算式 $$\frac{1}{2}$$ 與 \(\sqrt{2}\)。`)})`);
    await cdp.ev(`${W}.switchTab('tts')`);
    await waitFor(cdp, `/3 個算式已轉成報讀文字/.test(${D}.getElementById('tts-status').textContent)`, 10000);
    const sp = await speak();
    check('單個 $：轉成報讀文字', /x 平方 等於 16/.test(sp[0]), sp[0]);
    check('單個 $：金額不當算式', sp[1]?.includes('$100 和 $200'), sp[1]);
    check('$$ 與 \\( \\)：轉成報讀文字', /2 分之 1/.test(sp[2]) && /根號 2/.test(sp[2]), sp[2]);
    await setMode('render');
    const n = await waitFor(cdp, `${D}.querySelectorAll('#tts-text-display mjx-container').length >= 3 && ${D}.querySelectorAll('#tts-text-display mjx-container').length`, 8000);
    check('單個 $：數學式模式渲染（共 3 個算式）', n === 3, `${n} 個`);
    await setMode('speech');

    // 沒有算式：選項隱藏、狀態清空，照網頁原本方式
    await cdp.ev(`${W}.switchTab('raw')`);
    await cdp.ev(`${W}.setEditorText('沒有算式的文件。第二句。')`);
    await cdp.ev(`${W}.switchTab('tts')`);
    await sleep(400);
    check('沒有算式：選項隱藏', await cdp.ev(`${D}.getElementById('tts-mode').hidden`));
    check('沒有算式：狀態清空', (await status()) === '', await status());
    check('沒有算式：照原本方式切句', JSON.stringify(await speak()) === JSON.stringify(['沒有算式的文件。', '第二句。']));
  },
};
