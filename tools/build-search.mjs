#!/usr/bin/env node
// 站內搜尋的索引：vi-tools 的工具（首頁卡片、說明頁段落）＋筆記本（class.kh.edu.tw/19061）的文章
//
//   node tools/build-search.mjs                 只重建索引（筆記本用 data/notes.json 現有的）
//   node tools/build-search.mjs --crawl         先抓筆記本：讀全部列表頁，新的或更新時間變了的文章才抓
//   node tools/build-search.mjs --crawl --limit 30   試作：只抓列表最前面的 30 篇
//   node tools/build-search.mjs --crawl --recheck    每篇文章都重看一次（改了抓法之後用）；內嵌頁面抓過的沿用
//
// 筆記本是教育局的平台，不能跨網站讀，所以先抓好存在 data/notes.json；抓的時候每篇間隔 0.8 秒
// 輸出 search-index.json：{ built, tools: [...], notes: [...] }（search.html 讀這個檔）
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTES_FILE = join(ROOT, 'data', 'notes.json');
const OUT = join(ROOT, 'search-index.json');
const SITE = 'https://class.kh.edu.tw';
const BOARD = 19061, LIST = 11;
const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? +args[args.indexOf('--limit') + 1] : Infinity;
const RECHECK = args.includes('--recheck');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', middot: '·', ndash: '–', mdash: '—', rarr: '→', larr: '←', times: '×', divide: '÷' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
// HTML → 純文字：區塊標籤換行，其他標籤拿掉
const toText = html => decode(html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr|table|pre|blockquote)>/gi, '\n')
  .replace(/<li[^>]*>/gi, '\n・')
  .replace(/<td[^>]*>/gi, ' ')
  .replace(/<[^>]+>/g, ''))
  .replace(/[ \t\u00a0\u3000]+/g, ' ')
  .replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();

let lastFetch = 0, lastType = '';
async function get(url) {
  const wait = lastFetch + 800 - Date.now(); if (wait > 0) await sleep(wait);
  for (let k = 0; ; k++) {
    lastFetch = Date.now();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'vi-tools-search-indexer (+https://hurthuang.github.io/vi-tools/)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      lastType = r.headers.get('content-type') || '';
      return await r.text();
    } catch (e) {
      if (k >= 2) throw new Error(`${url}：${e.message}`);
      await sleep(3000 * (k + 1));
    }
  }
}

