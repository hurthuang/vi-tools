// 數理點字教材網頁版：node tools/build-nemeth-book.mjs（要有 pandoc）
// 內容只改 document/教材/Nemeth-數學點字教材-CH1-9.md，再跑這支產生 nemeth-book.html；
// 加 --check 只檢查 nemeth-book.html 是不是最新的（改了 md 忘了重跑會失敗）。
// 同一份 md 也由 document/教材/.build/rebuild.js 產生點字版、ASCII+SimBraille 版 docx。
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const src = new URL('document/教材/Nemeth-數學點字教材-CH1-9.md', root);
const out = new URL('nemeth-book.html', root);
const path = u => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');

const md = readFileSync(src, 'utf8');
const title = (md.match(/^title:\s*(.+)$/m) || [, 'Nemeth 數理點字教材'])[1].trim();
let body = execFileSync('pandoc', [path(src), '-f', 'markdown+east_asian_line_breaks', '-t', 'html', '--mathjax', '--shift-heading-level-by=1'],
  { encoding: 'utf8', maxBuffer: 64 << 20 }).replace(/\r\n/g, '\n');

// 表格外面包一層可以左右捲動（手機窄螢幕）
body = body.replace(/<table>/g, '<div class="scroll"><table>').replace(/<\/table>/g, '</table></div>');
// 點字（Unicode U+2800～U+283F）包成 span，方便切換 SimBraille 顯示；只換標籤外面的文字
body = body.replace(/(<[^>]*>)|([⠀-⠿]+)/g, (m, tag, brl) => tag || `<span class="brl">${brl}</span>`);

// 目錄：每一章（h2）一項，章底下的節（h3）收在章裡
const toc = [];
for (const m of body.matchAll(/<h([23]) id="([^"]+)">(.*?)<\/h\1>/g)) {
  const [, lv, id, text] = m, item = { id, text: text.replace(/<[^>]+>/g, '') };
  if (lv === '2') toc.push({ ...item, sub: [] });
  else if (toc.length) toc[toc.length - 1].sub.push(item);
}
const tocHtml = toc.map(c => `<li><a href="#${c.id}">${c.text}</a>` +
  (c.sub.length ? `<ul>${c.sub.map(s => `<li><a href="#${s.id}">${s.text}</a></li>`).join('')}</ul>` : '') + '</li>').join('\n');

const page = `<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- 這個檔案由 tools/build-nemeth-book.mjs 從 document/教材/Nemeth-數學點字教材-CH1-9.md 產生，不要直接改 -->
<title>${title}</title>
<script src="music/js/theme.js"></script>
<script>
// 跟數學點字工具一樣的 MathJax 設定（\\ratio、\\proportion 是比例的 ∶、∷）
window.MathJax = {
  tex: { inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']],
    macros: { ratio: ['\\\\mathrel{\\\\unicode{x2236}}', 0], proportion: ['\\\\mathrel{\\\\unicode{x2237}}', 0] } },
  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" id="MathJax-script" async></script>
<style>
@font-face{font-family:'SimBraille';src:url('SIMBRL.TTF') format('truetype')}
:root{--bg:#fafaf7;--fg:#1d1d1b;--muted:#5d5d58;--line:#d6d4cc;--card:#fff;--accent:#1f5fa8;--brl:#7a3e00}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#161615;--fg:#ecebe6;--muted:#a8a69e;--line:#3b3a36;--card:#1f1f1d;--accent:#7fb0f0;--brl:#f0b070}}
:root[data-theme="dark"]{--bg:#161615;--fg:#ecebe6;--muted:#a8a69e;--line:#3b3a36;--card:#1f1f1d;--accent:#7fb0f0;--brl:#f0b070}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.7 system-ui,"Microsoft JhengHei","PingFang TC",sans-serif}
main{max-width:860px;margin:0 auto;padding:16px 16px 64px}
a{color:var(--accent)}
h1{font-size:1.6rem;margin:8px 0 4px}
h2{font-size:1.35rem;margin:40px 0 8px;padding-top:12px;border-top:2px solid var(--line)}
h3{font-size:1.15rem;margin:28px 0 6px}
h4{font-size:1rem;margin:20px 0 4px}
.lead{color:var(--muted);margin:0 0 12px}
.bar{display:flex;flex-wrap:wrap;gap:4px 16px;align-items:center;margin:0 0 8px;font-size:.95rem}
.bar label{display:inline-flex;gap:4px;align-items:center;cursor:pointer}
.scroll{overflow-x:auto;margin:8px 0}
table{border-collapse:collapse;background:var(--card)}
th,td{border:1px solid var(--line);padding:4px 10px;text-align:left;vertical-align:top}
.brl{color:var(--brl);font-size:1.15em;letter-spacing:.05em;word-break:break-all}
html.simbrl .brl{font-family:'SimBraille';font-size:1.4em;letter-spacing:0}
nav.toc{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 16px;margin:12px 0}
nav.toc>ul{margin:0;padding-left:1.2em}
nav.toc ul ul{font-size:.92rem;columns:2 14em;margin:2px 0 8px}
hr{display:none}
code{font-family:Consolas,monospace}
</style>
</head>
<body>
<main>
<div class="bar">
  <a href="nemeth_converter.html">數學點字工具</a>
  <label><input type="checkbox" id="simbrl"> 點字用 SimBraille 字型顯示（ASCII 點字）</label>
</div>
<h1>${title}</h1>
<p class="lead">依 108 課綱與 Nemeth 2022 規則編寫，國小到高中的數學，加上化學、物理公式。例子的點字都由數學點字工具產生，再跟規則書的範例核對。這份教材也分章發布在<a href="https://class.kh.edu.tw/19061/page/view/17#Nemeth">視覺障礙輔助科技筆記本</a>。</p>
<nav class="toc" aria-label="目錄">
<ul>
${tocHtml}
</ul>
</nav>
${body}
</main>
<script>
// SimBraille：把 Unicode 點字換成北美 ASCII 點字，用 SimBraille 字型顯示（跟 Word 的 ASCII+SimBraille 版一樣）；記在這台電腦
(function () {
  const ASC = ' A1B\\'K2L@CIF/MSP"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\\\0Z7(_?W]#Y)=';
  const box = document.getElementById('simbrl'), spans = document.querySelectorAll('.brl');
  spans.forEach(s => { s.dataset.u = s.textContent; });
  function apply(on) {
    document.documentElement.classList.toggle('simbrl', on);
    spans.forEach(s => { s.textContent = on ? [...s.dataset.u].map(c => ASC[c.codePointAt(0) - 0x2800]).join('') : s.dataset.u; });
  }
  let on = false;
  try { on = localStorage.getItem('nemeth-book-simbrl') === '1'; } catch (e) {}
  box.checked = on; if (on) apply(true);
  box.addEventListener('change', () => { apply(box.checked); try { localStorage.setItem('nemeth-book-simbrl', box.checked ? '1' : '0'); } catch (e) {} });
})();
</script>
</body>
</html>
`;

if (process.argv.includes('--check')) {
  let old = '';
  try { old = readFileSync(out, 'utf8').replace(/\r\n/g, '\n'); } catch {}
  if (old !== page) { console.log('✗ nemeth-book.html 不是最新的，跑 node tools/build-nemeth-book.mjs'); process.exit(1); }
  console.log('nemeth-book.html 是最新的');
} else {
  writeFileSync(out, page);
  console.log(`已產生 nemeth-book.html（${toc.length} 章）`);
}
