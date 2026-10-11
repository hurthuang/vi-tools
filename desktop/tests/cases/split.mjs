// 文件整理的分段匯出（試卷：題組文章、題目、選項各一個音檔）：預覽清單、調整（改名、併入上一檔、不匯出）、匯出到資料夾與播放清單
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export default {
  name: '文件整理的分段匯出',
  needsApp: true,
  async run({ cdp, check, win, doc, waitFor, saveDialog, outPath, audioKind, sleep }) {
    const W = win('frame-p2a'), D = doc('frame-p2a');
    await cdp.ev(`(() => { const h = window.chrome.webview; window.__sent = []; const o = h.postMessage.bind(h);
      h.postMessage = m => { window.__sent.push(m); o(m); }; })()`);
    await cdp.ev(`document.getElementById('tab-p2a').click()`);
    await sleep(800);

    const text = String.raw`國文科 試題本
一、單題
第1題 若 \(x^2=16\)，則 x 等於多少？
(Ａ) 4
(Ｂ) 8
第2題 本題視障生不作答
二、題組
請閱讀以下短文，並回答3及4題：
從前有一座山。
第3題 根據本文，下列何者正確？
(Ａ)山很高
(Ｂ)山很矮
=== 補充
這段是手動切開的。
第4題 承上題，何者錯誤？
(Ａ)甲
(Ｂ)乙
`;
    await cdp.ev(`${W}.setEditorText(${JSON.stringify(text)})`);
    await cdp.ev(`${W}.switchTab('tts')`);
    await waitFor(cdp, `/算式已轉成報讀文字/.test(${D}.getElementById('tts-status').textContent)`, 10000);
    check('桌面版顯示「分段匯出」', await cdp.ev(`(() => { const b = ${D}.getElementById('tts-split'); return !b.hidden && ${W}.getComputedStyle(b).display !== 'none'; })()`));
    await cdp.ev(`${D}.getElementById('tts-split').open = true`);
    await waitFor(cdp, `${D}.querySelectorAll('#split-list li').length > 0`, 8000);
    const rows = () => cdp.ev(`[...${D}.querySelectorAll('#split-list li')].map(li => ({ num: li.querySelector('.split-num').textContent,
      name: li.querySelector('input').value, how: li.querySelector('select').value, pv: li.querySelector('.split-preview').textContent }))`);
    let r = await rows();
    const want = ['說明', '第1題_題目', '第1題_選項', '第2題', '二、題組', '第3至4題_題組', '第3題_題目', '第3題_選項', '補充', '第4題_題目', '第4題_選項'];
    check('預覽清單：自動判斷的檔名', JSON.stringify(r.map(x => x.name)) === JSON.stringify(want), JSON.stringify(r.map(x => x.name)));
    check('預覽清單：依順序編號', r.map(x => x.num).join(',') === '001,002,003,004,005,006,007,008,009,010,011', r.map(x => x.num).join(','));
    check('預覽清單：算式照朗讀內容念報讀文字', /x 平方 等於 16/.test(r[1]?.pv), r[1]?.pv);
    check('預覽清單：手動記號那行不念', r[8]?.pv === '這段是手動切開的。', r[8]?.pv);
    check('預覽清單：摘要', /共 11 個音檔（找到 4 題、1 個題組）/.test(await cdp.ev(`${D}.getElementById('split-summary').textContent`)),
      await cdp.ev(`${D}.getElementById('split-summary').textContent`));

    // 調整：「補充」併入上一檔、第2題與大標題不匯出、說明改名
    const setHow = (i, v) => cdp.ev(`(() => { const s = ${D}.querySelectorAll('#split-list select')[${i}]; s.value = '${v}'; s.dispatchEvent(new Event('change')); })()`);
    await setHow(8, 'merge');
    await setHow(3, 'skip');
    await setHow(4, 'skip');
    await cdp.ev(`${D}.querySelectorAll('#split-list input')[0].value = '考試說明'`);
    r = await rows();
    check('調整後重新編號（不匯出 —、併入上一檔 ↳）', r.map(x => x.num).join(',') === '001,002,003,—,—,004,005,006,↳,007,008', r.map(x => x.num).join(','));
    check('調整後摘要', /共 8 個音檔.*1 段併入上一檔；2 段不匯出/.test(await cdp.ev(`${D}.getElementById('split-summary').textContent`)));

    // 切到編輯再回朗讀：文字沒變，保留使用者的調整
    await cdp.ev(`${W}.switchTab('raw')`);
    await cdp.ev(`${W}.switchTab('tts')`);
    await sleep(500);
    check('文字沒改時保留調整', (await rows())[3]?.how === 'skip' && (await rows())[0]?.name === '考試說明');

    // 匯出
    const folder = outPath('分段測試');
    for (const d of [folder, folder + ' (2)']) rmSync(d, { recursive: true, force: true });
    await cdp.ev(`${D}.getElementById('btn-split-export').click()`);
    await saveDialog(folder + '.mp3', 500, '分段匯出音檔（輸入資料夾名稱）');
    const done = await waitFor(cdp, `/^已匯出|^錯誤|^已取消/.test(${D}.getElementById('split-summary').textContent)`, 120000);
    const summary = await cdp.ev(`${D}.getElementById('split-summary').textContent`);
    check('匯出完成', done && /^已匯出 8 個音檔到：/.test(summary), summary);
    const files = existsSync(folder) ? readdirSync(folder).sort() : [];
    const wantFiles = ['001_考試說明.mp3', '002_第1題_題目.mp3', '003_第1題_選項.mp3', '004_第3至4題_題組.mp3', '005_第3題_題目.mp3',
      '006_第3題_選項.mp3', '007_第4題_題目.mp3', '008_第4題_選項.mp3', '分段測試.m3u8'];
    check('資料夾裡的檔案（依順序編號、略過不匯出的、附播放清單）', JSON.stringify(files) === JSON.stringify(wantFiles), JSON.stringify(files));
    check('每個音檔都是 MP3', files.filter(f => f.endsWith('.mp3')).every(f => audioKind(join(folder, f)) === 'mp3'));
    const m3u = existsSync(join(folder, '分段測試.m3u8')) ? readFileSync(join(folder, '分段測試.m3u8'), 'utf8') : '';
    check('播放清單依順序列出音檔', m3u.split(/\r?\n/).filter(Boolean).join('|') === ['#EXTM3U', ...wantFiles.slice(0, 8)].join('|'), m3u);
    const sent = await cdp.ev(`window.__sent.filter(m => m.type === 'exportBatch').pop()`);
    const items = sent?.items || [];
    check('送出的內容：算式念報讀文字', /x 平方 等於 16/.test(items[1]?.text || ''), items[1]?.text);
    check('送出的內容：併入上一檔接在第3題選項後面、記號不念', /山很矮[\s\S]*這段是手動切開的。/.test(items[5]?.text || '') && !/===/.test(items[5]?.text || ''), items[5]?.text);

    // 同名資料夾已有檔案時不覆蓋，改存到「(2)」
    await cdp.ev(`${D}.getElementById('btn-split-export').click()`);
    await sleep(300);
    await saveDialog(folder + '.mp3', 500, '分段匯出音檔（輸入資料夾名稱）');
    await waitFor(cdp, `/^已匯出.*\\(2\\)/.test(${D}.getElementById('split-summary').textContent)`, 120000);
    check('同名資料夾已有檔案時改存到「(2)」', existsSync(join(folder + ' (2)', '001_考試說明.mp3')), await cdp.ev(`${D}.getElementById('split-summary').textContent`));

    // 切分方式改「依空行切」：測試文字沒有空行，只有手動記號切開 → 說明、補充兩段
    await cdp.ev(`(() => { const h = ${D}.getElementById('split-how'); h.value = 'blank'; h.dispatchEvent(new Event('change')); })()`);
    await sleep(800);
    const blank = (await rows()).map(x => x.name);
    check('切分方式「依空行切」', JSON.stringify(blank) === JSON.stringify(['說明', '補充']), JSON.stringify(blank));
    await cdp.ev(`(() => { const h = ${D}.getElementById('split-how'); h.value = 'auto'; h.dispatchEvent(new Event('change')); })()`);
  },
};
