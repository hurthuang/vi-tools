// 模擬這台電腦沒有臺灣中文語音：面板與文件整理都要顯示安裝方法
export default {
  name: '缺臺灣中文語音的提示',
  needsApp: true,
  async run({ cdp, check, win, doc, waitFor, sleep }) {
    // 攔截分頁送給原生層的 getVoices：不轉送，直接用同一個 fid／reqId 回一份「只有英文語音」的清單
    await cdp.ev(`(() => {
      const h = window.chrome.webview; const o = h.postMessage.bind(h); window.__faked = 0;
      h.postMessage = m => {
        if (m.type !== 'getVoices') return o(m);
        window.__faked++;
        const voices = [{ id: 'en1', name: 'Microsoft David', lang: 'en-US', isDefault: true }];
        setTimeout(() => h.dispatchEvent(new MessageEvent('message', { data: { type: 'voices', voices, fid: m.fid, reqId: m.reqId } })), 0);
      };
    })()`);
    await cdp.ev(`${win('frame-g2')}.location.reload(); ${win('frame-p2a')}.location.reload(); ${win('frame-nc')}.location.reload()`);
    check('三個分頁都要了語音清單', await waitFor(cdp, `window.__faked >= 3`, 15000));
    await sleep(800);

    const G = doc('frame-g2'), P = doc('frame-p2a');
    const warn = await cdp.ev(`${G}.getElementById('b2t-speech-voice-warn').hidden ? '' : ${G}.getElementById('b2t-speech-voice-warn').textContent`);
    check('點字轉文字報讀區塊顯示警告與安裝方法', /找不到臺灣中文語音.*新增語音/.test(warn), warn);
    const dwarn = await cdp.ev(`${P}.getElementById('tts-voice-warn').hidden ? '' : ${P}.getElementById('tts-voice-warn').textContent`);
    check('文件整理顯示警告與安裝方法', /找不到臺灣中文語音.*新增語音/.test(dwarn), dwarn);
    const N = doc('frame-nc');
    const nwarn = await cdp.ev(`${N}.getElementById('l2n-speech-voice-warn').hidden ? '' : ${N}.getElementById('l2n-speech-voice-warn').textContent`);
    check('數學點字報讀區塊顯示警告與安裝方法', /找不到臺灣中文語音.*新增語音/.test(nwarn), nwarn);
  },
};
