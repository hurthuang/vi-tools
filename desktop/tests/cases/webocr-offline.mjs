// 網頁版辨識斷線也能用（版面整理沒有辨識套件時）：
//   文字辨識 ocr-web.js（models/ocr）、算式辨識 mfr-web.js（models/mfr），執行環境 onnxruntime-web 從 desktop-assets\cdn 內附
//   Web Worker 裡的 importScripts 與 WASM 也要被攔截到內附檔（CoreWebView2WebResourceRequestSourceKinds.All）
export default {
  name: '網頁版文字、算式辨識斷線可用',
  needsApp: true,
  env: { VITOOLS_SIMULATE_OFFLINE: '1' },
  async run({ cdp, check, win, sleep }) {
    const W = win('frame-layout');
    await cdp.ev(`switchTo('frame-layout'); true`);
    for (let i = 0; i < 40; i++) {
      if (await cdp.ev(`(() => { try { return !!(${W}.vitoolsOcr && ${W}.vitoolsMfr); } catch { return false; } })()`)) break;
      await sleep(250);
    }
    const draw = (text, w, h, size) => `(() => { const d = ${W}.document, c = d.createElement('canvas'); c.width = ${w}; c.height = ${h};
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, ${w}, ${h}); x.fillStyle = '#000'; x.font = '${size}px "Microsoft JhengHei"';
      x.fillText(${JSON.stringify(text)}, 20, ${Math.round(h * 0.65)}); return c; })()`;

    let t0 = Date.now();
    const ocr = await cdp.ev(`${W}.vitoolsOcr.recognize(${draw('則下列何者正確', 700, 120, 52)}).then(r => r.map(x => x.text).join(''), e => 'ERR ' + e.message)`);
    // 測的是斷線時載得起來、認得出字（準確度另外試驗過），合成的圖偶爾多認一兩個字
    check(`文字辨識（斷線，${((Date.now() - t0) / 1000).toFixed(1)} 秒）：認出「下列」「正確」`, /則下列/.test(ocr) && /正確/.test(ocr), ocr);

    t0 = Date.now();
    const tex = await cdp.ev(`${W}.vitoolsMfr.recognize(${draw('x + 1 = 3', 360, 110, 64)}).then(r => r.tex, e => 'ERR ' + e.message)`);
    check(`算式辨識（斷線，${((Date.now() - t0) / 1000).toFixed(1)} 秒）：x+1=3`, /x\s*\+\s*1\s*=\s*3/.test(tex || ''), tex);
  },
};
