/*
 * 三方比對：本工具 vs MuseScore vs BME 的點字輸出，逐小節列出差異，產生 HTML 報告。
 *
 * 用法：node tests/compare3.js <資料夾> [--part piano|N] [--width 40]
 *
 * 資料夾內每首曲子一組檔案（以主檔名對應）：
 *   曲名.musicxml / .xml / .mxl / .abc   原始樂譜（必要）
 *   曲名.musescore.brf                   MuseScore 匯出的點字（沒有時，若電腦裝了 MuseScore 4 會自動產生）
 *   曲名.bme.brf                         BME 匯出的點字（選用，請手動匯出）
 * 報告寫到 <資料夾>/比對報告.html。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const MB = require('./load.js');
const B = MB.brf;

const args = process.argv.slice(2);
const dir = args[0];
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i > 0 ? args[i + 1] : def;
};
const partOpt = opt('--part', '0') === 'piano' ? 'piano' : +opt('--part', '0');
const width = +opt('--width', '40');
const MUSESCORE = ['C:/Program Files/MuseScore 4/bin/MuseScore4.exe', 'C:/Program Files/MuseScore 3/bin/MuseScore3.exe'].find((p) => fs.existsSync(p));

// ---------------------------------------------------------------- 讀取版面
// 行首小節號：單行格式有 #；bar-over-bar 沒有（本工具靠右對齊，後面接手號）
const NUM_LINE = /^\s*(#?[A-J]+)('?)(\s+|(?=\.>|_>))/;
const isNumLine = (l) => (NUM_LINE.test(l) && !/^\s/.test(l)) || /^\s+[A-J]+\s+(\.>|_>)/.test(l);
const HAND = /^(\.>|_>)'?/;
const CLEF = /^>(\/|#|\+)L'?/; // 譜號（MuseScore 以譜號代替手號）
const SIG = /^(\*{1,3}|#[A-J]+\*)?(%{1,3}|<{1,3}|#[A-J]+[%<])?(#[A-J]+[0-9]+|\.C|_C)?$/;
const TEMPO = /^(,')?[YNZ?DOE:&P$F=Q\]G(R\\H!S\[I)TWJ]'*7#[A-J]+(,')?$/;

/** 把一份點字（BRF）拆成 staves[s][m] = 小節點字片段。 */
function extractMeasures(text, nStaves, firstStaff, takeStaves) {
  const brf = B.toBrf(text.replace(/\r/g, '')).replace(/\f/g, '\n').toUpperCase(); // MuseScore 輸出小寫 BRF
  const lines = brf.split('\n').map((l) => l.replace(/\s+$/, ''));
  // 樂譜開始：第一個以小節號開頭、而且內容含音符的行
  let start = lines.findIndex((l) => isNumLine(l) && /[@^_".;,][YNZ?DOE:&P$F=Q\]G(R\\H!S\[I)TWJ]|[YNZ?DOE:&P$F=Q\]G(R\\H!S\[I)TWJMUVX]/.test(l.replace(NUM_LINE, '')) && !/^#[A-J]+\s+,/.test(l));
  if (start < 0) start = 0;
  // 分成 parallel（或單行格式的段落）
  const groups = [];
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (/^\s{3,}\S/.test(l) && !HAND.test(l.trim()) && SIG.test(l.trim().split(/\s+/)[0]) && l.trim().split(/\s+/).every((t) => SIG.test(t) || TEMPO.test(t))) continue; // 段落標頭
    if (isNumLine(l)) groups.push([l.replace(NUM_LINE, '')]);
    else if (groups.length) groups[groups.length - 1].push(l.trim());
  }
  const staves = Array.from({ length: takeStaves }, () => '');
  const join = (s, add) => (/("|\.K)$/.test(s) ? s.replace(/("|\.K)$/, '') + add : s + (s ? ' ' : '') + add);
  for (const g of groups) {
    const handed = g.some((l) => HAND.test(l));
    if (handed) {
      let cur = -1;
      for (const l of g) {
        const m = HAND.exec(l);
        if (m) cur = m[1] === '.>' ? 0 : 1;
        if (cur < 0 || cur >= takeStaves) continue;
        staves[cur] = join(staves[cur], l.replace(HAND, ''));
      }
    } else if (nStaves > 1 && g.length % nStaves === 0) {
      g.forEach((l, k) => {
        const s = (k % nStaves) - firstStaff;
        if (s >= 0 && s < takeStaves) staves[s] = join(staves[s], l);
      });
    } else {
      // 單一譜表：整個段落接起來
      for (const l of g) staves[0] = join(staves[0], l);
    }
  }
  return staves.map(tokensToMeasures);
}

