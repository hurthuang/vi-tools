// 點字樂譜（music/）：斷線時 abcjs 與鋼琴音色都改用 app 內附的檔案，五線譜、播放音色、全曲報讀照常可用
export default {
  name: '點字樂譜斷線可用（abcjs、鋼琴音色、全曲報讀）',
  needsApp: true,
  env: { VITOOLS_SIMULATE_OFFLINE: '1' },
  async run({ cdp, check, win, doc, waitFor, realClick }) {
    const MW = win('frame-music'), MD = doc('frame-music');
    check('確實斷線（外部網站連不上）', await cdp.ev(`fetch('https://example.com/').then(() => false, () => true)`));
    await cdp.ev(`document.getElementById('tab-music').click()`);

    check('abcjs 載入（內附）', await waitFor(cdp, `!!(${MW}.ABCJS && ${MW}.ABCJS.renderAbc)`, 15000));
    check('五線譜預覽畫出來', await waitFor(cdp, `!!${MD}.querySelector('#paper svg')`, 15000));
    check('點字編輯區有內容', await waitFor(cdp, `${MD}.getElementById('brl').value.length > 0`));

    // 播放用的鋼琴音色：abcjs 依 soundFontUrl 逐音下載 mp3，要拿到內附的檔案並能解碼
    const sound = await cdp.ev(`(async () => {
      const w = ${MW};
      const url = 'https://cdn.jsdelivr.net/gh/paulrosen/midi-js-soundfonts@cbd6b6f6d1af89ebfb69402860741288f08ff8b7/abcjs/acoustic_grand_piano-mp3/C4.mp3';
      try {
        const buf = await (await w.fetch(url)).arrayBuffer();
        const ctx = new w.OfflineAudioContext(1, 44100, 44100);
        const audio = await ctx.decodeAudioData(buf);
        return audio.duration > 0 ? 'ok' : 'empty';
      } catch (e) { return String(e); }
    })()`);
    check('鋼琴音色（內附 mp3）可下載並解碼', sound === 'ok', sound);
    // 真的按「▶ 播放」（滑鼠事件才算使用者操作，瀏覽器才允許出聲）：音色全部載入後狀態變成「播放中」
    await realClick(cdp, 'frame-music', 'btn-play');
    const st = await waitFor(cdp, `/播放中|播放結束|無法播放/.test(${MD}.getElementById('player-status').textContent) && ${MD}.getElementById('player-status').textContent`, 30000);
    check('按播放後開始播放（音色全部用內附）', /播放中|播放結束/.test(st || ''), st || await cdp.ev(`${MD}.getElementById('player-status').textContent`));
    await cdp.ev(`${MD}.getElementById('btn-stop').click()`);

    // 全曲報讀區塊（工具集共用的 speech-block.js）：有報讀文字，桌面版有「匯出音檔」
    await cdp.ev(`(() => { const d = ${MD}.getElementById('score-speech'); d.open = true; d.dispatchEvent(new Event('toggle')); })()`);
    const text = await waitFor(cdp, `${MD}.getElementById('score-speech') && ${MD}.getElementById('score-speech').speechText`);
    check('全曲報讀有每小節的文字', /第 1 小節/.test(text || ''), (text || '').slice(0, 60));
    check('桌面版顯示「匯出音檔」', await waitFor(cdp, `!${MD}.getElementById('score-speech-export').hidden`));
    check('六點輸入改用工具集的浮動面板', await cdp.ev(`!!${MD}.getElementById('brl-panel-btn') && ${MD}.getElementById('six-key').closest('label').hidden`));

    check('頁面沒有丟出錯誤', cdp.exceptions.length === 0, cdp.exceptions.map(e => e.split('\n')[0]).join('；'));
  },
};
