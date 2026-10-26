#!/usr/bin/env node
// 由 logo.svg（32 像素以上）與 logo-small.svg（16～24 像素）產生圖示：node tools/build-icons.mjs
//   favicon.ico            網頁分頁圖示：16、24（小尺寸版）＋ 32、48、64
//   apple-touch-icon.png   手機加到主畫面：180，白底
//   desktop/app.ico        桌面版 ViTools.exe：16、20、24（小尺寸版）＋ 32、40、48、64、256
// 用 Edge（headless）把 SVG 畫到 canvas 取得像素：本程式開一個暫時的本機網頁伺服器，讓 Edge 讀同源的 SVG
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SMALL_MAX = 24;   // 這個大小以下用 logo-small.svg
const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];

const PAGE = `<!DOCTYPE html><html><body><pre id="out">wait</pre><script>
const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
(async () => {
  const [full, small] = await Promise.all([load('/logo.svg'), load('/logo-small.svg')]);
  const out = {};
  for (const s of ${JSON.stringify(SIZES)}) {
    const c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    g.drawImage(s <= ${SMALL_MAX} ? small : full, 0, 0, s, s);
    const px = g.getImageData(0, 0, s, s).data;
    let bin = ''; for (let i = 0; i < px.length; i++) bin += String.fromCharCode(px[i]);
    out[s] = { png: c.toDataURL('image/png').split(',')[1], rgba: btoa(bin) };
  }
  // 手機主畫面圖示：白底（iOS 會把透明的地方填黑），四周留一點空白
  const c = document.createElement('canvas'); c.width = c.height = 180;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 180, 180); g.drawImage(full, 9, 9, 162, 162);
  out.touch = c.toDataURL('image/png').split(',')[1];
  document.getElementById('out').textContent = JSON.stringify(out);
})().catch(e => { document.getElementById('out').textContent = 'ERROR ' + e; });
</script></body></html>`;

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/__icons.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
  const f = join(ROOT, path);
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': extname(f) === '.svg' ? 'image/svg+xml' : 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/__icons.html`;

const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
if (!edge) { console.error('找不到 Microsoft Edge'); process.exit(1); }
let dom;
try {
  // 要用非同步的 execFile：同步的會卡住事件迴圈，伺服器就回不了 Edge
  dom = await new Promise((ok, fail) => execFile(edge, ['--headless=new', '--disable-gpu', '--virtual-time-budget=10000', '--dump-dom', url],
    { maxBuffer: 64 << 20 }, (err, stdout) => err && !stdout ? fail(err) : ok(stdout)));
} finally { server.close(); }
const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m || !m[1].startsWith('{')) { console.error('Edge 沒有畫出圖示：', m ? m[1].slice(0, 200) : dom.slice(0, 200)); process.exit(1); }
const out = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

// ICO：256 用 PNG，其他用 32 位元 BMP（舊程式、資源編譯器都認得）
function bmpEntry(s) {
  const rgba = Buffer.from(out[s].rgba, 'base64');
  const maskRow = Math.ceil(s / 32) * 4;
  const buf = Buffer.alloc(40 + s * s * 4 + maskRow * s);
  buf.writeUInt32LE(40, 0); buf.writeInt32LE(s, 4); buf.writeInt32LE(s * 2, 8);
  buf.writeUInt16LE(1, 12); buf.writeUInt16LE(32, 14); buf.writeUInt32LE(s * s * 4 + maskRow * s, 20);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const src = ((s - 1 - y) * s + x) * 4, dst = 40 + (y * s + x) * 4;   // BMP 由下往上
    buf[dst] = rgba[src + 2]; buf[dst + 1] = rgba[src + 1]; buf[dst + 2] = rgba[src]; buf[dst + 3] = rgba[src + 3];
  }
  return buf;   // AND 遮罩全 0（透明度看 alpha）
}
function ico(sizes) {
  const imgs = sizes.map(s => s >= 256 ? Buffer.from(out[s].png, 'base64') : bmpEntry(s));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
    off += imgs[i].length;
  });
  return Buffer.concat([head, ...imgs]);
}

const files = {
  'favicon.ico': ico([16, 24, 32, 48, 64]),
  'apple-touch-icon.png': Buffer.from(out.touch, 'base64'),
  'desktop/app.ico': ico([16, 20, 24, 32, 40, 48, 64, 256]),
};
for (const [f, b] of Object.entries(files)) { writeFileSync(join(ROOT, f), b); console.log(`${f}：${(b.length / 1024).toFixed(1)} KB`); }
