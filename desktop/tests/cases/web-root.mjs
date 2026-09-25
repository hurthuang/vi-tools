// 網頁來源：開發版用 vi-tools 根目錄（有 reg-*.html 測試頁），可攜版用內附的 web\（打包時排除 reg-*）
export default {
  name: '網頁來源',
  needsApp: true,
  async run({ cdp, check, portable }) {
    check('首頁網址是 https://vitools.local/', /^https:\/\/vitools\.local\//.test(await cdp.ev('location.href')));
    const status = await cdp.ev(`fetch('/reg-nc.html').then(r => r.status).catch(() => 'none')`);
    if (portable) check('可攜版用內附 web\\（讀不到 reg-nc.html）', status === 'none' || status === 404, `得到 ${status}`);
    else check('開發版用 vi-tools 根目錄（讀得到 reg-nc.html）', status === 200, `得到 ${status}`);
  },
};
