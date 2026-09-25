// 模擬斷線（VITOOLS_SIMULATE_OFFLINE=1：除了本機網頁與 app 內附的 CDN 檔案，所有對外請求都失敗）
// 網頁從 CDN 載入的 pdf.js（含 worker）、JSZip、MathJax 都要改用 app 內附的同一份，照常運作
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// 最小的 PDF：一頁、一行文字（xref 位移自動計算）
function makePdf(text) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 18 Tf 20 70 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1').toString('base64');
}

// 最小的 DOCX：用 app 內附的 JSZip 在 Node 裡產生
async function makeDocx(text) {
  const JSZip = createRequire(import.meta.url)(join(here, '..', '..', 'desktop-assets', 'cdn', 'cdnjs.cloudflare.com', 'ajax', 'libs', 'jszip', '3.10.1', 'jszip.min.js'));
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');
}

export default {
  name: '斷線時使用 app 內附的 CDN 函式庫',
  needsApp: true,
  env: { VITOOLS_SIMULATE_OFFLINE: '1' },
  async run({ cdp, check, win, doc, waitFor, sleep }) {
    check('確實斷線（外部網站連不上）', await cdp.ev(`fetch('https://example.com/').then(() => false, () => true)`));

    // 數學點字：頁面自己的 MathJax（CDN 的 tex-chtml.js）改用內附，預覽正常、不再丟錯誤
    const NW = win('frame-nc'), ND = doc('frame-nc');
    await cdp.ev(`document.getElementById('tab-nc').click()`);
    check('數學點字頁的 MathJax 載入（內附）', await waitFor(cdp, `!!(${NW}.MathJax && ${NW}.MathJax.typesetPromise)`, 15000));
    const input = String.raw`若 \(a^2+b^2=c^2\)，且 \(\frac{a}{b}\ratio\frac{c}{d}\)。`;
    await cdp.ev(`(() => { const t = ${ND}.getElementById('l2n-in'); t.value = ${JSON.stringify(input)}; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    check('數學點字的預覽渲染出數學式', await waitFor(cdp, `${ND}.querySelectorAll('#l2n-prev mjx-container').length >= 2`, 15000));
    await cdp.ev(`${ND}.getElementById('l2n-speech').open = true`);
    const sp = await waitFor(cdp, `/個算式/.test(${ND}.getElementById('l2n-speech-st').textContent) && ${ND}.getElementById('l2n-speech').speechText`, 30000);
    check('報讀區塊轉出報讀文字（含 \\ratio 念成「比」）', /a 平方 加 b 平方/.test(sp || '') && /b 分之 a 比 d 分之 c/.test(sp || ''),
      sp || await cdp.ev(`${ND}.getElementById('l2n-speech-st').textContent`));

    // 文件整理：開 PDF（pdf.js + worker）與 DOCX（JSZip）
    const PW = win('frame-p2a'), PD = doc('frame-p2a');
    await cdp.ev(`document.getElementById('tab-p2a').click()`);
    await sleep(500);
    const openFile = (name, b64, type) => cdp.ev(`(async () => {
      const bin = atob(${JSON.stringify(b64)}); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      await ${PW}.handleFile(new (${PW}.File)([u8], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
      return true; })()`);
    await openFile('offline-test.pdf', makePdf('Hello offline PDF'), 'application/pdf');
    check('開 PDF（pdf.js 與 worker 用內附）', !!(await waitFor(cdp, `/Hello offline PDF/.test(${PW}.getEditorText())`, 20000)),
      (await cdp.ev(`${PW}.getEditorText()`)).slice(0, 80));
    await openFile('offline-test.docx', await makeDocx('離線 DOCX 測試'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    check('開 DOCX（JSZip 用內附）', !!(await waitFor(cdp, `/離線 DOCX 測試/.test(${PW}.getEditorText())`, 20000)),
      (await cdp.ev(`${PW}.getEditorText()`)).slice(0, 80));

    // 文件整理「數學式」模式：math-speech.js 從 CDN 載入 tex-svg.js（內附）渲染
    await cdp.ev(`${PW}.setEditorText(${JSON.stringify(String.raw`若 $x^2=16$，求 x。`)})`);
    await cdp.ev(`${PW}.switchTab('tts')`);
    await waitFor(cdp, `/算式已轉成報讀文字/.test(${PD}.getElementById('tts-status').textContent)`, 20000);
    await cdp.ev(`${PD}.querySelector('input[name=tts-mode][value=render]').click()`);
    check('文件整理的數學式模式渲染', await waitFor(cdp, `${PD}.querySelectorAll('#tts-text-display mjx-container').length >= 1`, 15000));
    await cdp.ev(`${PD}.querySelector('input[name=tts-mode][value=speech]').click()`);

    check('頁面沒有丟出錯誤', cdp.exceptions.length === 0, cdp.exceptions.map(e => e.split('\n')[0]).join('；'));
  },
};
