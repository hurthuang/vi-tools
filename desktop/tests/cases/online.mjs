// 線上網頁（https://hurthuang.github.io/vi-tools/）：連得上就優先用；那裡也能用桌面功能；Ctrl+Shift+O 與內附離線版互換
// 需要網路。注意：線上網頁是 GitHub 上目前推送的版本，還沒推送的網頁功能不會出現，所以這裡只測 app 的行為
const ONLINE = 'https://hurthuang.github.io/vi-tools/';
export default {
  name: '優先載入線上網頁',
  needsApp: true,
  env: { VITOOLS_WEB: '' },   // 不指定：照正常流程試連線上網頁
  async run({ cdp, check, win, waitFor, sleep, appTitle }) {
    const href = await cdp.ev('location.href');
    if (!check('連得上線上網頁時載入線上版', href.startsWith(ONLINE), href)) return;
    check('視窗標題沒有「（離線版）」', !appTitle().includes('離線版'), appTitle());

    // 線上網頁也有 vitoolsDesktop，而且原生層接受它的請求
    const voices = await cdp.ev(`${win('frame-g2')}.vitoolsDesktop ? ${win('frame-g2')}.vitoolsDesktop.getVoices().then(v => v.length) : -1`);
    check('線上網頁的分頁也能用桌面功能（語音清單）', voices > 0, `${voices}`);

    // Ctrl+Shift+O：換成內附離線版，停在同一個分頁（首頁的 #hash 保留）
    await cdp.ev(`document.getElementById('tab-g2').click()`);
    await sleep(300);
    const hash = await cdp.ev('location.hash');
    await cdp.key('KeyO', 'O', 2 | 8);
    check('Ctrl+Shift+O 換成內附離線版', await waitFor(cdp, `location.href.startsWith('https://vitools.local/')`, 10000), await cdp.ev('location.href').catch(() => '?'));
    check('保留同一個位置（#hash）', (await cdp.ev('location.hash')) === hash, `${hash} → ${await cdp.ev('location.hash')}`);
    await waitFor(cdp, `document.readyState === 'complete'`, 5000);
    await sleep(500);
    check('視窗標題加上「（離線版）」', appTitle().includes('離線版'), appTitle());

    await cdp.key('KeyO', 'O', 2 | 8);
    check('再按一次換回線上網頁', await waitFor(cdp, `location.href.startsWith(${JSON.stringify(ONLINE)})`, 10000), await cdp.ev('location.href').catch(() => '?'));
  },
};
