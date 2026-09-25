// 線上網頁載不到（模擬斷線）：自動改用內附離線版；這時按 Ctrl+Shift+O 會提示連不上、維持離線版
export default {
  name: '線上網頁載不到時改用內附',
  needsApp: true,
  env: { VITOOLS_WEB: 'online', VITOOLS_SIMULATE_OFFLINE: '1' },   // 強制先載線上網頁，但所有對外請求都失敗
  async run({ cdp, check, waitFor, sleep, appTitle, closeAppMessageBox }) {
    check('自動改用內附離線版', (await cdp.ev('location.href')).startsWith('https://vitools.local/'), await cdp.ev('location.href'));
    check('視窗標題加上「（離線版）」', appTitle().includes('離線版'), appTitle());
    check('內附版的桌面功能正常', await cdp.ev(`window.vitoolsDesktop.getVoices().then(v => v.length > 0)`));

    await cdp.key('KeyO', 'O', 2 | 8);
    const msg = closeAppMessageBox();
    check('Ctrl+Shift+O：連不上時提示並維持離線版', /連不上線上網頁/.test(msg || ''), msg);
    await sleep(500);
    check('仍然是內附離線版', (await cdp.ev('location.href')).startsWith('https://vitools.local/'));
  },
};
