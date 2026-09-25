// 一般瀏覽器（無視窗 Edge + 本機網頁伺服器）：網頁版不能因為桌面版的程式而改變
// 桌面專用的 desktop-audio.js 要載入但什麼都不做：沒有 vitoolsDesktop、沒有匯出按鈕、沒有丟出錯誤
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.css': 'text/css' };

function serve(root) {
  const server = createServer(async (req, res) => {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    try {
      if (!path.startsWith(root) || !(await stat(path)).isFile()) throw 0;
      res.writeHead(200, { 'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream' });
      res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

export default {
  name: '一般瀏覽器裡的網頁版（無視窗 Edge）',
  needsApp: false,
  async run({ check, exe, portable, connect, sleep, captureDownloads, takeDownload }) {
    if (!check('找得到 Edge', !!EDGE)) return;
    // 開發版測 vi-tools 根目錄，可攜版測內附的 web\
    const root = portable ? join(dirname(exe), 'web') : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const server = await serve(root);
    const port = server.address().port;
    const dbgPort = 9400 + Math.floor(Math.random() * 400);
    const profile = mkdtempSync(join(tmpdir(), 'vitools-edge-'));
    const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--disable-extensions', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
    try {
      let page = null;
      for (let i = 0; i < 40 && !page; i++) {
        try { page = (await (await fetch(`http://127.0.0.1:${dbgPort}/json`)).json()).find(t => t.type === 'page'); } catch {}
        if (!page) await sleep(500);
      }
      if (!check('無視窗 Edge 啟動', !!page)) return;
      const cdp = await connect(page.webSocketDebuggerUrl);
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
      let ready = false;
      for (let i = 0; i < 60 && !ready; i++) {
        await sleep(500);
        ready = await cdp.ev(`document.querySelectorAll('iframe').length > 0 && [...document.querySelectorAll('iframe')].every(f => { try { return f.contentDocument.readyState === 'complete' && f.contentWindow.location.href !== 'about:blank'; } catch { return false; } })`).catch(() => false) === true;
      }
      if (!check('首頁與分頁載入完成', ready)) { cdp.close(); return; }
      await sleep(1500);

      check('首頁沒有 vitoolsDesktop', await cdp.ev(`typeof window.vitoolsDesktop`) === 'undefined');
      for (const [frame, label] of [['frame-bt', '文字轉點字'], ['frame-g2', '點字轉文字']]) {
        const W = `document.getElementById('${frame}').contentWindow`, D = `${W}.document`;
        const info = await cdp.ev(`({ desktop: typeof ${W}.vitoolsDesktop, audio: typeof ${W}.vitoolsDesktopAudio,
          btn: !!${D}.getElementById('vtd-btn'), panel: !!${D}.getElementById('vtd-panel') })`);
        check(`${label}：desktop-audio.js 有載入`, info.audio === 'object', JSON.stringify(info));
        check(`${label}：沒有 vitoolsDesktop、沒有匯出按鈕與面板`, info.desktop === 'undefined' && !info.btn && !info.panel, JSON.stringify(info));
      }

      // 網頁本身照常運作：文字轉點字有輸出
      const BT = `document.getElementById('frame-bt').contentDocument`;
      await cdp.ev(`(() => { const t = ${BT}.getElementById('input-text'); t.value = '點字轉換測試。'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      const out = await (async () => { for (let i = 0; i < 20; i++) { const v = await cdp.ev(`${BT}.getElementById('output-text').value`); if (v) return v; await sleep(500); } return ''; })();
      check('文字轉點字照常轉換', /[\u2800-\u28ff]/.test(out), out.slice(0, 30));

      // 數學點字：報讀區塊在一般瀏覽器也能用（MathCAT 從網頁伺服器載入），但沒有「匯出音檔」
      const NC = `document.getElementById('frame-nc').contentDocument`;
      await cdp.ev(`(() => { const t = ${NC}.getElementById('l2n-in'); t.value = ${JSON.stringify(String.raw`解 \(x^2-5x+6=0\)，且 $y^2=9$。`)}; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(1000);
      check('數學點字：有報讀區塊、沒有匯出按鈕', await cdp.ev(`!!${NC}.getElementById('l2n-speech') && ${NC}.getElementById('l2n-speech-export').hidden`));
      await cdp.ev(`${NC}.getElementById('l2n-speech').open = true`);
      let sp = '';
      for (let i = 0; i < 60 && !/個算式/.test(await cdp.ev(`${NC}.getElementById('l2n-speech-st').textContent`)); i++) await sleep(500);
      sp = await cdp.ev(`${NC}.getElementById('l2n-speech').speechText`);
      check('數學點字：算式轉成報讀文字（瀏覽器載入 MathCAT）', /x 平方 減 5 x 加 6/.test(sp) && /y 平方 等於 9/.test(sp),
        sp || await cdp.ev(`${NC}.getElementById('l2n-speech-st').textContent`));

      // 文字轉點字、點字轉文字：報讀區塊的「點字讀音」在一般瀏覽器也能用，沒有匯出按鈕
      const BW = `document.getElementById('frame-bt').contentWindow`;
      for (let i = 0; i < 40 && !(await cdp.ev(`${BW}.eval('mcbReady')`)); i++) await sleep(500);
      await cdp.ev(`(() => { const e = ${BT}.getElementById('input-text'); e.value = '我去銀行。'; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(1500);
      await cdp.ev(`(() => { ${BT}.getElementById('bt-speech').open = true; const s = ${BT}.getElementById('bt-speech-source'); s.value = 'reading'; s.dispatchEvent(new Event('change')); })()`);
      let btr = '';
      for (let i = 0; i < 20 && !/航/.test(btr); i++) { await sleep(500); btr = await cdp.ev(`${BT}.getElementById('bt-speech').speechText`); }
      check('文字轉點字：點字讀音（瀏覽器）', /航/.test(btr) && await cdp.ev(`${BT}.getElementById('bt-speech-export').hidden`), btr);

      const GW = `document.getElementById('frame-g2').contentWindow`, GD = `${GW}.document`;
      for (let i = 0; i < 40 && !(await cdp.ev(`!!${GW}.eval('svcMcB')`)); i++) await sleep(500);
      const gbrl = await cdp.ev(`['ㄧㄣˊ', 'ㄏㄤˊ'].map(s => ${GW}.mcbopomofo.BopomofoBrailleConverter.convertBpmfToBraille(s).trim()).join('')`);
      await cdp.ev(`(() => { const e = ${GD}.getElementById('input-text'); e.value = ${JSON.stringify(gbrl)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(1500);
      await cdp.ev(`(() => { ${GD}.getElementById('b2t-speech').open = true; const s = ${GD}.getElementById('b2t-speech-source'); s.value = 'reading'; s.dispatchEvent(new Event('change')); })()`);
      let g2r = '';
      for (let i = 0; i < 20 && !/航/.test(g2r); i++) { await sleep(500); g2r = await cdp.ev(`${GD}.getElementById('b2t-speech').speechText`); }
      check('點字轉文字：點字讀音（瀏覽器）', /航/.test(g2r) && await cdp.ev(`${GD}.getElementById('b2t-speech-export').hidden`), g2r);

      // 文件整理：朗讀內容三種模式在一般瀏覽器也能用，但沒有「匯出音檔」
      const PW = `document.getElementById('frame-p2a').contentWindow`, PD = `${PW}.document`;
      await cdp.ev(`${PW}.setEditorText(${JSON.stringify(String.raw`第一題：若 $x^2=16$，則 x 等於多少？
第二題：已知 \(n!=120\)，求 n。`)})`);
      await cdp.ev(`${PW}.switchTab('tts')`);
      for (let i = 0; i < 60 && !/算式已轉成報讀文字/.test(await cdp.ev(`${PD}.getElementById('tts-status').textContent`)); i++) await sleep(500);
      const docInfo = await cdp.ev(`({ mode: !${PD}.getElementById('tts-mode').hidden, exp: ${PD}.getElementById('btn-tts-export').hidden,
        speak: ${PW}.eval('_ttsSentences') })`);
      check('文件整理：有朗讀內容選項、沒有匯出按鈕', docInfo.mode && docInfo.exp, JSON.stringify({ mode: docInfo.mode, exp: docInfo.exp }));
      check('文件整理：算式轉成報讀文字（含單個 $）', /x 平方 等於 16/.test(docInfo.speak[0] || '') && /n 階乘/.test(docInfo.speak[1] || ''), JSON.stringify(docInfo.speak));
      await cdp.ev(`${PD}.querySelector('input[name=tts-mode][value=render]').click()`);
      let n = 0;
      for (let i = 0; i < 40 && n < 2; i++) { await sleep(500); n = await cdp.ev(`${PD}.querySelectorAll('#tts-text-display mjx-container').length`); }
      check('文件整理：數學式模式渲染（瀏覽器從 CDN 載入 MathJax）', n >= 2, `${n} 個`);
      await cdp.ev(`${PD}.querySelector('input[name=tts-mode][value=speech]').click()`);

      // 存報讀檔在瀏覽器也能用
      await captureDownloads(cdp, 'frame-nc');
      await cdp.ev(`${NC}.getElementById('l2n-speech-save').click()`);
      await sleep(500);
      const saved = await takeDownload(cdp, 'frame-nc');
      check('數學點字：存報讀檔（瀏覽器）', saved && /\.txt$/.test(saved.name) && saved.text === sp, JSON.stringify(saved && saved.name));

      const mine = cdp.exceptions.filter(e => /desktop-audio|math-speech|speech-block|mathcat|brl-reading|BrailleReading|ttsMath|ttsAfterBuild|ttsSplit|ttsEnsure|ttsRebuild|ttsRenderable|initTtsMode|initDesktopExport/.test(e));
      check('桌面與報讀相關的檔案沒有丟出錯誤', mine.length === 0, mine.join('；'));
      if (cdp.exceptions.length) console.log(`  （頁面其他錯誤 ${cdp.exceptions.length} 個，與桌面版無關：${cdp.exceptions.map(e => e.split('\n')[0]).join('；').slice(0, 300)}）`);
      cdp.close();
    } finally {
      try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
      server.close();
      await sleep(1000);
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  },
};