// ── 文章裡內嵌的頁面（iframe）：抓得到的文字也放進索引 ───────────────
//   YouTube → 影片標題；Google 簡報 → 各頁標題（內文多半是圖，抓不到）；Google 試算表、文件 → 表格、內文；
//   其他網頁（neocities 等）→ 內文；vi-tools 本身不抓（工具另外有）
const SLIDES_UI = new Set(['Google 簡報', '前往簡報主畫面', '簡報主畫面', '未命名簡報', '極簡白', '簡單淺色', '簡單深色']);
async function embedOf(src) {
  src = decode(src).replace(/^\/\//, 'https://');
  try {
    const u = new URL(src);
    if (/(^|\.)hurthuang\.github\.io$/.test(u.hostname) && u.pathname.startsWith('/vi-tools')) return null;
    if (/youtube\.com$|youtu\.be$/.test(u.hostname)) {
      // embed/ID；也有人貼成 embed/youtu.be/ID
      const id = (u.pathname.match(/\/embed\/(?:youtu\.be\/)?([\w-]{11})(?:$|[/?])/) || [])[1] || u.searchParams.get('v');
      if (!id) return null;
      const j = JSON.parse(await get(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`));
      return { k: '影片', u: `https://www.youtube.com/watch?v=${id}`, t: j.title, x: '' };
    }
    if (u.hostname === 'docs.google.com' && u.pathname.includes('/presentation/')) {
      const html = await get(src.replace(/\/(pubembed|embed)(\?.*)?$/, '/pub'));
      const strs = [...html.matchAll(/"((?:[^"\\]|\\.){2,400})"/g)]
        .map(m => { try { return JSON.parse('"' + m[1] + '"'); } catch { return ''; } })
        .filter(t => /[一-鿿]/.test(t) && !/[{}<>=;]/.test(t) && !SLIDES_UI.has(t));
      const title = decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/ - Google 簡報$/, '');
      return { k: '簡報', u: src, t: title, x: [...new Set(strs)].filter(t => t !== title).join('\n') };
    }
    // PDF：先只記檔名（內文要另外解析）
    if (/\.pdf$/i.test(decodeURIComponent(u.pathname))) return { k: 'PDF', u: src, t: decodeURIComponent(u.pathname.split('/').pop()), x: '' };
    // Google 試算表：網頁版的表格是程式載入的，改抓 CSV（第一個工作表）
    if (u.hostname === 'docs.google.com' && u.pathname.includes('/spreadsheets/')) {
      const gid = u.searchParams.get('gid');   // 只公開單一工作表的，要帶 gid
      const csv = await get(src.replace(/\/pubhtml(\?.*)?$/, '/pub?' + (gid ? `gid=${gid}&single=true&` : '') + 'output=csv'));
      const title = decode((await get(src).catch(() => '')).match(/<title>([^<]*)<\/title>/)?.[1] || '').replace(/ - Google (雲端硬碟|試算表)$/, '').trim();
      return { k: '試算表', u: src, t: title, x: csv.replace(/,+/g, ' ').replace(/"/g, '').slice(0, 30000) };
    }
    const html = await get(src);
    if (!/html|text\/plain/i.test(lastType)) return { k: '檔案', u: src, t: decodeURIComponent(u.pathname.split('/').pop()), x: '' };
    const title = decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/ - Google (試算表|文件)$/, '').trim();
    const k = u.hostname === 'docs.google.com' ? '文件' : '網頁';
    const body = html.slice(Math.max(0, html.search(/<body[\s>]/i)));
    return { k, u: src, t: title, x: toText(body).slice(0, 30000) };
  } catch (e) {
    console.warn(`\n  內嵌頁面抓不到：${src}（${e.message}）`);
    if (/HTTP 4\d\d|Invalid URL/.test(e.message)) return null;   // 影片刪了、不公開、網址錯：不用再試
    return { k: '失敗', u: src, t: '', x: '' };   // 連線問題：記下來，下次抓筆記本時重試
  }
}

// ── 筆記本 ─────────────────────────────────────────────
async function crawlNotes() {
  const old = existsSync(NOTES_FILE) ? JSON.parse(readFileSync(NOTES_FILE, 'utf8')) : { notes: [] };
  const byId = new Map(old.notes.map(n => [n.id, n]));
  // 抓過的內嵌頁面（依 iframe 的 src）：重抓文章時沿用，不再抓一次；抓失敗的不算
  //   （早期抓的沒有 s，用 u 對；YouTube 的 u 換成了觀看網址，對不到就重抓）
  const embedCache = new Map(old.notes.flatMap(n => (n.e || []).filter(e => e.k !== '失敗').map(e => [e.s || e.u, e])));

  // 分類：選單上的各個分類頁列出它的文章
  const home = await get(`${SITE}/${BOARD}/bulletin/msg_list/${LIST}`);
  const cats = [...home.matchAll(new RegExp(`<a href="${SITE}/${BOARD}/page/view/(\\d+)">([^<]+)</a>`, 'g'))].map(m => ({ page: m[1], name: decode(m[2]).trim() }));
  const catOf = new Map();
  for (const c of cats) {
    const html = await get(`${SITE}/${BOARD}/page/view/${c.page}`);
    for (const m of html.matchAll(/msg_view\/(\d+)"/g)) {
      const l = catOf.get(+m[1]) || []; if (!l.includes(c.name)) l.push(c.name); catOf.set(+m[1], l);
    }
  }
  console.log(`分類 ${cats.length} 個：${cats.map(c => c.name).join('、')}`);

  // 列表：每一列有更新時間、標題；置頂的排在最前面
  const listed = [];
  const last = +(home.match(new RegExp(`msg_list/${BOARD}/${LIST}/(\\d+)">最後頁`)) || [...home.matchAll(new RegExp(`msg_list/${BOARD}/${LIST}/(\\d+)"`, 'g'))].map(m => +m[1]).sort((a, b) => b - a))[1] ?? 1;
  for (let p = 1; p <= last && listed.length < LIMIT; p++) {
    const html = p === 1 ? home : await get(`${SITE}/bulletin/msg_list/${BOARD}/${LIST}/${p}`);
    for (const m of html.matchAll(/<td>(\d{4}-\d\d-\d\d)\s+(\d\d:\d\d)<\/td><td class="bulletin_title">[\s\S]*?msg_view\/(\d+)">([\s\S]*?)<\/a>/g))
      if (!listed.some(l => l.id === +m[3])) listed.push({ id: +m[3], u: `${m[1]} ${m[2]}`, t: decode(m[4]).trim() });
  }
  console.log(`列表 ${last} 頁，${listed.length} 篇${LIMIT < Infinity ? `（試作只取 ${LIMIT} 篇）` : ''}`);

  const notes = [];
  let fetched = 0, savedAt = 0;
  // 每抓 50 篇存一次（還沒輪到的沿用舊資料），中途斷掉下次不用從頭抓
  //   內容沒變就不寫（不然每週都多一個只改了時間的 commit）
  const save = () => {
    const done = new Set(notes.map(n => n.id));
    const rest = old.notes.filter(n => !done.has(n.id) && listed.some(l => l.id === n.id));
    const all = [...notes, ...rest];
    if (JSON.stringify(all) === JSON.stringify(old.notes)) return;
    mkdirSync(dirname(NOTES_FILE), { recursive: true });
    writeFileSync(NOTES_FILE, JSON.stringify({ crawled: new Date().toISOString(), source: `${SITE}/${BOARD}`, notes: all }, null, 0));
  };
  for (const l of listed.slice(0, LIMIT)) {
    let n = byId.get(l.id);
    // 新文章、更新時間變了、有內嵌頁面上次抓失敗、或 --recheck（全部重看一次，內嵌沿用）才抓
    if (!n || n.u !== l.u || RECHECK || (n.e || []).some(e => e.k === '失敗')) {
      const html = await get(`${SITE}/${BOARD}/bulletin/msg_view/${l.id}`);
      const title = html.match(/<b>標題<\/b>：([\s\S]*?)(?:<!--|<\/td>)/);
      const pub = html.match(/發佈時間：<\/b>\s*(\d{4}-\d\d-\d\d)/);
      // 內文到 </div></td></tr></table>；有附件的文章，內文後面先接「附檔：」和附件連結
      const body = html.match(/<div id="bulletin_content">([\s\S]*?)<\/div>(?:<\/td><\/tr><\/table>|附檔：([\s\S]*?)<\/td><\/tr><\/table>)/);
      if (!body && html.includes('本文章需要密碼')) { notes.push({ id: l.id, u: l.u, locked: true }); continue; }   // 設了密碼：記下來不再抓，也不放進索引
      if (!body) { console.warn(`  第 ${l.id} 篇找不到內文，略過`); continue; }
      n = { id: l.id, t: title ? decode(title[1]).trim() : l.t, d: pub ? pub[1] : l.u.slice(0, 10), u: l.u,
            h: [...body[1].matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m => toText(m[1])).filter(Boolean),
            x: toText(body[1]) };
      const files = body[2] ? [...body[2].matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map(m => decode(m[1]).trim()) : [];
      if (files.length) n.f = files;   // 附件檔名也搜得到
      const embeds = [];
      for (const m of body[1].matchAll(/<iframe[^>]*\ssrc="([^"]+)"/gi)) {
        const s = decode(m[1]);
        const e = embedCache.get(s) || await embedOf(m[1]);
        if (e) embeds.push({ ...e, s });
      }
      if (embeds.length) n.e = embeds;
      fetched++;
      if (process.stdout.isTTY) process.stdout.write(`\r  抓了 ${fetched} 篇：${n.t.slice(0, 30).padEnd(30)}`);
      else if (fetched % 50 === 0) console.log(`  抓了 ${fetched} 篇`);
    }
    notes.push({ ...n, c: catOf.get(l.id) || [] });
    if (fetched - savedAt >= 50) { save(); savedAt = fetched; }
  }
  if (fetched && process.stdout.isTTY) process.stdout.write('\n');
  save();
  console.log(`筆記本：${notes.length} 篇（新抓或更新 ${fetched} 篇）→ data/notes.json`);
}

// ── vi-tools：首頁的工具卡片、說明頁的段落 ─────────────────────
function toolEntries() {
  const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const hashMap = Object.fromEntries([...index.match(/const HASH_MAP = \{([\s\S]*?)\};/)[1].matchAll(/'([\w-]+)':\s*'([\w-]*)'/g)].map(m => [m[1], m[2]]));
  // 分頁的網頁檔：在首頁的框架裡點這個檔名的連結會切到那個分頁；單獨開搜尋頁時用 index.html#hash
  const pageOf = Object.fromEntries([...index.matchAll(/<iframe id="([\w-]+)" class="panel" (?:data-)?src="([^"]+)"/g)].map(m => [m[1], m[2]]));
  const out = [];
  // 卡片：<div class="tool-card" ... onclick="switchTo('frame-bt')"> … tool-name … tool-desc
  for (const m of index.matchAll(/<div class="tool-card"[^>]*switchTo\('([\w-]+)'\)[\s\S]*?<div class="tool-name">([\s\S]*?)<\/div>[\s\S]*?<div class="tool-desc"[^>]*>([\s\S]*?)<\/div>/g)) {
    const name = toText(m[2].replace(/<span class="tool-badge"[\s\S]*?<\/span>/g, '')), badge = (m[2].match(/<span class="tool-badge"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
    const group = toText((index.slice(0, m.index).match(/<h2 class="group-title"[^>]*>([^<]*)<\/h2>/g) || []).pop()?.replace(/<[^>]+>/g, '') || '');
    if (out.some(o => o.t === name)) continue;
    out.push({ k: 'tool', t: name, c: [group, badge && toText(badge)].filter(Boolean), p: pageOf[m[1]] || '', url: '#' + (hashMap[m[1]] ?? ''), x: toText(m[3]) });
  }
  // 說明頁：每個 h2（工具）底下的 h3 段落各一筆
  const guide = readFileSync(join(ROOT, 'guide.html'), 'utf8');
  const body = guide.slice(guide.indexOf('<body'));
  // 錨點：h2 用所在 <section id>，h3 用自己的 id；點了直接跳到那一段
  const parts = body.split(/(?=<h[23][\s>])/);
  let h2 = '', sec = '';
  for (const p of parts) {
    const hm = p.match(/^<h([23])([^>]*)>([\s\S]*?)<\/h\1>/);
    const id = hm && (hm[1] === '3' ? (hm[2].match(/\sid="([^"]+)"/) || [])[1] : sec);
    const secs = [...p.matchAll(/<section id="([^"]+)"/g)]; if (secs.length) sec = secs.pop()[1];   // 下一個 section 的開頭在這段的尾巴
    if (!hm) continue;
    const head = toText(hm[3]);
    if (hm[1] === '2') h2 = head;
    const x = toText(p.slice(hm[0].length).replace(/<\/?section[^>]*>/g, ''));
    if (x.length < 10) continue;
    out.push({ k: 'guide', t: hm[1] === '2' ? `說明：${h2}` : `說明：${h2} › ${head}`, c: [], p: 'guide.html' + (id ? '#' + id : ''), url: '#guide', x });
  }
  return out;
}

if (args.includes('--crawl')) await crawlNotes();
// 索引不需要的：設了密碼的文章、抓失敗的內嵌、內嵌的原始 src
const notes = (existsSync(NOTES_FILE) ? JSON.parse(readFileSync(NOTES_FILE, 'utf8')).notes : []).filter(n => !n.locked).map(n => {
  const { e, ...rest } = n, ok = (e || []).filter(x => x.k !== '失敗').map(({ s, ...x }) => x);
  return ok.length ? { ...rest, e: ok } : rest;
});
const tools = toolEntries();
// 內容沒變就不改檔（built 是內容最後變動的時間）
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const same = prev && JSON.stringify([prev.tools, prev.notes]) === JSON.stringify([tools, notes]);
const index = { built: same ? prev.built : new Date().toISOString(), source: `${SITE}/${BOARD}`, tools, notes };
if (!same) writeFileSync(OUT, JSON.stringify(index));
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(`search-index.json：工具與說明 ${tools.length} 筆、筆記 ${notes.length} 篇，${kb(Buffer.byteLength(JSON.stringify(index)))}`);
