// 觸摸圖（tactile.html）核心測試：node tools/check-tactile.mjs
//   PRN 編解碼（含紙張尺寸與標頭檢查碼）、點字轉換（標題、標籤、破音字）
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = createRequire(import.meta.url)(path.join(root, 'prn-core.js'));
P.loadZh(fs.readFileSync(path.join(root, 'table', 'zh-tw.ctb'), 'utf8'),
         JSON.parse(fs.readFileSync(path.join(root, 'bt-zh-supplement-rules.json'), 'utf8')));

let fail = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (extra ? '  ' + extra : '')); if (!ok) fail++; };

// ── 標頭：ViewPlus 驅動程式印 12×11 吋的標頭（使用者的實際檔案） ──
check('12×11 標頭與驅動程式相同', Buffer.from(P.header(240, 220)).toString('hex') === '1b04001001f000dc000000000000ff01');

// ── Tiger Designer 存的空白頁：除了第 3–4 byte（00 c0 / 00 10）與檢查碼，重新編碼要相同 ──
for (const [file, W, H] of [['tactile-8.5x11.prn', 170, 220], ['tactile-11x11.5.prn', 220, 230]]) {
  const b = fs.readFileSync(path.join(root, 'tools', 'fixtures', file));
  const d = P.decode(b);
  check(`${file} 解碼 ${W} × ${H}`, d.w === W && d.h === H && d.pages.length === 1, `${d.w} × ${d.h}`);
  const e = Buffer.from(P.encode(d.pages, d.w, d.h));
  check(`${file} 重新編碼相同`, e.length === b.length && [...e].every((v, i) => v === b[i] || i === 3 || i === 14 || i === 15));
  const sum = [...b.slice(0, 14)].reduce((a, x) => a + x, 0) + 3;
  check(`${file} 檢查碼 = 前 14 bytes 加總 + 3`, (b[14] | (b[15] << 8)) === sum);
}

// ── 編解碼來回：各種內容（空白列、重複、零散） ──
for (const [W, H] of [[240, 220], [170, 220], [220, 230], [166, 234]]) {
  const pages = [0, 1].map(seed => {
    const p = new Uint8Array(W * H);
    for (let i = 0; i < p.length; i++) {
      const y = (i / W) | 0, x = i % W;
      if (y % 7 === 0) continue;                                // 空白列
      if (y % 5 === 0) p[i] = 7;                                // 整列實線（重複）
      else if ((x * 31 + y * 17 + seed) % 23 === 0) p[i] = [3, 7, 15][(x + y) % 3];   // 零散
    }
    return p;
  });
  const d = P.decode(P.encode(pages, W, H));
  check(`來回 ${W} × ${H}`, d.w === W && d.h === H && d.pages.length === 2 && d.pages.every((p, k) => p.every((v, i) => v === pages[k][i])));
}

// ── 點字：標題（上位數字 + 數字記號） ──
for (const [t, want] of Object.entries({
  '選擇 4. 圖一': '⠑⠘⠈⠓⠮⠂⠀⠼⠙⠲⠀⠋⠌⠂⠡⠄',
  '選擇 23. 圖十三': '⠑⠘⠈⠓⠮⠂⠀⠼⠃⠉⠲⠀⠋⠌⠂⠊⠱⠂⠑⠧⠄',
  '非選 1.': '⠟⠴⠄⠑⠘⠈⠀⠼⠁⠲',
  'M1': '⠠⠍⠂', 'L₁': '⠠⠇⠂',
})) { const got = P.toBraille(t).braille; check(`標題 ${t}`, got === want, got); }

// ── 點字：標籤（下位數字；單獨數字、開頭、空白與比較符號後加數字記號） ──
for (const [t, want] of Object.entries({
  'A': '⠠⠁', 'M12': '⠠⠍⠂⠆', '3': '⠼⠒', '12': '⠼⠂⠆', '2.5': '⠼⠆⠨⠢',
  '2x+1': '⠼⠆⠭⠬⠂', 'x+2': '⠭⠬⠆', '3x−y': '⠼⠒⠭⠤⠽', '2(a+b)': '⠼⠆⠷⠁⠬⠃⠾',
  'x=3': '⠭⠀⠨⠅⠀⠼⠒', 'x>2': '⠭⠀⠨⠂⠀⠼⠆', 'x+y=12': '⠭⠬⠽⠀⠨⠅⠀⠼⠂⠆', '甲': '⠅⠾⠈',
})) { const got = P.toBraille(t, { lowerDigits: true }).braille; check(`標籤 ${t}`, got === want, got); }

// ── 破音字、異體字（zh-tw.ctb 的前後文與 correct 規則） ──
for (const [t, want] of Object.entries({ '長大': '⠁⠭⠈⠙⠜⠐', '長度': '⠃⠭⠂⠙⠌⠐', '銀行': '⠹⠂⠗⠭⠂', '行走': '⠑⠽⠂⠓⠷⠈', '重複': '⠃⠯⠂⠟⠌⠐' })) {
  const got = P.toBraille(t).braille; check(`破音 ${t}`, got === want, got);
}
check('異體字 图 → 圖', P.toBraille('图').braille === P.toBraille('圖').braille);

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
