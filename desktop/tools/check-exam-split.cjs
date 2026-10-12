// 拿老師以前用 Balabolka「依空行分割」做的語音卷驗證 exam-split.js（改切分規則後跑一次，需要 H: 的 Google 雲端硬碟）
//   node desktop/tools/check-exam-split.cjs [視巡資料夾]
// 自動判斷：以每段第一行當切點，和老師用空行切的切點比較（2026-10-12：1015 個切點找到 997 個，98.2%）
// 依空行切：段數和當年的 mp3 數量比較（12 份中 11 份相同；106 英語當年是依兩個空行切，多 1 段）
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', '..', 'exam-split.js'));
const root = process.argv[2] || 'H:\\我的雲端硬碟\\視巡';
// [Big5 文字檔, 當年的 mp3 數量]（106 地理有兩個 mp3 資料夾，各算一次）
const PAIRS = [
  ['102\\點字試卷\\大樹3上1段\\社會.txt', 101],
  ['103\\點字試卷\\103_文山2上2段\\社會.txt', 102],
  ['104\\點字試卷\\中正三上二複\\語音卷\\104(2)社會9-3教育會考.txt', 115],
  ['104\\點字試卷\\中正三上二複\\語音卷\\104(2)國文9-3教育會考.txt', 101],
  ['104\\點字試卷\\中正三上二複\\語音卷\\104(2)自然9-3教育會考.txt', 93],
  ['106\\點字試卷\\大樹3B2\\地理.txt', 71],
  ['106\\點字試卷\\大樹3B2\\地理.txt', 71],
  ['106\\點字試卷\\大樹3B2\\英語.txt', 89],
  ['106\\點字試卷\\大樹3B2\\國文.txt', 101],
  ['106\\點字試卷\\大樹3B2\\理化.txt', 76],
  ['106\\點字試卷\\大樹3B2\\數學.txt', 21],
  ['106\\點字試卷\\大樹3B2\\歷史.txt', 73],
];
const dec = new TextDecoder('big5');
const norm = s => s.replace(/[\s\u3000]+/g, '');
const firstLine = t => norm(t.split('\n').find(l => l.trim()) || '');
let totalT = 0, totalBoth = 0, blankSame = 0;
for (const [rel, mp3] of PAIRS) {
  const raw = dec.decode(fs.readFileSync(path.join(root, rel))).replace(/\r\n?/g, '\n');
  const teacher = raw.split(/\n(?:[ \t\u3000]*\n)+/).filter(b => b.trim()).map(firstLine);
  const auto = S.split(raw).map(s => firstLine(raw.slice(s.start, s.end))).filter(Boolean);
  const tset = new Set(teacher), aset = new Set(auto);
  const both = teacher.filter(x => aset.has(x)).length;
  totalT += teacher.length; totalBoth += both;
  const blank = S.split(raw, { mode: 'blank' }).length;
  if (blank === mp3) blankSame++;
  console.log(`\n== ${rel}\n  老師 ${teacher.length} 段、自動 ${auto.length} 段、切點相同 ${both}；依空行切 ${blank} 段、mp3 ${mp3} 個`);
  const onlyT = teacher.filter(x => !aset.has(x)), onlyA = auto.filter(x => !tset.has(x));
  if (onlyT.length) console.log('  只有老師切：', onlyT.slice(0, 8).map(s => s.slice(0, 40)).join(' ｜ '));
  if (onlyA.length) console.log('  只有自動切：', onlyA.slice(0, 6).map(s => s.slice(0, 40)).join(' ｜ '));
}
console.log(`\n自動判斷：老師的切點找到 ${totalBoth}/${totalT}（${(100 * totalBoth / totalT).toFixed(1)}%）`);
console.log(`依空行切：段數和 mp3 相同 ${blankSame}/${PAIRS.length}`);
