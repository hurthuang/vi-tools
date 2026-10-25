// 教材網頁版：node tools/build-books.mjs（要有 pandoc）
// 內容只改 document/教材/ 底下的原稿（md；UEB 學習手冊是 Word），再跑這支產生網頁；加 --check 只檢查網頁是不是最新的（改了 md 忘了重跑會失敗）。
// 數理點字教材的 md 也由 document/教材/.build/rebuild.js 產生點字版、ASCII+SimBraille 版 docx。
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// 順序就是教材列表的順序（使用者：注音點字放第一）
const BOOKS = [
  {
    src: 'document/教材/注音點字規則整理.md', out: 'zhuyin-braille-rules.html', math: false,
    tool: ['braille-translate.htm', '文字轉點字'],
    lead: '國語點字的聲母、韻母、結合韻、聲調、拼法與換行，以及標點符號。標點符號的名稱、說明引用教育部《重訂標點符號手冊》，點字依教育部《點字符號彙編 國語點字》，彙編沒有定義的符號另外提出建議。原載視覺障礙輔助科技筆記本（<a href="https://class.kh.edu.tw/19061/bulletin/msg_view/75">聲韻調、拼法</a>、<a href="https://class.kh.edu.tw/19061/bulletin/msg_view/77">標點符號</a>）。',
  },
  {
    src: 'document/教材/Nemeth-數學點字教材-CH1-9.md', out: 'nemeth-book.html', math: true,
    tool: ['nemeth_converter.html', '數學點字工具'],
    lead: '依 108 課綱與 Nemeth 2022 規則編寫，國小到高中的數學，加上化學、物理公式。例子的點字都由數學點字工具產生，再跟規則書的範例核對。這份教材也分章發布在<a href="https://class.kh.edu.tw/19061/page/view/17#Nemeth">視覺障礙輔助科技筆記本</a>。',
  },
  {
    // 原稿是 Word（主編在雲端硬碟改，改完複製到 document/教材/UEB 學習手冊.docx 再跑）。只留封面圖，其他圖不放
    src: 'document/教材/UEB 學習手冊.docx', out: 'ueb-book.html', math: false, title: 'UEB 學習手冊',
    tool: ['UEB-g2-query.html', 'UEB 查詢'], cover: 'ueb-book-cover.jpg',
    lead: '給初學者的統一英文點字（UEB）手冊：第一部分是英文字母、數字、大寫、標點符號和簡寫字，第二部分是各類縮寫，最後是綜合練習、相關輔助科技和縮寫快速查詢表。作者黃偉豪、陳英廷，PDF 版見<a href="https://class.kh.edu.tw/19061/bulletin/msg_view/1039">視覺障礙輔助科技筆記本</a>。',
  },
];

// 教材列表接在 BOOKS 後面的現成網頁（不由這支產生）
const LINKS = [
  {
    href: 'music/rules.html', title: '音樂點字',
    lead: '點字樂譜規則對照，依 BANA《Music Braille Code, 2015》：音符與時值、音層記號、音程與和弦，到歌曲（歌詞）、多聲部分譜、合奏總譜、人聲伴奏與合唱總譜。每條規則附可以修改的 ABC 例子，點字和五線譜跟著變。',
  },
];

// Word 轉出來的 HTML 整理：拿掉 Word 的目錄（頁首另外產生）、標題裡的粗體、空標題；
// 圖只留第一張（封面），換成縮小的 jpg；表格第一列不是粗體的，是 Word 預設把第一列當表頭，改回一般列
function fixDocx(body, book) {
  body = body.replace(/<h2 class="TOC-Heading"[\s\S]*?(?=<h2 )/, '');
  body = body.replace(/<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/g, (m, h, attr, t) => `<${h}${attr}>${t.replace(/<\/?strong>/g, '').trim()}</${h}>`);
  body = body.replace(/<(h[1-6])[^>]*>(?:\s|<br \/>)*<\/\1>\n?/g, '');
  let first = true;
  body = body.replace(/<img [^>]*\/>/g, m => {
    if (!first || !book.cover) return '';
    first = false;
    const alt = (m.match(/alt="([^"]*)"/) || [, ''])[1];
    return `<img class="cover" src="${book.cover}" alt="${alt.replace(/\s+/g, ' ').trim()}">`;
  });
  // 圖拿掉後，只剩圖說（設定畫面、顯示狀況）的段落也拿掉
  body = body.replace(/<p>(?:設定畫面|顯示狀況)(?:<br \/>|\s)*<\/p>\n?/g, '');
  body = body.replace(/<p>(?:\s|<br \/>)*<\/p>\n?/g, '');
  body = body.replace(/<thead>\s*(<tr[^>]*>[\s\S]*?<\/tr>)\s*<\/thead>\s*<tbody>/g, (m, tr) =>
    /<th[^>]*>(?!\s*<strong>)/.test(tr) ? `<tbody>\n${tr.replace(/<(\/?)th\b/g, '<$1td')}` : m);
  return body;
}

const root = new URL('../', import.meta.url);
const path = u => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const MATHJAX = `<script>
// 跟數學點字工具一樣的 MathJax 設定（\\ratio、\\proportion 是比例的 ∶、∷）
window.MathJax = {
  tex: { inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']],
    macros: { ratio: ['\\\\mathrel{\\\\unicode{x2236}}', 0], proportion: ['\\\\mathrel{\\\\unicode{x2237}}', 0] } },
  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" id="MathJax-script" async></script>
`;

