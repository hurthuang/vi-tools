// 自動更新（只測可攜版）：把可攜版複製到暫存資料夾再測，不動 dist\ 裡的檔案
//   本機假伺服器模擬 GitHub：Release 清單（VITOOLS_UPDATE_URL）、manifest.json、web-manifest.json、
//   檔案來源（VITOOLS_RAW_URL，raw.githubusercontent.com 的替身）與單獨的 ViTools.exe
//   1. 有新版：只下載有變動的檔案（含執行中的 ViTools.exe：改名成 .old 再放入新檔），詢問是否重新啟動
//   2. 沒有新版：離線網頁依 web-latest 清單更新（可以新增檔案），手動檢查時告訴使用者更新了幾個檔案
//   3. 清單需要更新版的 app（minApp）時不更新網頁；下載內容和清單不符時不覆蓋，改請使用者開下載頁面
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { VER, NEXT, re } from '../version.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const entry = (b) => ({ sha256: sha(b), size: b.length });

export default {
  name: '自動更新',
  needsApp: true,
  async setup(ctx) {
    if (!ctx.portable) return { skip: true };
    const dir = mkdtempSync(join(tmpdir(), 'vitools-autoupdate-'));
    cpSync(dirname(ctx.exe), dir, { recursive: true });
    const exe = join(dir, 'ViTools.exe');

    // 新版的檔案：guide.html 改一行、執行檔後面多一個位元組（只用來比對，不會執行）
    const guide = Buffer.concat([readFileSync(join(dir, 'web', 'guide.html')), Buffer.from('\n<!-- 自動更新測試 -->\n')]);
    const newExe = Buffer.concat([readFileSync(exe), Buffer.from([0])]);
    const index = readFileSync(join(dir, 'web', 'index.html'));
    const added = Buffer.from('自動更新新增的檔案\n');
    const state = { mode: 'newer', requests: [] };
    let base = '';
    const manifests = () => ({
      release: { version: NEXT, minApp: NEXT, commit: 'c1', exeUrl: base + '/exe',
        files: { 'web/guide.html': entry(guide), 'web/index.html': entry(index), 'ViTools.exe': entry(newExe) } },
      bad: { version: NEXT, minApp: NEXT, commit: 'c1', exeUrl: base + '/exe',
        files: { 'web/guide.html': { sha256: '0'.repeat(64), size: guide.length } } },
      web: { version: VER, minApp: VER, commit: 'c2', exeUrl: '', files: { 'web/table/zz-autoupdate-test.txt': entry(added) } },
      webNewer: { version: NEXT, minApp: NEXT, commit: 'c3', exeUrl: '', files: { 'web/table/zz-autoupdate-too-new.txt': entry(added) } },
    });
    const rel = (tag, asset, extra = {}) => ({ tag_name: tag, html_url: 'https://github.com/hurthuang/vi-tools/releases/tag/' + tag,
      assets: asset ? [{ name: asset, browser_download_url: `${base}/${asset}` }] : [], ...extra });
    const server = createServer((req, res) => {
      state.requests.push(req.url);
      const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
      const m = manifests();
      if (req.url === '/releases') {
        const list = {
          newer: [rel(`desktop-v${NEXT}`, 'manifest.json'), rel(`desktop-v${VER}`)],
          bad: [rel(`desktop-v${NEXT}`, 'manifest.json'), rel(`desktop-v${VER}`)],
          web: [rel('web-latest', 'web-manifest.json', { prerelease: true }), rel(`desktop-v${VER}`)],
          webNewer: [rel('web-latest', 'web-manifest.json', { prerelease: true }), rel(`desktop-v${VER}`)],
        }[state.mode];
        return send('application/json', JSON.stringify(list));
      }
      if (req.url === '/manifest.json') return send('application/json', JSON.stringify(state.mode === 'bad' ? m.bad : m.release));
      if (req.url === '/web-manifest.json') return send('application/json', JSON.stringify(state.mode === 'webNewer' ? m.webNewer : m.web));
      if (req.url === '/exe') return send('application/octet-stream', newExe);
      if (req.url === '/raw/c1/guide.html') return send('text/html', guide);
      if (req.url === '/raw/c1/index.html') return send('text/html', index);
      if (req.url === '/raw/c2/table/zz-autoupdate-test.txt' || req.url === '/raw/c3/table/zz-autoupdate-too-new.txt') return send('text/plain', added);
      res.writeHead(404); res.end();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    return {
      exe, dir, state, guide, newExe,
      env: { VITOOLS_UPDATE_URL: base + '/releases', VITOOLS_RAW_URL: base + '/raw/' },
      teardown: async () => {
        await new Promise((r) => server.close(r));
        try { rmSync(dir, { recursive: true, force: true }); } catch {}
      },
    };
  },
  async run({ check, sleep, closeAppMessageBox, cdp, skip, dir, state, guide, newExe, exe }) {
    if (skip) { console.log('  （開發版不測自動更新，用 --exe dist\\ViTools\\ViTools.exe 測可攜版）'); return; }

    // 1. 啟動後自動檢查到新版：下載有變動的檔案，詢問是否重新啟動（按「否」）
    const msg = await closeAppMessageBox(7);
    check('有新版：自動下載有變動的檔案並詢問重新啟動', new RegExp(`已自動下載 v${re(NEXT)} 的更新（只下載有變動的 2 個檔案，目前使用 v${re(VER)}）`).test(msg || '') && /重新啟動/.test(msg || ''), msg);
    check('只下載有變動的檔案（沒變的 index.html 沒有下載）', !state.requests.includes('/raw/c1/index.html') && state.requests.includes('/raw/c1/guide.html'), state.requests.join(' '));
    check('網頁檔已更新', readFileSync(join(dir, 'web', 'guide.html')).equals(guide));
    check('執行中的 ViTools.exe：舊檔改名成 .old，放入新檔', existsSync(exe + '.old') && readFileSync(exe).equals(newExe));
    check('暫存資料夾已清掉', !existsSync(join(dir, 'update-tmp')));

    // 2. 下載內容和清單不符：不覆蓋，改請使用者開下載頁面
    state.mode = 'bad';
    await cdp.key('KeyU', 'U', 2 | 8);
    const bad = await closeAppMessageBox(7);
    check('下載內容和清單不符：不覆蓋，改請使用者開下載頁面', /自動更新沒有完成/.test(bad || '') && /要開啟下載頁面嗎/.test(bad || ''), bad);
    check('核對失敗時檔案維持原狀', readFileSync(join(dir, 'web', 'guide.html')).equals(guide));

    // 3. 沒有新版：離線網頁依 web-latest 清單更新（新增檔案）
    state.mode = 'web';
    await cdp.key('KeyU', 'U', 2 | 8);
    const web = await closeAppMessageBox();
    check('沒有新版時更新離線網頁，並告訴使用者更新了幾個檔案', new RegExp(`已是最新版本（v${re(VER)}）`).test(web || '') && /離線網頁已更新 1 個檔案/.test(web || ''), web);
    check('清單裡新增的檔案已下載', existsSync(join(dir, 'web', 'table', 'zz-autoupdate-test.txt')));

    // 4. 清單需要更新版的 app：不更新離線網頁
    state.mode = 'webNewer';
    await cdp.key('KeyU', 'U', 2 | 8);
    const newer = await closeAppMessageBox();
    check('網頁需要更新版的 app 時不更新', /已是最新版本/.test(newer || '') && !/離線網頁已更新/.test(newer || '') && !existsSync(join(dir, 'web', 'table', 'zz-autoupdate-too-new.txt')), newer);

    // 視窗標題帶版本號
    await sleep(300);
  },
};
