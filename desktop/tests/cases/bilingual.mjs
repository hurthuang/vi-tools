// 中英分語音（網頁的 voice-settings.js + lang-segments.js，用在報讀區塊）
// 預設：有英文語音就自動切換；兩個以上英文單字才換；語音設定改了各頁同步；匯出時傳 segments 與停頓
export default {
  name: '中英分語音（報讀區塊）',
  needsApp: true,
  async run({ cdp, check, win, doc, waitFor, sleep, realClick }) {
    const W = win('frame-nc'), D = doc('frame-nc');
    await cdp.ev(`document.getElementById('tab-nc').click()`);
    await sleep(500);
    const setInput = t => cdp.ev(`(() => { const e = ${D}.getElementById('l2n-in'); e.value = ${JSON.stringify(t)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    // 攔截交給瀏覽器語音引擎的每一段
    await cdp.ev(`(() => { const w = ${W}; w.__utt = []; const s = w.speechSynthesis, orig = s.speak.bind(s);
      s.speak = u => { w.__utt.push({ text: u.text, voice: u.voice ? u.voice.name : '', lang: u.lang }); orig(u); }; })()`);
    const playAndCapture = async () => {
      await cdp.ev(`${W}.__utt = []`);
      await realClick(cdp, 'frame-nc', 'l2n-speech-play');
      await waitFor(cdp, `${W}.__utt.length > 0`, 5000);
      await sleep(300);
      const utt = await cdp.ev(`${W}.__utt`);
      await cdp.ev(`${D}.getElementById('l2n-speech-stop').click()`);
      return utt;
    };
    const setVS = patch => cdp.ev(`${W}.vitoolsVoiceSettings.set(${JSON.stringify(patch)})`);

    await setInput('請開啟 Microsoft Word 檔案，我們用 NVDA 讀。');
    await cdp.ev(`${D}.getElementById('l2n-speech').open = true`);
    await waitFor(cdp, `${D}.getElementById('l2n-speech').speechText.includes('Microsoft')`, 8000);

    check('語音設定可展開，裡面有英文語音與切換條件', await cdp.ev(`!!${D}.getElementById('l2n-speech-settings') && !!${D}.getElementById('l2n-speech-vs-en') && !!${D}.getElementById('l2n-speech-vs-rule')`));
    const enOpt = await cdp.ev(`${D}.getElementById('l2n-speech-vs-en').selectedOptions[0].text`);
    check('預設「自動」：有英文語音就切換', /^自動（.+）$/.test(enOpt) && !/沒有英文語音/.test(enOpt), enOpt);
    check('桌面版顯示「匯出時換語音的停頓」', await cdp.ev(`!${D}.getElementById('l2n-speech-vs-pause').closest('label').hidden`));

    let utt = await playAndCapture();
    const en = utt.find(u => u.text.includes('Microsoft Word')), zhPart = utt.find(u => u.text.includes('請開啟'));
    check('兩個以上英文單字（Microsoft Word）用英文語音', en && /^en/i.test(en.lang), JSON.stringify(utt));
    check('中文與單獨的縮寫（NVDA）用中文語音', zhPart && /^zh/i.test(zhPart.lang) && utt.some(u => u.text.includes('NVDA') && /^zh/i.test(u.lang)), JSON.stringify(utt));

    await setVS({ minWords: 1 });
    utt = await playAndCapture();
    check('切換條件「每個英文字」：NVDA 也用英文語音', utt.some(u => u.text.trim() === 'NVDA' && /^en/i.test(u.lang)), JSON.stringify(utt));

    await setVS({ enVoice: 'off' });
    await sleep(300);
    check('選「不切換」時隱藏切換條件', await cdp.ev(`${D}.getElementById('l2n-speech-vs-rule').closest('label').hidden`));
    utt = await playAndCapture();
    check('不切換：全部用中文語音', utt.length > 0 && utt.every(u => /^zh/i.test(u.lang)), JSON.stringify(utt));

    // 設定各頁共用：數學點字改的設定，文字轉點字的報讀區塊也跟著變
    await setVS({ enVoice: 'auto', minWords: 2, pause: 'min' });
    await sleep(500);
    const bt = await cdp.ev(`({ en: ${doc('frame-bt')}.getElementById('bt-speech-vs-en').value, pause: ${doc('frame-bt')}.getElementById('bt-speech-vs-pause').value })`);
    check('設定各頁同步（文字轉點字也是自動、最短停頓）', bt.en === 'auto' && bt.pause === 'min', JSON.stringify(bt));

    // 匯出：送給原生層的 segments 與 pause
    await cdp.ev(`(() => { const h = window.chrome.webview; window.__sent = []; const o = h.postMessage.bind(h);
      h.postMessage = m => { window.__sent.push(m); if (m.type !== 'export') o(m); }; })()`);   // 攔下 export 不真的跳存檔視窗
    await cdp.ev(`${D}.getElementById('l2n-speech-export').click()`);
    const sent = await waitFor(cdp, `window.__sent.find(m => m.type === 'export')`, 5000);
    const segs = (sent && sent.segments) || [];
    const voices = await cdp.ev(`window.vitoolsDesktop.getVoices()`);
    const langOf = id => (voices.find(v => v.id === id) || {}).lang || '';
    check('匯出：分段送出，英文段用 Windows 英文語音', segs.some(s => s.text.includes('Microsoft Word') && /^en/i.test(langOf(s.voiceId)))
      && segs.some(s => s.text.includes('請開啟') && /^zh/i.test(langOf(s.voiceId))), JSON.stringify(segs));
    check('匯出：帶上停頓設定（最短）', sent && sent.pause === 'min', sent && sent.pause);
    await setVS({ pause: 'natural' });

    // 文件整理：播放時英文段用英文語音、朗讀位置標示照常；匯出送出 segments
    const PW = win('frame-p2a'), PD = doc('frame-p2a');
    await cdp.ev(`document.getElementById('tab-p2a').click()`);
    await sleep(500);
    await cdp.ev(`(() => { const w = ${PW}; w.__utt = []; const s = w.speechSynthesis, orig = s.speak.bind(s);
      s.speak = u => { w.__utt.push({ text: u.text, lang: u.lang }); orig(u); }; })()`);
    await cdp.ev(`${PW}.setEditorText('請開啟 Microsoft Word 檔案，按下 Save As 存檔。第二句沒有英文。')`);
    await cdp.ev(`${PW}.switchTab('tts')`);
    await sleep(300);
    check('文件整理有「中英語音設定」', await cdp.ev(`!!${PD}.getElementById('tts-bilingual') && !!${PD}.getElementById('tts-vs-en')`));
    await realClick(cdp, 'frame-p2a', 'btn-tts-play');
    await waitFor(cdp, `${PW}.__utt.length > 0`, 5000);
    const putt = await cdp.ev(`${PW}.__utt`);
    check('文件整理播放：英文段用英文語音、中文段用中文語音',
      putt.some(u => u.text.includes('Microsoft Word') && /^en/i.test(u.lang)) && putt.some(u => u.text.includes('請開啟') && /^zh/i.test(u.lang)), JSON.stringify(putt));
    check('文件整理播放：朗讀位置標示照常', await waitFor(cdp, `!!${PD}.querySelector('#tts-text-display .tts-active')`, 8000));
    await cdp.ev(`${PW}.ttsStop()`);
    await sleep(300);
    check('文件整理：停止後不再出聲', !(await cdp.ev(`${PW}.speechSynthesis.speaking`)));

    await cdp.ev(`window.__sent = []`);
    await cdp.ev(`${PD}.getElementById('btn-tts-export').click()`);
    const psent = await waitFor(cdp, `window.__sent.find(m => m.type === 'export')`, 5000);
    check('文件整理匯出：分段送出，英文段用 Windows 英文語音',
      ((psent && psent.segments) || []).some(s => s.text.includes('Save As') && /^en/i.test(langOf(s.voiceId))), JSON.stringify(psent && psent.segments));
  },
};
