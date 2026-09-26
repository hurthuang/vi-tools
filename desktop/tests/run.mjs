// 桌面版冒煙測試：node tests/run.mjs [--exe <ViTools.exe>] [--only <關鍵字>]
// 預設測開發版（bin\Debug）；執行檔旁有 web\ 資料夾時視為可攜版
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as lib from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const exe = resolve(arg('--exe') || join(here, '..', 'bin', 'Debug', 'net10.0-windows10.0.19041.0', 'ViTools.exe'));
const only = arg('--only');
if (!existsSync(exe)) { console.error('找不到執行檔：' + exe + '\n請先 dotnet build，或用 --exe 指定'); process.exit(2); }
const portable = existsSync(join(dirname(exe), 'web'));

console.log(`執行檔：${exe}（${portable ? '可攜版' : '開發版'}）`);
console.log(`輸出資料夾：${lib.OUT}\n`);

// 固定順序：先跑不需要 app 的
const order = ['findmath', 'langseg', 'cli-tts', 'browser', 'web-root', 'api', 'doc', 'math', 'b2t-speech', 'bt-speech', 'offline', 'online', 'online-fallback', 'update', 'segments', 'bilingual', 'voice-warning'];
const files = readdirSync(join(here, 'cases')).filter(f => f.endsWith('.mjs'))
  .sort((a, b) => (order.indexOf(a.replace('.mjs', '')) + 1 || 99) - (order.indexOf(b.replace('.mjs', '')) + 1 || 99));

const pageErrors = [];
for (const f of files) {
  const { default: test } = await import(pathToFileURL(join(here, 'cases', f)).href);
  if (only && !f.includes(only) && !test.name.includes(only)) continue;
  console.log(`■ ${test.name}（${f}）`);
  lib.setCurrentTest(test.name);
  let app = null, ctx_teardown = null;
  try {
    const ctx = { ...lib, exe, portable };
    // test.setup()：開 app 前的準備（例如起本機假伺服器），回傳 { env, teardown }
    if (test.setup) { Object.assign(ctx, await test.setup()); ctx_teardown = ctx.teardown || null; }
    if (test.needsApp) {
      app = await lib.startApp(exe, { env: { ...(test.env || {}), ...(ctx.env || {}) } });
      ctx.cdp = app.cdp;
    }
    await Promise.race([
      test.run(ctx),
      new Promise((_, reject) => setTimeout(() => reject(new Error('測試超過 4 分鐘')), 240000)),
    ]);
    if (test.needsApp) {
      lib.check('app 仍在執行（沒有當掉）', lib.appRunning());
      for (const e of app.cdp.exceptions) pageErrors.push(`[${test.name}] ${e}`);
      if (app.cdp.exceptions.length) console.log(`  ! 頁面丟出 ${app.cdp.exceptions.length} 個錯誤（見最後列表）`);
    }
  } catch (e) {
    lib.check('測試執行完成', false, e.message);
  } finally {
    if (app) await app.stop();
    if (ctx_teardown) await ctx_teardown();
  }
  console.log();
}

const { pass, fail, failures } = lib.results;
console.log('════════════════════════════════');
console.log(`通過 ${pass}，失敗 ${fail}`);
for (const f of failures) console.log('  ✗ ' + f);
if (pageErrors.length) {
  console.log(`\n頁面錯誤 ${pageErrors.length} 個：`);
  for (const e of pageErrors) console.log('  ! ' + e);
}
process.exit(fail ? 1 : 0);
