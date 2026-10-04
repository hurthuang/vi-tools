// 觸摸圖點陣轉換的除錯工具：node tools/tactile-raster-harness.mjs <灰階 raw 檔> <寬> <高> <每點像素 SS> [輸出 pgm]
//   從 tactile.html 抽出 thin / dropSpecks / straighten / closeShade / linePts，照頁面的順序跑，印出每一步剩幾點
//   raw 檔：一個像素一 byte 的灰階，寬 = 點數 × SS（頁面用 SS = 6）；可用 PyMuPDF 把 PDF 的框選範圍畫成灰階
//   DEBUG=1 時另外印出拉直（straighten）的中間結果
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tactile.html'), 'utf8');

function extract(name) {
  const start = html.indexOf(`  function ${name}(`);
  if (start < 0) throw new Error('找不到 ' + name);
  let i = html.indexOf('{', start), depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) break;
  }
  return html.slice(start, i + 1);
}
let src = ['thin', 'dropSpecks', 'straighten', 'closeShade', 'linePts'].map(extract).join('\n');
if (process.env.DEBUG) {   // 拉直的中間結果
  const sumPix = 'edges.reduce((a, e) => a + e.path.length, 0)';
  src = src
    .replace('    // 同一條直線穿過交叉點', `    console.log('traced: nodes', nodes.length, 'edges', edges.length, 'pix', ${sumPix});\n    // 同一條直線穿過交叉點`)
    .replace('    for (const nd of nodes) nd.through = [];', `    console.log('merged: edges', edges.length, 'pix', ${sumPix});\n    for (const nd of nodes) nd.through = [];`)
    .replace('    b.fill(0);', `    console.log('draw: lens', edges.map(e => e.path.length + ':' + e.verts.length + ':' + e.a + '-' + e.z).join(' '));\n    b.fill(0);`);
}
const lib = new Function(src + '\nreturn { thin, dropSpecks, straighten, closeShade, linePts };')();

const [rawFile, PW, PH, SSs, out] = process.argv.slice(2);
const pw = +PW, ph = +PH, SS = +SSs, MIN_PX = 4, THR = 180;
const lum = fs.readFileSync(rawFile);
const fw = Math.floor(pw / SS), fh = Math.floor(ph / SS);
const cnt = new Uint16Array(fw * fh);
for (let y = 0; y < fh * SS; y++) for (let x = 0; x < fw * SS; x++) if (lum[y * pw + x] < THR) cnt[((y / SS) | 0) * fw + ((x / SS) | 0)]++;
const bits = new Uint8Array(fw * fh);
for (let i = 0; i < bits.length; i++) bits[i] = cnt[i] >= MIN_PX ? 1 : 0;
const sum = () => bits.reduce((a, v) => a + v, 0);
console.log('size', fw, fh, 'dark cells', sum());
lib.thin(bits, fw, fh); console.log('after thin', sum());
const specks = lib.dropSpecks(bits, fw, fh); console.log('after dropSpecks', sum(), 'specks', specks.length);
lib.straighten(bits, fw, fh); console.log('after straighten', sum());
if (out) {
  const img = Buffer.alloc(fw * fh);
  for (let i = 0; i < bits.length; i++) img[i] = bits[i] ? 0 : 255;
  fs.writeFileSync(out, Buffer.concat([Buffer.from(`P5 ${fw} ${fh} 255\n`), img]));
}
