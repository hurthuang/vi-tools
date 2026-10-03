import { VER, re } from '../version.mjs';

// window.vitoolsDesktop：桌面版提供給網頁的功能（第 2 步起網頁透過它使用桌面功能）
export default {
  name: 'window.vitoolsDesktop 介面',
  needsApp: true,
  async run({ cdp, check, win, sleep, cancelDialog }) {
    // 首頁與各工具分頁都要有，版本號正確
    for (const where of ['首頁', 'frame-bt', 'frame-g2', 'frame-nc', 'frame-p2a']) {
      const W = where === '首頁' ? 'window' : win(where);
      const info = await cdp.ev(`(() => { const d = ${W}.vitoolsDesktop; return d && { api: d.apiVersion, app: d.appVersion, fns: ['getVoices', 'previewAudio', 'exportAudio'].every(k => typeof d[k] === 'function') }; })()`);
      check(`${where}：有 vitoolsDesktop（apiVersion 1、appVersion ${VER}、三個函式）`,
        info && info.api === 1 && info.app === VER && info.fns, JSON.stringify(info));
    }
    const dl = await cdp.ev(`document.getElementById('app-download').textContent`);
    check('首頁下方的下載連結改成顯示目前版本', new RegExp(`目前使用 Windows 桌面版 v${re(VER)}`).test(dl) && !(await cdp.ev(`!!document.querySelector('#app-download a')`)), dl);

    const D = `${win('frame-p2a')}.vitoolsDesktop`;
    const voices = await cdp.ev(`${D}.getVoices()`);
    check('getVoices：回傳語音清單（含 id、name、lang）', Array.isArray(voices) && voices.length > 0 && voices.every(v => v.id && v.name && v.lang), `${voices?.length} 個`);

    const zh = voices.find(v => /^zh-TW/i.test(v.lang)) || voices[0];
    const wav = await cdp.ev(`${D}.previewAudio({ text: '介面測試。', voiceId: ${JSON.stringify(zh.id)} })`);
    check('previewAudio：回傳 WAV（base64）', typeof wav === 'string' && wav.startsWith('UklGR'), (wav || '').slice(0, 10));

    // 音量：同一句 1.0 與 0.2，後者的最大振幅要明顯比較小
    const peak = b64 => {
      const b = Buffer.from(b64, 'base64');
      let pos = 12;
      while (pos + 8 <= b.length && b.toString('ascii', pos, pos + 4) !== 'data') pos += 8 + b.readUInt32LE(pos + 4);
      let max = 0;
      for (let i = pos + 8; i + 1 < b.length; i += 2) max = Math.max(max, Math.abs(b.readInt16LE(i)));
      return max;
    };
    const loud = await cdp.ev(`${D}.previewAudio({ text: '音量測試。', voiceId: ${JSON.stringify(zh.id)}, volume: 1 })`);
    const quiet = await cdp.ev(`${D}.previewAudio({ text: '音量測試。', voiceId: ${JSON.stringify(zh.id)}, volume: 0.2 })`);
    check('previewAudio：音量參數有作用', peak(quiet) < peak(loud) * 0.5, `音量 1.0 最大振幅 ${peak(loud)}，0.2 為 ${peak(quiet)}`);

    const err = await cdp.ev(`${D}.previewAudio({ text: '   ' }).then(() => '沒有錯誤', e => e.message)`);
    check('previewAudio：沒有文字時回報錯誤', /沒有可朗讀的文字/.test(err), err);

    // 兩個請求同時送出，各自拿到自己的結果（reqId 對應）
    const both = await cdp.ev(`Promise.all([${D}.getVoices(), ${D}.previewAudio({ text: '甲。', voiceId: ${JSON.stringify(zh.id)} })])
      .then(([v, w]) => Array.isArray(v) && typeof w === 'string' && w.startsWith('UklGR'))`);
    check('同時送出多個請求，結果不會混在一起', both === true);

    // 匯出按「取消」：回傳 { saved: false }
    await cdp.ev(`window.__exp = ${D}.exportAudio({ text: '取消測試。', voiceId: ${JSON.stringify(zh.id)} }); true`);
    const out = await cancelDialog();
    const r = await cdp.ev(`window.__exp`);
    check('exportAudio：按取消回傳 { saved: false }', out === 'cancelled' && r && r.saved === false, `${out} / ${JSON.stringify(r)}`);
    await sleep(300);
  },
};
