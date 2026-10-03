/*
 * 批次測試：node tests/batch.js <資料夾> [--verbose]
 * 對資料夾（含子資料夾）內所有 .abc / .xml / .musicxml / .mxl：
 *   1. 讀入（記錄警告）
 *   2. 轉點字（記錄警告），再讀回點字，比對音樂內容
 *   3. 轉 MusicXML 再讀回，比對音樂內容
 *   4. 轉 ABC 再讀回，比對音樂內容
 */
const fs = require('fs');
const path = require('path');
const MB = require('./load.js');
// 中文歌詞的國語點字：有視障輔助工具集（放在旁邊的 tool-music 或 tool 資料夾）時載入它的 zh-tw.ctb 與多音字補充詞表
for (const dir of ['tool-music', 'tool']) {
  const root = path.join(__dirname, '..', '..', dir);
  if (!fs.existsSync(path.join(root, 'table', 'zh-tw.ctb'))) continue;
  MB.zhBraille.load(fs.readFileSync(path.join(root, 'table', 'zh-tw.ctb'), 'utf8'));
  const words = path.join(root, 'bt-zh-supplement-rules.json');
  if (fs.existsSync(words)) MB.zhBraille.loadWords(JSON.parse(fs.readFileSync(words, 'utf8')));
  break;
}

const dir = process.argv[2];
const verbose = process.argv.includes('--verbose');
// --part piano：MusicXML 取第一個有兩行譜表的聲部（例如藝術歌曲的鋼琴）；--part N：第 N 個聲部（從 0 起算）
const partArg = process.argv.indexOf('--part');
const partOpt = partArg > 0 ? (process.argv[partArg + 1] === 'piano' ? 'piano' : +process.argv[partArg + 1]) : undefined;
if (!dir) {
  console.log('用法：node tests/batch.js <資料夾> [--verbose]');
  process.exit(1);
}

function summary(score) {
  return score.parts
    .map((p) =>
      p.measures
        .map((m) =>
          m.voices
            .map((v) =>
              v
                .map((e) => {
                  const d = e.measureRest ? 'M' : e.value + '.'.repeat(e.dots || 0) + (e.tuplet ? 't' + e.tuplet.n : '');
                  const pitch = (n) => n.step + n.octave + (n.alter ? (n.alter > 0 ? '#'.repeat(n.alter) : 'b'.repeat(-n.alter)) : '');
                  // 附加記號：倚音、裝飾音、琶音、踏板
                  let x = '';
                  if (e.graces) x += '{' + e.graces.map((g) => pitch(g.notes[0]) + '/' + g.value + (g.slash ? 's' : '')).join(',') + '}';
                  if (e.ornaments) x += '~' + e.ornaments.join('~');
                  if ((e.articulations || []).includes('arpeggio')) x += '$arp';
                  if (e.pedalDown) x += 'P↓';
                  if (e.pedalChange) x += 'P*';
                  if (e.pedalUp) x += 'P↑';
                  if (e.kind === 'rest') return x + 'z' + d;
                  return x + e.notes.slice().sort((a, b) => MB.model.diatonic(a) - MB.model.diatonic(b) || (a.alter || 0) - (b.alter || 0)).map((n) => pitch(n) + (n.finger ? '(' + n.finger + ')' : '') + (n.tie ? '~' : '')).join('+') + '/' + d;
                })
                .join(' ')
            )
            .sort().join(' & ') +
          // 反覆指示
          ['segno', 'codaStart', 'toCoda', 'fine'].filter((k) => m[k]).map((k) => ' #' + k).join('') +
          (m.jump ? ' #' + m.jump.type + (m.jump.to || '') : '')
        )
        .join(' | ')
    )
    .join(' || ');
}
function firstDiff(a, b) {
  const x = a.split(' | ');
  const y = b.split(' | ');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return '小節 ' + i + '：\n      原：' + x[i] + '\n      回：' + y[i];
  return '';
}

function walk(d) {
  let out = [];
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(abc|xml|musicxml|mxl)$/i.test(f) && !f.startsWith('.')) out.push(p);
  }
  return out;
}

