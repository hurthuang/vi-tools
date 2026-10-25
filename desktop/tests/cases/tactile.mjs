// 觸摸圖（tactile.html），模擬斷線：中文點字表（table/zh-tw.ctb）讀得到、六點輸入面板、紙張、一開始的空白頁畫矩形、匯出 .prn 的標頭與內容、存編輯檔
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

    // 一開始就有一張空白頁 → 紙張改 Letter（空白頁沒動過，不會詢問）→ 標題 → 畫矩形
    check('一開始有一張空白頁', await cdp.ev(`${TD}.querySelectorAll('#pageList .pg').length`) === 1);
    const asked = await cdp.ev(`(() => {
      const w = ${TW}, orig = w.confirm; let n = 0; w.confirm = () => { n++; return true; };
      const s = w.document.getElementById('paper'); s.value = '170x220'; s.dispatchEvent(new Event('change'));
      w.confirm = orig; return n;
    })()`);
    check('空白頁沒動過，改紙張不詢問', asked === 0, `詢問 ${asked} 次`);
    check('紙張 8.5 × 11 吋 = 170 × 220 點', await cdp.ev(`${TD}.getElementById('paperInfo').textContent`) === '170 × 220 點');
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

    // 存編輯檔（.tactile）：攔下內容，矩形是物件、紙張與標題都在
    const ed = await cdp.ev(`(async () => {
      const w = ${TW}, A = w.HTMLAnchorElement.prototype, orig = A.click;
      const got = new Promise(ok => { A.click = function () { A.click = orig; w.fetch(this.href).then(r => r.text()).then(t => ok({ name: this.download, t })); }; });
      w.document.getElementById('btnSave').click();
      const { name, t } = await got, d = JSON.parse(t), p = d.pages[0];
      return { name, format: d.format, paper: d.paper, n: d.pages.length, title: p.title, objs: p.objs.map(o => o.type) };
    })()`);
    check('存編輯檔 .tactile：1 頁、Letter、標題、矩形物件',
      /\.tactile$/.test(ed.name || '') && ed.format === 'vi-tools-tactile' && ed.n === 1 && ed.paper.w === 170 && ed.paper.h === 220 && ed.title === '選擇 4. 圖一' && ed.objs.join() === 'rect',
      JSON.stringify(ed));

    // Word（.docx）：頁面裡用 JSZip（斷線時用內附檔）組一份含一張圖與一個 Word 圖案的 docx，開啟後列出圖片並提示圖案讀不到
    const docx = await cdp.ev(`(async () => {
      const w = ${TW}, d = w.document;
      if (!w.JSZip) await new Promise((ok, fail) => { const s = d.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = fail; d.head.appendChild(s); });
      const cv = d.createElement('canvas'); cv.width = 300; cv.height = 180;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 180); g.lineWidth = 3; g.strokeRect(30, 30, 240, 120);
      const png = await new Promise(ok => cv.toBlob(ok, 'image/png'));
      const zip = new w.JSZip();
      zip.file('word/document.xml', '<w:document xmlns:w="w" xmlns:a="a" xmlns:r="r" xmlns:v="v"><w:body><w:p><w:r><a:blip r:embed="rId9"/></w:r></w:p><w:p><w:r><w:pict><v:line from="0,0" to="9pt,9pt"/></w:pict></w:r></w:p></w:body></w:document>');
      zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId9" Type="image" Target="media/image1.png"/></Relationships>');
      zip.file('word/media/image1.png', png);
      const file = new w.File([await zip.generateAsync({ type: 'blob' })], '試題.docx');
      const dt = new w.DataTransfer(); dt.items.add(file);
      d.dispatchEvent(new w.DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      for (let i = 0; i < 50 && !/試題\\.docx/.test(d.getElementById('pageInfo').textContent); i++) await new Promise(r => setTimeout(r, 100));
      return d.getElementById('pageInfo').textContent;
    })()`);
    check('開啟 .docx：列出圖片、提示 Word 圖案讀不到', /第 1 \/ 1 張圖/.test(docx) && /1 個用 Word 圖案工具畫的圖形/.test(docx), docx);

    check('頁面沒有丟出錯誤', cdp.exceptions.length === 0, cdp.exceptions.map(e => e.split('\n')[0]).join('；'));
  },
};