function tokensToMeasures(text) {
  const out = [];
  let carry = '';
  text = text.replace(/>[A-Z'][A-Z' ]{2,}>/g, ' '); // 文字反覆指示（例如 >D'C' AL FINE>）
  for (let t of text.split(/\s+/).filter(Boolean)) {
    if (/^'+$/.test(t)) continue; // 導引點
    t = t.replace(CLEF, '');
    t = t.replace(/^(>[A-Z0-9>]{2,}')+/, ''); // 文字記號（例如 MuseScore 的速度文字 >M>SSIG'）
    if (!t) continue;
    if (SIG.test(t) || TEMPO.test(t)) continue;
    if (/^>[A-Z' ]+>$/.test(t) || t === '+' || t === '+L' || /^>(FINE|D'?C'?|D'?S'?|CODA)/.test(t)) continue; // 反覆指示
    // 片段開頭的拍號、速度（MuseScore 會寫成 >/L#D4 ,'?7#IF,'）
    t = t.replace(/^(#[A-J]+[0-9]+|\.C|_C)/, '');
    if (carry) {
      t = carry + t;
      carry = '';
    }
    if (/[^'"]("|\.K)$/.test(t)) {
      carry = t.replace(/("|\.K)$/, '');
      continue;
    }
    if (t) out.push(t);
  }
  if (carry) out.push(carry);
  return out;
}

// ---------------------------------------------------------------- 比較
/** 只取音高字母、時值類別、附點、臨時記號與和弦音程（忽略音層記號、指法、表情、踏板等）。 */
function noteSig(meas, sorted) {
  try {
    const r = MB.brailleParseUtil.tokenizeMeasure(meas, Array.from(meas, (_, i) => i), () => {});
    return r.voices
      .map((v) => v.map((e) => (e.kind === 'rest' ? 'z' : e.step) + e.cls + "'".repeat(e.dots) + (e.acc || '') + (e.intervals.length ? '[' + e.intervals.map((x) => (x.acc || '') + x.size).join(',') + ']' : '')).join(' '))
      .sort((x, y) => (sorted ? (x < y ? -1 : x > y ? 1 : 0) : 0))
      .join(' & ');
  } catch (e) {
    return '?' + meas;
  }
}
const OCT_RE = /(@@|,,|[@^_".;,])(?=[YNZ?DOE:&P$F=Q\]G(R\\H!S\[I)TWJ\/+#90\-3])/;
const stripOctaves = (s) => s.replace(new RegExp(OCT_RE.source, 'g'), '');
/** 去掉第一個音符前的音層記號（點字每行第一個音一定要寫音層記號，換行位置不同就會不同）。 */
const stripFirstOctave = (s) => {
  const head = /^[^YNZ?DOE:&P$F=Q\]G(R\\H!S\[I)TWJ]*.?/.exec(s)[0];
  return head.replace(OCT_RE, '') + s.slice(head.length);
};
const RANK = { layout: 1, minor: 2, octave: 3, notes: 4 };
const stripFingers = (s) => s.replace(/([YNZ?DOE:&P$F=Q\]G(R\\H!S\[I)TWJ'\/+#90\-3])[ABL1K]+(C[ABL1K]+)*/g, '$1');
const stripExtras = (s) => s.replace(/\*<C|<C|\*C|>[A-Z]+'?|_8|\.8|,8|8|<L|>K|;B\^2|;B|\^2|\^<1|,<1|[CL]$/g, '');

function classify(a, b) {
  if (a === b) return null;
  if (noteSig(a) !== noteSig(b)) {
    if (noteSig(a, true) === noteSig(b, true)) return { level: 'minor', label: '同時進行的聲部（in-accord）先後順序不同' };
    return { level: 'notes', label: '音高或時值不同' };
  }
  if (stripFirstOctave(a) === stripFirstOctave(b)) return { level: 'layout', label: '只差第一個音的音層記號（換行位置不同，屬正常）' };
  if (stripOctaves(a) === stripOctaves(b)) return { level: 'octave', label: '只差音層記號' };
  if (stripFingers(a) === stripFingers(b)) return { level: 'minor', label: '只差指法' };
  if (stripExtras(stripFingers(stripOctaves(a))) === stripExtras(stripFingers(stripOctaves(b)))) return { level: 'minor', label: '只差表情、踏板、圓滑線等記號' };
  return { level: 'minor', label: '其他寫法不同' };
}

// ---------------------------------------------------------------- 主程式
async function readSource(file) {
  if (/\.abc$/i.test(file)) {
    const r = MB.parseAbc(fs.readFileSync(file, 'utf8').replace(/\r/g, ''));
    return { score: r.score, parts: [{ index: 0, name: '', staves: r.score.keyboard ? 2 : 1 }], partIndex: 0, xmlForMuseScore: MB.toMusicXML(r.score) };
  }
  const buf = fs.readFileSync(file);
  const text = await MB.readMusicXMLBytes(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const r = MB.parseMusicXML(text, { part: partOpt });
  return { score: r.score, parts: r.parts, partIndex: r.partIndex, xmlForMuseScore: null };
}

function museScoreBrf(srcFile, xmlText, out) {
  if (fs.existsSync(out)) return fs.readFileSync(out, 'utf8');
  if (!MUSESCORE) return null;
  let input = srcFile;
  if (xmlText) {
    input = out.replace(/\.musescore\.brf$/, '.tmp.musicxml');
    fs.writeFileSync(input, xmlText);
  }
  try {
    execFileSync(MUSESCORE, ['-o', out, input], { stdio: 'ignore', timeout: 180000 });
  } catch (e) {
    return null;
  } finally {
    if (xmlText && fs.existsSync(input)) fs.unlinkSync(input);
  }
  return fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const uni = (s) => esc(B.toUnicode(s || ''));

(async () => {
  const files = fs.readdirSync(dir).filter((f) => /\.(musicxml|xml|mxl|abc)$/i.test(f) && !/\.tmp\./.test(f));
  const pieces = [];
  for (const f of files.sort()) {
    const base = f.replace(/\.(musicxml|xml|mxl|abc)$/i, '');
    const src = await readSource(path.join(dir, f));
    const nStaff = src.score.keyboard ? 2 : 1;
    const allStaves = src.parts.reduce((s, p) => s + (p.staves || 1), 0);
    const firstStaff = src.parts.slice(0, src.partIndex).reduce((s, p) => s + (p.staves || 1), 0);
    const ours = MB.toBraille(src.score, { width }).brf;
    fs.writeFileSync(path.join(dir, base + '.ours.brf'), ours.split('\n').join('\r\n') + '\r\n');
    const tools = [{ name: '本工具', text: ours, staves: nStaff, first: 0 }];
    const ms = museScoreBrf(path.join(dir, f), src.xmlForMuseScore, path.join(dir, base + '.musescore.brf'));
    if (ms) tools.push({ name: 'MuseScore', text: ms, staves: allStaves, first: firstStaff });
    const bmeFile = path.join(dir, base + '.bme.brf');
    if (fs.existsSync(bmeFile)) tools.push({ name: 'BME', text: fs.readFileSync(bmeFile, 'latin1'), staves: allStaves, first: firstStaff });
    for (const t of tools) t.measures = extractMeasures(t.text, t.staves, t.first, nStaff);

    const rows = [];
    const counts = { same: 0, notes: 0, octave: 0, minor: 0, layout: 0 };
    const numbers = MB.model.measureNumbers(src.score);
    for (let s = 0; s < nStaff; s++) {
      const n = Math.max(...tools.map((t) => t.measures[s].length));
      for (let i = 0; i < n; i++) {
        const cells = tools.map((t) => t.measures[s][i] || '');
        let worst = null;
        const labels = [];
        for (let k = 1; k < cells.length; k++) {
          const c = classify(cells[0], cells[k]);
          if (c) {
            labels.push(tools[k].name + '：' + c.label);
            if (!worst || RANK[c.level] > RANK[worst.level]) worst = c;
          }
        }
        if (!worst) counts.same++;
        else {
          counts[worst.level]++;
          rows.push({ staff: s, idx: i, number: numbers[i] != null ? numbers[i] : i + 1, cells, labels, level: worst.level });
        }
      }
    }
    pieces.push({ name: base, title: src.score.title, part: src.parts[src.partIndex] && src.parts[src.partIndex].name, tools: tools.map((t) => ({ name: t.name, count: t.measures.map((m) => m.length) })), rows, counts, nStaff });
    if (args.includes('--show'))
      for (const r of rows) console.log('  ' + r.number + (nStaff === 2 ? (r.staff ? 'L' : 'R') : '') + '  ' + r.cells.map((c) => c || '-').join('  |  ') + '  ' + r.labels.join('；'));
    console.log(base + '：' + tools.map((t) => t.name).join('、') + '｜相同 ' + counts.same + '，音高或時值不同 ' + counts.notes + '，只差音層記號 ' + counts.octave + '，其他寫法 ' + counts.minor + '，換行造成的音層記號 ' + counts.layout);
  }

  // ---------------------------------------------------------------- HTML 報告
  const staffName = (p, s) => (p.nStaff === 2 ? (s === 0 ? '右手' : '左手') : '');
  const html = `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>點字樂譜三方比對報告</title>
<style>
:root{--bg:#fafaf7;--ink:#1d1d1b;--muted:#62625d;--line:#d9d7cf;--notes:#fde2e1;--octave:#fff4d6;--minor:#eef2f7}
@media (prefers-color-scheme: dark){:root{--bg:#1b1c1e;--ink:#ecebe6;--muted:#a7a69f;--line:#3a3b3f;--notes:#5a2a28;--octave:#4a3f1c;--minor:#2a3240}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font-family:system-ui,"Microsoft JhengHei",sans-serif;line-height:1.5}
h1{font-size:1.5rem}h2{font-size:1.2rem;margin-top:2rem}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
td.brl{font-family:"Segoe UI Symbol","DejaVu Sans",sans-serif;font-size:22px;white-space:nowrap}
tr.notes{background:var(--notes)}tr.octave{background:var(--octave)}tr.minor{background:var(--minor)}
.muted{color:var(--muted)}.wrap{overflow-x:auto}
</style></head><body>
<h1>點字樂譜三方比對報告</h1>
<p class="muted">比對本工具與其他軟體的點字輸出。已去除排版差異（標頭、小節號、手號或譜號、換行位置），逐小節比較音樂內容。
<br>紅色：音高或時值不同（請優先檢查）；黃色：只差音層記號；藍色：指法、表情、踏板或其他寫法不同；無底色：只因換行位置不同而多（少）一個音層記號，屬正常。</p>
<table><thead><tr><th>曲子</th><th>比對對象</th><th>相同</th><th>音高或時值不同</th><th>只差音層記號</th><th>其他寫法</th><th>換行造成的音層記號</th></tr></thead><tbody>
${pieces.map((p) => `<tr><td><a href="#${esc(p.name)}">${esc(p.title || p.name)}</a>${p.part ? '<br><span class="muted">' + esc(p.part) + '</span>' : ''}</td><td>${p.tools.map((t) => esc(t.name)).join('、')}</td><td>${p.counts.same}</td><td>${p.counts.notes}</td><td>${p.counts.octave}</td><td>${p.counts.minor}</td><td>${p.counts.layout}</td></tr>`).join('')}
</tbody></table>
${pieces
  .map(
    (p) => `<h2 id="${esc(p.name)}">${esc(p.title || p.name)}</h2>
<p class="muted">各工具讀到的小節數：${p.tools.map((t) => esc(t.name) + ' ' + t.count.join(' / ')).join('；')}</p>
${p.rows.length ? `<div class="wrap"><table><thead><tr><th>小節</th>${p.tools.map((t) => '<th>' + esc(t.name) + '</th>').join('')}<th>差異</th></tr></thead><tbody>
${p.rows.map((r) => `<tr class="${r.level}"><td>${r.number} ${staffName(p, r.staff)}</td>${r.cells.map((c) => `<td class="brl" title="${esc(c)}">${uni(c) || '<span class="muted">（無）</span>'}</td>`).join('')}<td>${r.labels.map(esc).join('<br>')}</td></tr>`).join('\n')}
</tbody></table></div>` : '<p>所有小節都相同。</p>'}`
  )
  .join('\n')}
</body></html>`;
  fs.writeFileSync(path.join(dir, '比對報告.html'), html);
  console.log('報告：' + path.join(dir, '比對報告.html'));
})();
