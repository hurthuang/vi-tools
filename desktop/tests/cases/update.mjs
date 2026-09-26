// 檢查更新：用本機假伺服器模擬 GitHub 的 Release 清單（VITOOLS_UPDATE_URL），不連真正的 GitHub
//   啟動後自動檢查：有新版（只看 desktop-v*，略過預先發行與網頁版標籤）→ 跳出詢問
//   Ctrl+Shift+U 手動檢查：已是最新版、檢查失敗都要告訴使用者
import { createServer } from 'node:http';

export default {
  name: '檢查更新',
  needsApp: true,
  async setup() {
    const state = { mode: 'newer' };
    const releases = {
      newer: [
        { tag_name: 'v2.0.0', html_url: 'https://github.com/hurthuang/vi-tools/releases/tag/v2.0.0' },               // 不是桌面版的標籤
        { tag_name: 'desktop-v9.9.9', prerelease: true, html_url: 'https://github.com/x' },                          // 預先發行
        { tag_name: 'desktop-v8.0.0', draft: true, html_url: 'https://github.com/x' },                               // 草稿
        { tag_name: 'desktop-v0.2.0', html_url: 'https://github.com/hurthuang/vi-tools/releases/tag/desktop-v0.2.0' },
        { tag_name: 'desktop-v0.1.0', html_url: 'https://github.com/hurthuang/vi-tools/releases/tag/desktop-v0.1.0' },
      ],
      same: [{ tag_name: 'desktop-v0.1.0', html_url: 'https://github.com/hurthuang/vi-tools/releases/tag/desktop-v0.1.0' }],
    };
    const server = createServer((req, res) => {
      state.hits = (state.hits || 0) + 1;
      state.ua = req.headers['user-agent'];
      if (state.mode === 'error') { res.writeHead(500); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(releases[state.mode]));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return {
      state,
      env: { VITOOLS_UPDATE_URL: `http://127.0.0.1:${server.address().port}/releases` },
      teardown: () => new Promise(r => server.close(r)),
    };
  },
  async run({ cdp, check, sleep, closeAppMessageBox, state }) {
    // 啟動後自動檢查：有新版 → 詢問（按「否」，不開瀏覽器）
    const msg = await closeAppMessageBox(7);
    check('啟動後自動檢查，有新版時詢問', /有新版本 v0\.2\.0（目前使用 v0\.1\.0）/.test(msg || ''), msg);
    check('送出 app 版本的 User-Agent', /^ViTools\/0\.1\.0/.test(state.ua || ''), state.ua);

    // 手動檢查：已是最新版
    state.mode = 'same';
    await cdp.key('KeyU', 'U', 2 | 8);
    const same = await closeAppMessageBox();
    check('Ctrl+Shift+U：已是最新版時告訴使用者', /已是最新版本（v0\.1\.0）/.test(same || ''), same);

    // 手動檢查：伺服器出錯
    state.mode = 'error';
    await cdp.key('KeyU', 'U', 2 | 8);
    const err = await closeAppMessageBox();
    check('Ctrl+Shift+U：檢查失敗時告訴使用者', /檢查更新失敗/.test(err || ''), err);

    // 手動檢查也會找到新版
    state.mode = 'newer';
    await cdp.key('KeyU', 'U', 2 | 8);
    const again = await closeAppMessageBox(7);
    check('Ctrl+Shift+U：有新版時詢問', /有新版本 v0\.2\.0/.test(again || ''), again);
    await sleep(300);
  },
};
