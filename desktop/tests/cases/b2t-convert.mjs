// 點字轉文字主轉換（braille-to-text.html，無視窗 Edge + 本機網頁伺服器，不開 app）
//   1) reg-b2t.html 回歸測試全部通過
//   2) 注音點字自己切音節：McBopomofo 會把音節後的 ⠱（ㄦ）當兒化韻（嬰兒、偶爾被判成英文）、
//      共用點位解錯（給消失、唷變 ㄟ、崖空白）
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
  name: '點字轉文字主轉換（無視窗 Edge）',
  needsApp: false,
  async run({ check, exe, portable, connect, sleep }) {
    if (!check('找得到 Edge', !!EDGE)) return;
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
      const waitFor = async (expr, ms) => { for (let t = 0; t < ms; t += 300) { const v = await cdp.ev(expr).catch(() => null); if (v) return v; await sleep(300); } return null; };

      // 1) 回歸測試（可攜版沒有內附 reg-b2t.html，只在開發版跑）
      if (!portable) {
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/reg-b2t.html` });
        const ready = await waitFor(`/就緒/.test(document.getElementById('summary').textContent) && !document.getElementById('runBtn').disabled`, 60000);
        if (check('reg-b2t 引擎就緒', !!ready)) {
          await cdp.ev(`document.getElementById('runBtn').click()`);
          const summary = await waitFor(`/失敗/.test(document.getElementById('summary').textContent) && document.getElementById('summary').textContent`, 60000);
          const fails = await cdp.ev(`[...document.querySelectorAll('#tbody tr.fail')].map(r => r.textContent.replace(/\\s+/g, ' ').trim()).slice(0, 5).join('｜')`);
          check('reg-b2t 回歸測試全部通過', /✗ 0 失敗/.test(summary || ''), `${summary}${fails ? '：' + fails : ''}`);
        }
      }

      // 2) 主轉換的新案例
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/braille-to-text.html` });
      if (!check('McBopomofo 載入', !!(await waitFor(`typeof svcMcB !== 'undefined' && !!svcMcB && typeof _isReady === 'function' && _isReady()`, 60000)))) { cdp.close(); return; }
      const convert = async braille => {
        await cdp.ev(`(() => { const t = document.getElementById('input-text'); t.value = ${JSON.stringify(braille)}; t.dispatchEvent(new Event('input', { bubbles: true })); doConvert(); })()`);
        await sleep(300);
        return cdp.ev(`document.getElementById('output-text').value`);
      };
      const brl = bp => cdp.ev(`${JSON.stringify(bp)}.split(' ').map(s => mcbopomofo.BopomofoBrailleConverter.convertBpmfToBraille(s).trim()).join('')`);
      const cases = [
        ['給予（原本「給」消失）', 'ㄍㄟˇ ㄩˇ', '給予'],
        ['交給他', 'ㄐㄧㄠ ㄍㄟˇ ㄊㄚ', '交給他'],
        ['偶爾（原本被判成英文）', 'ㄡˇ ㄦˇ', '偶爾'],
        ['嬰兒', 'ㄧㄥ ㄦˊ', '嬰兒'],
        ['愛爾蘭', 'ㄞˋ ㄦˇ ㄌㄢˊ', '愛爾蘭'],
        ['獨一無二', 'ㄉㄨˊ ㄧ ㄨˊ ㄦˋ', '獨一無二'],
        ['唷（原本「ㄟ」）', 'ㄧㄛ', '唷'],
        ['懸崖（原本「崖」空白）', 'ㄒㄩㄢˊ ㄧㄞˊ', '懸崖'],
        ['女兒（原本就對）', 'ㄋㄩˇ ㄦˊ', '女兒'],
        ['時候（輕聲 ㄏㄡ˙ McBopomofo 沒有字，改用四聲選字）', 'ㄕˊ ㄏㄡ˙', '時候'],
        ['思議、資源（一聲音節接起來要分隔，否則配不到詞）', 'ㄙ ㄧˋ ㄗ ㄩㄢˊ', '思議資源'],
        ['你好，世界！', 'ㄋㄧˇ ㄏㄠˇ ， ㄕˋ ㄐㄧㄝˋ ！', '你好，世界！'],
      ];
      for (const [label, bp, want] of cases) {
        const b = await brl(bp);
        const out = await convert(b);
        check(`主轉換：${label}`, out === want, `${b} → ${out}`);
      }
      // 詞間空格保留；沒有字的音節顯示注音（逐格對照才不會錯位）
      const spaced = await convert(await brl('ㄨㄛˇ') + '⠀' + await brl('ㄌㄥ') + '⠀' + await brl('ㄉㄜ˙'));
      check('主轉換：詞間空格保留、沒有字的音節顯示注音', spaced === '我 ㄌㄥ 的', spaced);
      // 辭典沒有、但點字寫法合乎規則的音節（⠑⠴⠈ ㄙㄟˇ）仍是中文，顯示注音，不被判成英文
      const sei = await convert('⠑⠴⠈');
      check('主轉換：辭典沒有的音節（⠑⠴⠈）顯示注音、不判成英文', sei === 'ㄙㄟˇ', sei);
      const cells = await cdp.ev(`[...document.querySelectorAll('#parallel-view *')].length`);
      check('逐格對照有內容', cells > 0, `${cells}`);
      // 英文點字仍然是英文
      const en = await convert('⠠⠹⠊⠎⠀⠊⠎⠀⠁⠀⠞⠑⠎⠞⠲');
      check('英文點字仍轉成英文（This is a test.）', /this is a test/i.test(en), en);

      const mine = cdp.exceptions.filter(e => /braille-to-text|_zhTokens|_zhTokenTexts|_isChineseChunk|_buildChineseCharTokens/.test(e));
      check('沒有丟出錯誤', mine.length === 0, mine.join('；'));
      cdp.close();
    } finally {
      try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
      server.close();
      await sleep(1000);
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  },
};
