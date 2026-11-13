// 在桌面版裡安裝、整包更新 vi-tools 辨識套件（RecognizerInstall.cs、bridge.js recognizer.install、haodian-ocr.js install／installPanel）
//   用本機假伺服器模擬 GitHub Release（VITOOLS_RECOGNIZER_API），zip 是測試自己做的小檔（只有 python.exe、main.py 的空殼），
//   裝到暫存資料夾（VITOOLS_RECOGNIZER_INSTALL_DIR），不連真正的 GitHub、不動使用者的辨識套件
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KIT = 'vi-tools辨識套件';

// 最簡單的 zip（不壓縮，檔名 UTF-8），跟 Python zipfile 做出來的一樣讀得懂
function makeZip(files) {
  const locals = [], centrals = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name, 'utf8'), d = Buffer.from(text, 'utf8'), c = crc32(d);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt32LE(c, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8);
    ch.writeUInt32LE(c, 16); ch.writeUInt32LE(d.length, 20); ch.writeUInt32LE(d.length, 24); ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(off, 42);
    locals.push(h, n, d); centrals.push(ch, n);
    off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const kitZip = (ver, full, extra = {}) => makeZip({
  [`${KIT}/runtime/python/python.exe`]: 'fake',
  [`${KIT}/app/main.py`]: `VERSION = '${ver}'\n`,
  [`${KIT}/說明.txt`]: '測試用',
  ...(full ? { [`${KIT}/runtime/audiveris/Audiveris.exe`]: 'fake' } : {}),
  ...extra,
});