function build(book) {
  const src = new URL(book.src, root), docx = book.src.endsWith('.docx');
  const md = docx ? '' : readFileSync(src, 'utf8');
  const title = book.title || (md.match(/^title:\s*(.+)$/m) || [, book.out])[1].trim();
  let body = execFileSync('pandoc', [path(src), '-f', docx ? 'docx' : 'markdown+east_asian_line_breaks', '-t', 'html', ...(book.math ? ['--mathjax'] : []), '--shift-heading-level-by=1'],
    { encoding: 'utf8', maxBuffer: 64 << 20 }).replace(/\r\n/g, '\n');
  if (docx) body = fixDocx(body, book);
  // 表格外面包一層可以左右捲動（手機窄螢幕）
  body = body.replace(/<table[^>]*>/g, '<div class="scroll"><table>').replace(/<colgroup>[\s\S]*?<\/colgroup>\n?/g, '')
    .replace(/<\/table>/g, '</table></div>');
  // 文字裡的網址（Word 裡沒做成超連結的）改成連結；已經是連結的、標籤裡的不動
  body = body.split(/(<a\b[\s\S]*?<\/a>|<[^>]+>)/).map((p, i) => i % 2 ? p
    : p.replace(/https?:\/\/[^\s<>()（）、，。]+/g, u => `<a href="${u}">${u}</a>`)).join('');
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
<!-- 這個檔案由 tools/build-books.mjs 從 ${book.src} 產生，不要直接改 -->
<title>${title}</title>
<script src="music/js/theme.js"></script>
${book.math ? MATHJAX : ''}<style>
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
td .brl,th .brl{white-space:nowrap;word-break:normal}
html.simbrl .brl{font-family:'SimBraille';font-size:1.4em;letter-spacing:0}
nav.toc{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 16px;margin:12px 0}
nav.toc>ul{margin:0;padding-left:1.2em}
nav.toc ul ul{font-size:.92rem;columns:2 14em;margin:2px 0 8px}
hr{display:none}
img.cover{display:block;max-width:100%;height:auto;margin:8px 0;border-radius:6px}
code{font-family:Consolas,monospace}
</style>
</head>
<body>
<main>
<div class="bar">
  <a href="books.html">📚 所有教材</a>
  <a href="${book.tool[0]}">${book.tool[1]}</a>
  <label><input type="checkbox" id="simbrl"> 點字用 SimBraille 字型顯示（ASCII 點字）</label>
</div>
<h1>${title}</h1>
<p class="lead">${book.lead}</p>
<nav class="toc" aria-label="目錄">
<ul>
${tocHtml}
</ul>
</nav>
${body}
</main>
<script>
// SimBraille：把 Unicode 點字換成北美 ASCII 點字，用 SimBraille 字型顯示（跟 Word 的 ASCII+SimBraille 版一樣）；各教材共用，記在這台電腦
(function () {
  const ASC = ' A1B\\'K2L@CIF/MSP"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\\\0Z7(_?W]#Y)=';
  const box = document.getElementById('simbrl'), spans = document.querySelectorAll('.brl');
  spans.forEach(s => { s.dataset.u = s.textContent; });
  function apply(on) {
    document.documentElement.classList.toggle('simbrl', on);
    spans.forEach(s => { s.textContent = on ? [...s.dataset.u].map(c => ASC[c.codePointAt(0) - 0x2800]).join('') : s.dataset.u; });
  }
  let on = false;
  try { on = localStorage.getItem('vitools-book-simbrl') === '1'; } catch (e) {}
  box.checked = on; if (on) apply(true);
  box.addEventListener('change', () => { apply(box.checked); try { localStorage.setItem('vitools-book-simbrl', box.checked ? '1' : '0'); } catch (e) {} });
})();
</script>
</body>
</html>
`;
  // 外部連結開新視窗（教材在工具集的框架裡，學校網站等不能在框架裡開）
  return { title, page: page.replace(/<a\s+href="(https?:[^"]*)"/g, '<a href="$1" target="_blank" rel="noopener"'), chapters: toc.length };
}

// 教材列表 books.html（首頁「點字教材」卡片打開的頁面）：書名、說明照 BOOKS，樣式沿用教材頁
function listPage(pages) {
  const css = pages[0].page.match(/<style>([\s\S]*?)<\/style>/)[1];
  const items = [...BOOKS.map((b, i) => ({ href: b.out, title: pages[i].title, lead: b.lead })), ...LINKS]
    .map(b => `<h2><a href="${b.href}">${b.title}</a></h2>\n<p>${b.lead}</p>`).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- 這個檔案由 tools/build-books.mjs 產生，不要直接改 -->
<title>點字教材</title>
<script src="music/js/theme.js"></script>
<style>${css}</style>
</head>
<body>
<main>
<h1>點字教材</h1>
<p class="lead">每本教材的章、節都是標題，NVDA 可以用標題鍵跳讀；點字可以用點顯器摸讀，頁首也可以切換成 SimBraille 字型顯示。</p>
${items}
</main>
</body>
</html>
`.replace(/<a\s+href="(https?:[^"]*)"/g, '<a href="$1" target="_blank" rel="noopener"');
}

let bad = 0;
const built = BOOKS.map(b => ({ out: b.out, ...build(b) }));
built.push({ out: 'books.html', page: listPage(built), chapters: BOOKS.length + LINKS.length });
for (const { out: name, page, chapters } of built) {
  const book = { out: name }, out = new URL(name, root);
  if (process.argv.includes('--check')) {
    let old = '';
    try { old = readFileSync(out, 'utf8').replace(/\r\n/g, '\n'); } catch {}
    if (old !== page) { console.log(`✗ ${book.out} 不是最新的，跑 node tools/build-books.mjs`); bad++; }
    else console.log(`${book.out} 是最新的`);
  } else {
    writeFileSync(out, page);
    console.log(`已產生 ${book.out}（${chapters} 章）`);
  }
}
process.exit(bad ? 1 : 0);
