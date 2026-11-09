import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { check } from '../lib.mjs';

// vi-tools 辨識套件（Recognizer.cs、bridge.js 的 recognizer、網頁 haodian-ocr.js）：
//   找到資料夾 → 版面整理顯示「已找到」→ 第一次辨識時在背景啟動 → 辨識 → app 被強制結束時辨識套件也跟著關
// 要有辨識套件的可攜版資料夾：VITOOLS_TEST_RECOGNIZER，預設 E:\Project\haodian-omr\dist\vi-tools辨識套件；沒有就跳過
const KIT = process.env.VITOOLS_TEST_RECOGNIZER || 'E:\\Project\\haodian-omr\\dist\\vi-tools辨識套件';

// 辨識套件的 python 程序（依資料夾路徑認）
function kitPids() {
  try {
    const out = execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='python.exe'\\" | Where-Object { $_.ExecutablePath -like '*vi-tools*' } | ForEach-Object { $_.ProcessId }"`, { encoding: 'utf8' });
    return out.split(/\s+/).filter(Boolean).map(Number);
  } catch { return []; }
}
async function portUp() {
  try { return (await (await fetch('http://127.0.0.1:18760/api/ocr', { signal: AbortSignal.timeout(1500) })).json()).ocr ? true : false; }
  catch { return false; }
}

export default {
  name: 'vi-tools 辨識套件（背景啟動、跟著 app 關）',
  needsApp: true,
  async setup() {
    if (!existsSync(KIT)) return { skip: true };
    if (await portUp()) return { skip: 'busy' };
    return { env: { VITOOLS_RECOGNIZER: KIT }, teardown: afterApp };
  },
  async run({ cdp, check, win, sleep, skip }) {
    if (skip === true) { console.log('  （沒有辨識套件資料夾，跳過：' + KIT + '）'); return; }
    if (skip === 'busy') { console.log('  （18760 已經有辨識套件在跑，跳過；請先關掉它）'); return; }
    const W = win('frame-layout');
    // 版面整理是點到才載入的分頁：切過去
    await cdp.ev(`switchTo('frame-layout'); true`);
    for (let i = 0; i < 40; i++) {
      if (await cdp.ev(`(() => { try { return !!(${W}.vitoolsHaodian && ${W}.vitoolsDesktop); } catch { return false; } })()`)) break;
      await sleep(250);
    }
    const st = await cdp.ev(`${W}.vitoolsDesktop.recognizer.status()`);
    check('status()：找到辨識套件資料夾、還沒啟動', st && st.found && /vi-tools/.test(st.path) && /^\d+\.\d+/.test(st.version) && !st.running, JSON.stringify(st));
    check('features 有 recognizer', await cdp.ev(`${W}.vitoolsDesktop.features.includes('recognizer')`));

    const f = await cdp.ev(`${W}.vitoolsHaodian.detect().then(f => f && { lazy: !!f.lazy, version: f.version })`);
    check('網頁 detect()：當成有辨識套件（lazy，用到才開）', f && f.lazy === true, JSON.stringify(f));
    await cdp.ev(`(() => { ${W}.document.getElementById('ly-hd-find').click(); return true; })()`);
    await sleep(1500);
    const name = await cdp.ev(`${W}.document.getElementById('ly-hd-name').textContent`);
    check('版面整理工具列：「已找到辨識套件…用到時在背景開啟」', /已找到辨識套件.*背景開啟/.test(name), name);
    check('還沒辨識前沒有啟動', !(await portUp()) && kitPids().length === 0);

    // 第一次辨識：背景啟動，再辨識一張畫了字的圖
    const t0 = Date.now();
    const r = await cdp.ev(`(async () => {
      const w = ${W}, c = w.document.createElement('canvas'); c.width = 600; c.height = 120;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 120); x.fillStyle = '#000'; x.font = '48px "Microsoft JhengHei"';
      x.fillText('下列何者正確', 20, 75);
      const res = await w.vitoolsHaodian.recognize({ kind: 'image', image: c.toDataURL('image/png') }, null, { mode: 'text', type: 'p' });
      return { lines: (res.lines || []).map(l => l.text || l), lazy: !!w.vitoolsHaodian.found.lazy, base: w.vitoolsHaodian.found.base };
    })()`);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    check(`第一次辨識：背景啟動辨識套件後辨識成功（${sec} 秒）`, r && /下列何者正確/.test(r.lines.join('')) && !r.lazy && /127\.0\.0\.1:187\d\d/.test(r.base), JSON.stringify(r));
    const st2 = await cdp.ev(`${W}.vitoolsDesktop.recognizer.status()`);
    check('status()：running', st2 && st2.running, JSON.stringify(st2));
    const pids = kitPids();
    check('辨識套件在背景執行（沒有黑色視窗）', pids.length > 0, 'pid ' + pids.join(','));
    // 再辨識一次：不會再啟動第二個
    await cdp.ev(`${W}.vitoolsHaodian.ensure().then(() => true)`);
    check('再用一次不會多開一個', kitPids().length === pids.length, kitPids().join(','));
  },
};

// app 已經被測試程式強制結束（killApp，FormClosed 不會跑）：辨識套件要靠 Job 物件跟著關
async function afterApp() {
  let left = [];
  for (let i = 0; i < 20; i++) { left = kitPids(); if (!left.length) break; await new Promise(r => setTimeout(r, 250)); }
  check('app 強制結束後，辨識套件也跟著關掉', left.length === 0, left.join(','));
  if (left.length) try { execSync('taskkill /F ' + left.map(p => '/PID ' + p).join(' ')); } catch {}
}
