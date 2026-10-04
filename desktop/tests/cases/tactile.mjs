// 觸摸圖（tactile.html），模擬斷線：中文點字表（table/zh-tw.ctb）讀得到、六點輸入面板、紙張、空白頁畫矩形、匯出 .prn 的標頭與內容
export default {
  name: '觸摸圖斷線可用（點字表、紙張、繪圖、匯出 PRN）',
  needsApp: true,
  env: { VITOOLS_SIMULATE_OFFLINE: '1' },
  async run({ cdp, check, win, doc, waitFor }) {
    const TW = win('frame-tactile'), TD = doc('frame-tactile');
    await cdp.ev(`document.getElementById('tab-tactile').click()`);

    check('核心載入', await waitFor(cdp, `!!(${TW}.PrnCore)`, 15000));
    check('中文點字表載入（內附 table/zh-tw.ctb）', await waitFor(cdp, `${TW}.PrnCore.zhReady()`, 15000));
    check('六點輸入用工具集的浮動面板', await cdp.ev(`typeof ${TW}.initBraillePanel === 'function' && !${TD}.getElementById('dotPadBtn').hidden`));

    // 紙張改 Letter（還沒有頁面，不會詢問）→ 空白頁 → 標題 → 畫矩形
    await cdp.ev(`(() => { const s = ${TD}.getElementById('paper'); s.value = '170x220'; s.dispatchEvent(new Event('change')); })()`);
    check('紙張 8.5 × 11 吋 = 170 × 220 點', await cdp.ev(`${TD}.getElementById('paperInfo').textContent`) === '170 × 220 點');
    await cdp.ev(`${TD}.getElementById('btnBlank').click()`);
    await cdp.ev(`(() => { const t = ${TD}.getElementById('titleText'); t.value = '選擇 4. 圖一'; t.dispatchEvent(new Event('input')); })()`);
    const brl = await cdp.ev(`${TD}.querySelector('[data-role=titleBrl]').value`);
    check('標題轉注音點字（數字記號、國字）', brl === '⠑⠘⠈⠓⠮⠂⠀⠼⠙⠲⠀⠋⠌⠂⠡⠄', brl);
    await cdp.ev(`(() => {
      const d = ${TD}, cv = d.getElementById('ed'), z = +d.getElementById('zoom').value;
      const r = d.querySelector('input[name=tool][value=rect]'); r.checked = true; r.dispatchEvent(new Event('change'));
      const ev = (t, x, y) => { const b = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent(t, { clientX: b.left + x * z + 1, clientY: b.top + y * z + 1, pointerId: 1, bubbles: true })); };
      ev('pointerdown', 30, 60); ev('pointermove', 90, 120); ev('pointermove', 140, 180); ev('pointerup', 140, 180);
    })()`);

    // 匯出：攔下 <a download> 的內容（二進位），用網頁的 PrnCore 解回來檢查
    const res = await cdp.ev(`(async () => {
      const w = ${TW}, A = w.HTMLAnchorElement.prototype, orig = A.click;
      const got = new Promise(ok => { A.click = function () { A.click = orig; w.fetch(this.href).then(r => r.arrayBuffer()).then(b => ok({ name: this.download, b })); }; });
      w.document.getElementById('btnExport').click();
      const { name, b } = await got, u = new Uint8Array(b);
      const d = w.PrnCore.decode(u), p = d.pages[0];
      return { name, head: [...u.slice(0, 16)].map(x => x.toString(16).padStart(2, '0')).join(''), w: d.w, h: d.h, n: d.pages.length,
               line: p.filter(v => v === 7).length, braille: p.filter(v => v === 15).length };
    })()`);
    check('匯出檔名 .prn', /\.prn$/.test(res.name || ''), res.name);
    check('標頭：Letter 的寬高與檢查碼', res.head === '1b04001001aa00dc000000000000b901', res.head);
    check('解回 1 頁 170 × 220，有矩形和標題點字', res.n === 1 && res.w === 170 && res.h === 220 && res.line > 300 && res.braille > 10, JSON.stringify(res));

    check('頁面沒有丟出錯誤', cdp.exceptions.length === 0, cdp.exceptions.map(e => e.split('\n')[0]).join('；'));
  },
};