const msgCount = {};
function countMsg(stage, msg) {
  const k = stage + '｜' + msg.replace(/第 ?\d+ ?(個)?小節/g, '第 N 小節').replace(/「[^」]*」/g, '「…」').replace(/\d+/g, 'N');
  msgCount[k] = (msgCount[k] || 0) + 1;
}

async function main() {
  const files = walk(dir).sort();
  const rows = [];
  for (const file of files) {
    const rel = path.relative(dir, file);
    const row = { file: rel, ok: true, notes: [] };
    try {
      let r;
      if (/\.abc$/i.test(file)) {
        r = MB.parseAbc(fs.readFileSync(file, 'utf8').replace(/\r/g, ''));
        row.kind = 'ABC';
      } else {
        const buf = fs.readFileSync(file);
        const text = await MB.readMusicXMLBytes(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        r = MB.parseMusicXML(text, { part: partOpt });
        row.kind = 'XML';
      }
      const sc = r.score;
      row.shape = (sc.keyboard ? '鋼琴' : '單聲部') + ' ' + sc.parts[0].measures.length + '小節';
      row.inWarn = r.warnings.length;
      r.warnings.forEach((w) => countMsg('讀入', w.msg));
      if (verbose) r.warnings.forEach((w) => row.notes.push('讀入：' + w.msg));

      const b = MB.toBraille(sc, process.env.LINE_MODE ? { lineMode: process.env.LINE_MODE } : undefined);
      row.brlWarn = b.warnings.length;
      b.warnings.forEach((w) => countMsg('點字', w.msg));
      if (b.warnings.length) row.notes.push('點字：' + b.warnings.map((w) => w.msg).join('；'));
      const wide = b.brf.split('\n').filter((l) => l.length > 40).length;
      if (wide) row.notes.push('有 ' + wide + ' 行超過 40 方');

      const dir2 = !sc.keyboard && sc.parts[0].clef === 'bass' ? 'up' : undefined;
      const rb = MB.parseBraille(b.brf, { intervalDir: dir2 });
      rb.warnings.forEach((w) => countMsg('讀回點字', w.msg));
      const s0 = summary(sc);
      row.brl = summary(rb.score) === s0;
      if (!row.brl) row.notes.push('點字來回不一致 ' + firstDiff(s0, summary(rb.score)));
      if (rb.warnings.length) row.notes.push('讀回點字：' + rb.warnings.map((w) => w.msg).join('；'));

      const rx = MB.parseMusicXML(MB.toMusicXML(sc));
      row.xml = summary(rx.score) === s0;
      if (!row.xml) row.notes.push('MusicXML 來回不一致 ' + firstDiff(s0, summary(rx.score)));

      const ra = MB.parseAbc(MB.toAbc(sc).abc);
      row.abc = summary(ra.score) === s0;
      if (!row.abc) row.notes.push('ABC 來回不一致 ' + firstDiff(s0, summary(ra.score)));
      row.ok = row.brl && row.xml && row.abc && !row.brlWarn && !wide;
    } catch (e) {
      row.ok = false;
      row.error = e.message;
      row.notes.push('錯誤：' + (verbose ? e.stack : e.message));
    }
    rows.push(row);
  }

  const mark = (v) => (v === undefined ? '-' : v ? '✓' : '✗');
  for (const r of rows) {
    console.log(
      (r.ok ? '  ' : '✗ ') + r.file.padEnd(40) + ' ' + (r.kind || '').padEnd(4) + (r.shape || '').padEnd(14) +
        ' 讀入警告 ' + String(r.inWarn ?? '-').padStart(2) + '  點字警告 ' + String(r.brlWarn ?? '-').padStart(2) +
        '  來回 點字' + mark(r.brl) + ' XML' + mark(r.xml) + ' ABC' + mark(r.abc)
    );
    for (const n of r.notes) console.log('      ' + n);
  }
  console.log('\n共 ' + rows.length + ' 個檔案，完全通過 ' + rows.filter((r) => r.ok).length + ' 個，錯誤 ' + rows.filter((r) => r.error).length + ' 個');
  console.log('\n訊息統計（次數）：');
  Object.entries(msgCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(String(v).padStart(4) + '  ' + k));
}
main();
