/*
 * 與 music21 點字測試（《Introduction to Braille Music Transcription》例題）的標準答案比對。
 *
 * 用法：node tests/m21-compare.js <匯出資料夾> [--show N] [--only id,id]
 * 匯出資料夾由 tests/m21_export.py 產生（內含 cases.json 與各題 MusicXML）。
 */
const fs = require('fs');
const path = require('path');
const MB = require('./load.js');
const B = MB.brf;

const dir = process.argv[2];
const showArg = process.argv.indexOf('--show');
const show = showArg > 0 ? +process.argv[showArg + 1] : 0;
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',').map(Number)) : null;
const cases = JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8'));

/** 標準化排版：每行去頭尾空白、去空行。 */
function norm(brf) {
  return brf
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * 音樂內容：去掉標頭行（行首縮排的置中行）、行首小節號、鍵盤格式的手號；
 * 合併被音樂連字號斷開的行，再以空白切成片段。
 */
function musicTokens(brf, keyboard) {
  const lines = brf.split('\n').filter((l) => l.trim());
  const out = { R: [], L: [], S: [] };
  let hand = 'S';
  let pending = { R: '', L: '', S: '' };
  for (const raw of lines) {
    // 置中的標頭（前面有 3 個以上空白，且不是手號行）
    if (/^\s{3,}\S/.test(raw) && !/(\.>|_>)/.test(raw)) continue;
    let l = raw.trim();
    l = l.replace(/^#[A-J]+'?\s+/, ''); // 單行格式的小節號
    if (keyboard) {
      const m = /^([A-J]+'?\s*)?(\.>|_>)'?\s*/.exec(l);
      if (m) {
        hand = m[2] === '.>' ? 'R' : 'L';
        l = l.slice(m[0].length);
      }
    }
    const h = keyboard ? hand : 'S';
    let text = pending[h] + l;
    pending[h] = '';
    if (/"$/.test(text)) {
      // 行尾音樂連字號：與下一行接續
      pending[h] = text.slice(0, -1);
      continue;
    }
    out[h].push(...text.split(/\s+/).filter((t) => t && !/^'+$/.test(t)));
  }
  for (const h of ['R', 'L', 'S']) if (pending[h]) out[h].push(...pending[h].split(/\s+/).filter(Boolean));
  // 標頭在行內的情況（例如單一小節的 #C4）：去掉獨立的拍號、調號片段
  const isSig = (t) => /^(\*{1,3}|#[A-J]+\*)?(%{1,3}|<{1,3}|#[A-J]+[%<])?(#[A-J]+[0-9]+|\.C|_C)$/.test(t) && /#|\.C|_C/.test(t);
  for (const h of ['R', 'L', 'S']) out[h] = out[h].filter((t) => !isSig(t));
  return keyboard ? out.R.join(' ') + ' || ' + out.L.join(' ') : out.S.join(' ');
}

function ourBraille(c) {
  const opts = { suppressOctaveMarks: !!c.args.suppressOctaveMarks };
  if (c.method === 'keyboardPartsToBraille') {
    const parts = c.files.map((f) => MB.parseMusicXML(fs.readFileSync(path.join(dir, f), 'utf8')).score);
    const score = parts[0];
    score.keyboard = true;
    score.parts = [Object.assign(parts[0].parts[0], { hand: 'R', id: 'R' }), Object.assign(parts[1].parts[0], { hand: 'L', id: 'L', clef: 'bass' })];
    MB.model.markSplitMeasures(score);
    return MB.toBraille(score, opts).brf;
  }
  const r = MB.parseMusicXML(fs.readFileSync(path.join(dir, c.files[0]), 'utf8'));
  return MB.toBraille(r.score, opts).brf;
}

const results = [];
for (const c of cases) {
  if (only && !only.has(c.id)) continue;
  const exp = B.toBrf(c.expected);
  let got;
  try {
    got = ourBraille(c);
  } catch (e) {
    results.push({ c, status: 'error', err: e.message });
    continue;
  }
  const kb = c.method === 'keyboardPartsToBraille';
  if (norm(got) === norm(exp)) results.push({ c, status: 'exact', exp, got });
  else if (musicTokens(got, kb) === musicTokens(exp, kb)) results.push({ c, status: 'music', exp, got });
  else results.push({ c, status: 'diff', exp, got, te: musicTokens(exp, kb), tg: musicTokens(got, kb) });
}

const count = (s) => results.filter((r) => r.status === s).length;
console.log('共 ' + results.length + ' 題');
console.log('  完全相同（含排版）：' + count('exact'));
console.log('  音樂內容相同（排版不同）：' + count('music'));
console.log('  不同：' + count('diff'));
console.log('  程式錯誤：' + count('error'));
const diffs = results.filter((r) => r.status === 'diff' || r.status === 'error');
for (const r of diffs.slice(0, show || 0)) {
  console.log('\n#' + r.c.id + ' ' + r.c.test + ' (' + r.c.method + ' ' + JSON.stringify(r.c.args) + ')');
  if (r.err) {
    console.log('  錯誤：' + r.err);
    continue;
  }
  console.log('  答案：' + r.te);
  console.log('  我們：' + r.tg);
}
fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results.map((r) => ({ id: r.c.id, test: r.c.test, method: r.c.method, args: r.c.args, status: r.status, err: r.err, exp: r.exp, got: r.got, te: r.te, tg: r.tg })), null, 1));
