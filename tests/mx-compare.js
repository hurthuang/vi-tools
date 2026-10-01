/*
 * 以 music21 的讀取結果（tests/mx_reference.py 產生）檢驗我們的 MusicXML 匯入。
 * 用法：node tests/mx-compare.js <資料夾> <參考.json> [--show]
 * 逐譜表、逐小節比對每個音的（起始時間、MIDI 音高、時值），列出第一個不一致的小節。
 */
const fs = require('fs');
const path = require('path');
const MB = require('./load.js');
const M = MB.model;

const [dir, refFile] = process.argv.slice(2);
const show = process.argv.includes('--show');
const partArg = process.argv.indexOf('--part');
const partOpt = partArg > 0 ? (process.argv[partArg + 1] === 'piano' ? 'piano' : +process.argv[partArg + 1]) : undefined;
const ref = JSON.parse(fs.readFileSync(refFile, 'utf8'));

function ourNotes(score) {
  return score.parts.map((p) =>
    p.measures.map((m) => {
      const out = [];
      for (const v of m.voices) {
        let t = 0;
        for (const ev of v) {
          const d = ev.measureRest ? M.meterTicks(M.meterAt(p, p.measures.indexOf(m))) : M.eventTicks(ev);
          if (ev.kind === 'note') for (const n of ev.notes) out.push(t + ':' + M.midiOf(n) + ':' + Math.round((d * 960) / (M.TPW / 4)));
          t += Math.round((d * 960) / (M.TPW / 4));
        }
      }
      return out.sort();
    })
  );
}

/** 比對一個小節的音：起始時間與時值容許 ±3 的四捨五入誤差（連音）。 */
function sameNotes(a, b) {
  if (a.length !== b.length) return false;
  const p = (x) => x.map((t) => t.split(':').map(Number)).sort((u, v) => u[0] - v[0] || u[1] - v[1] || u[2] - v[2]);
  const x = p(a);
  const y = p(b);
  return x.every((u, i) => Math.abs(u[0] - y[i][0]) <= 3 && u[1] === y[i][1] && Math.abs(u[2] - y[i][2]) <= 3);
}

(async () => {
  const rows = [];
  for (const f of Object.keys(ref).sort()) {
    const exp = ref[f];
    if (!Array.isArray(exp)) {
      rows.push({ f, status: 'm21error' });
      continue;
    }
    let got;
    try {
      const buf = fs.readFileSync(path.join(dir, f));
      const text = await MB.readMusicXMLBytes(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      got = ourNotes(MB.parseMusicXML(text, { part: partOpt }).score);
    } catch (e) {
      rows.push({ f, status: 'error', detail: e.message });
      continue;
    }
    let detail = '';
    for (let s = 0; s < Math.max(exp.length, got.length) && !detail; s++) {
      const a = exp[s] || [];
      const b = got[s] || [];
      if (a.length !== b.length) detail = '譜表 ' + (s + 1) + '：小節數 ' + a.length + ' / ' + b.length;
      for (let i = 0; i < Math.max(a.length, b.length) && !detail; i++) {
        if (!sameNotes(a[i] || [], b[i] || []))
          detail = '譜表 ' + (s + 1) + ' 第 ' + (i + 1) + ' 個小節\n      參考：' + (a[i] || []).join(' ') + '\n      我們：' + (b[i] || []).join(' ');
      }
    }
    rows.push({ f, status: detail ? 'diff' : 'ok', detail });
  }
  const n = (s) => rows.filter((r) => r.status === s).length;
  console.log('共 ' + rows.length + ' 個檔案：相符 ' + n('ok') + '，不同 ' + n('diff') + '，我們出錯 ' + n('error') + '，music21 讀不了 ' + n('m21error'));
  for (const r of rows) if (r.status !== 'ok' && (show || r.status === 'error')) console.log('✗ ' + r.f + '  ' + (r.detail || r.status));
  if (!show) console.log('（加上 --show 列出所有不同的檔案）');
})();