export default {
  name: '在桌面版裡安裝、整包更新辨識套件',
  needsApp: true,
  async setup() {
    const dir = mkdtempSync(join(tmpdir(), 'vitools-recinst-'));
    const zips = {
      '0.9.0': { exam: kitZip('0.9.0', false), full: kitZip('0.9.0', true) },
      '0.9.1': { exam: kitZip('0.9.1', false, { [`${KIT}/padding.bin`]: 'x'.repeat(3_000_000) }), full: kitZip('0.9.1', true, { [`${KIT}/padding.bin`]: 'y'.repeat(3_000_000) }) },
      bad: { exam: makeZip({ 'other/app/main.py': "VERSION = '1.0.0'\n" }), full: makeZip({ 'x.txt': '' }) },
    };
    const state = { ver: '0.9.0', corrupt: false, slow: false, hits: 0 };
    const name = (v, ed) => `vi-tools-recognizer-${v}-${ed === 'exam' ? 'exam-' : ''}portable.zip`;
    const server = createServer(async (req, res) => {
      state.hits++;
      const port = server.address().port;
      if (req.url === '/latest') {
        const z = zips[state.ver];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          tag_name: 'v' + state.ver,
          assets: ['exam', 'full'].map(ed => ({
            name: name(state.ver, ed), size: z[ed].length,
            digest: 'sha256:' + createHash('sha256').update(z[ed]).digest('hex'),
            browser_download_url: `http://127.0.0.1:${port}/dl/${ed}`,
          })),
        }));
        return;
      }
      const m = req.url.match(/^\/dl\/(exam|full)$/);
      if (!m) { res.writeHead(404); res.end(); return; }
      let data = Buffer.from(zips[state.ver][m[1]]);
      if (state.corrupt) data[data.length - 30] ^= 0xff;   // 大小一樣，內容壞掉
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': data.length });
      if (!state.slow) { res.end(data); return; }
      // 很慢的網路：一點一點送（測「停止下載」）
      for (let i = 0; i < data.length && !res.destroyed; i += 4096) {
        res.write(data.subarray(i, i + 4096));
        await new Promise(r => setTimeout(r, 50));
      }
      res.end();
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return {
      state, dir,
      env: { VITOOLS_RECOGNIZER_API: `http://127.0.0.1:${server.address().port}/latest`, VITOOLS_RECOGNIZER_INSTALL_DIR: dir },
      teardown: () => new Promise(r => server.close(r)).then(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }),
    };
  },
  async run({ cdp, check, win, sleep, state, dir }) {
    const W = win('frame-layout');
    await cdp.ev(`switchTo('frame-layout'); true`);
    for (let i = 0; i < 40; i++) {
      if (await cdp.ev(`(() => { try { return !!(${W}.vitoolsHaodian && ${W}.vitoolsDesktop); } catch { return false; } })()`)) break;
      await sleep(250);
    }
    const kit = join(dir, KIT);
    const st0 = await cdp.ev(`${W}.vitoolsDesktop.recognizer.status()`);
    check('features 有 recognizerInstall', await cdp.ev(`${W}.vitoolsDesktop.features.includes('recognizerInstall')`));
    check('一開始沒有辨識套件', st0 && !st0.found, JSON.stringify(st0));

    // 版面整理工具列：沒有辨識套件 → 三個安裝按鈕
    // 打開版面整理就會出現（不要按「找本機辨識套件」：桌面版找不到時會跳出選資料夾的視窗）
    let btns = [];
    for (let i = 0; i < 40 && btns.length < 3; i++) {
      await sleep(250);
      btns = await cdp.ev(`(() => { const el = ${W}.document.getElementById('ly-hd-inst'); return el.hidden ? [] : [...el.querySelectorAll('button')].map(b => b.textContent); })()`);
    }
    check('版面整理：沒有辨識套件時出現「安裝辨識套件」按鈕（試卷版、完整版、選 zip）',
      btns.length === 3 && /試卷版/.test(btns[0]) && /完整版/.test(btns[1]) && /zip/.test(btns[2]), JSON.stringify(btns));

    // 按「安裝辨識套件（試卷版）」
    await cdp.ev(`(() => { ${W}.document.querySelector('#ly-hd-inst button').click(); return true; })()`);
    let name = '';
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      name = await cdp.ev(`${W}.document.getElementById('ly-hd').hidden ? '' : ${W}.document.getElementById('ly-hd-name').textContent`);
      if (name) break;
    }
    const st1 = await cdp.ev(`${W}.vitoolsDesktop.recognizer.status()`);
    check('按鈕安裝：裝好後工具列顯示「已找到辨識套件 0.9.0」', /已找到辨識套件 0\.9\.0/.test(name), name);
    check('裝在指定的資料夾、試卷版', st1.found && st1.version === '0.9.0' && st1.edition === 'exam' && st1.path.toLowerCase() === kit.toLowerCase(), JSON.stringify(st1));
    check('安裝按鈕收起來', await cdp.ev(`${W}.document.getElementById('ly-hd-inst').hidden`));
    check('下載暫存檔、.new 資料夾都清掉', !existsSync(join(dir, 'vi-tools-recognizer-download.part')) && !existsSync(kit + '.new'));
    writeFileSync(join(kit, '輸出', '我的結果.txt'), '辨識結果');

    // 新版、下載的檔案壞掉 → 不裝，原本的不變
    state.ver = '0.9.1'; state.corrupt = true;
    const bad = await cdp.ev(`${W}.vitoolsHaodian.install({ edition: '' }).then(() => 'ok', e => e.message)`);
    let st = await cdp.ev(`${W}.vitoolsDesktop.recognizer.status()`);
    check('檔案損壞（雜湊值不符）：不裝，告訴使用者', /不完整/.test(bad), bad);
    check('檔案損壞：原本的 0.9.0 還在', st.version === '0.9.0' && existsSync(join(kit, '輸出', '我的結果.txt')), JSON.stringify(st));

    // 整包更新：照原本的試卷版，輸出搬過去，進度有回報
    state.corrupt = false;
    const prog = await cdp.ev(`(async () => {
      const seen = [];
      const st = await ${W}.vitoolsDesktop.recognizer.install({ edition: '' }, p => seen.push(p.stage + ':' + (p.total ? Math.round(p.done * 100 / p.total) : 0)));
      return { st, seen };
    })()`);
    check('整包更新：換成 0.9.1、還是試卷版', prog.st.version === '0.9.1' && prog.st.edition === 'exam', JSON.stringify(prog.st));
    check('整包更新：進度有下載、解壓縮、換上', ['download', 'extract', 'replace'].every(s => prog.seen.some(x => x.startsWith(s + ':'))) && prog.seen.includes('download:100'), prog.seen.join(' '));
    check('整包更新：「輸出」裡的辨識結果搬過去', existsSync(join(kit, '輸出', '我的結果.txt')) && readFileSync(join(kit, '輸出', '我的結果.txt'), 'utf8') === '辨識結果');
    let oldGone = false;
    for (let i = 0; i < 20 && !(oldGone = !existsSync(kit + '.old')); i++) await sleep(250);
    check('整包更新：換下來的舊資料夾刪掉', oldGone);

    // 停止下載：原本的不變
    state.slow = true;
    const stopped = await cdp.ev(`(async () => {
      const d = ${W}.vitoolsDesktop;
      const p = d.recognizer.install({ edition: 'full' }).then(() => 'ok', e => e.message);
      await new Promise(r => setTimeout(r, 800));
      d.recognizer.cancel();
      return p;
    })()`);
    st = await cdp.ev(`${W}.vitoolsDesktop.recognizer.status()`);
    check('停止下載：install() 回「已停止」', /已停止/.test(stopped), stopped);
    check('停止下載：原本的 0.9.1 還在、暫存檔清掉', st.version === '0.9.1' && !st.installing && !existsSync(join(dir, 'vi-tools-recognizer-download.part')), JSON.stringify(st));
    state.slow = false;

    // 不是辨識套件的 zip → 不裝
    state.ver = 'bad';
    const notKit = await cdp.ev(`${W}.vitoolsHaodian.install({ edition: 'exam' }).then(() => 'ok', e => e.message)`);
    st = await cdp.ev(`${W}.vitoolsDesktop.recognizer.status()`);
    check('zip 裡不是辨識套件：不裝', /不是 vi-tools 辨識套件/.test(notKit) && st.version === '0.9.1', notKit);

    // 換成完整版
    state.ver = '0.9.1';
    st = await cdp.ev(`${W}.vitoolsDesktop.recognizer.install({ edition: 'full' })`);
    check('換成完整版', st.edition === 'full' && st.version === '0.9.1' && existsSync(join(kit, '輸出', '我的結果.txt')), JSON.stringify(st));
  },
};
