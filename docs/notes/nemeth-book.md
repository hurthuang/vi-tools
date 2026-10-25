# 教材網頁版（nemeth-book.html、zhuyin-braille-rules.html、ueb-book.html）

- 產生方式：`node tools/build-books.mjs`（要有 pandoc）；教材清單在腳本開頭的 `BOOKS`。`--check` 只檢查網頁是不是最新的。內容只改 `document/教材/` 底下的 md。
- 共同做法：
  - pandoc 轉 HTML（`markdown+east_asian_line_breaks`，中文換行不會多出空格），標題往下一層（md 的 `#` → h2），頁首有目錄（h2 一項，底下列 h3）。
  - Unicode 點字包成 `<span class="brl">`，頁首可切換成 SimBraille 字型的 ASCII 點字，各教材共用設定（localStorage `vitools-book-simbrl`）。
  - 表格外包 `.scroll`，手機寬度不會整頁左右捲動。

## 數理點字教材（nemeth-book.html）

- 來源：`document/教材/Nemeth-數學點字教材-CH1-9.md`（CH1～CH11、兩個附錄、參考資料；檔名沿用舊名）。Word 版由 `document/教材/.build/rebuild.js` 產生。規則依據寫在 `document/教材/Nemeth-轉寫依據紀錄.md`（給維護者，不放進網頁）。
- 算式用 MathJax（`--mathjax`），設定跟數學點字工具一樣（`\ratio`、`\proportion`）；MathJax 附隱藏的 MathML 給報讀軟體。

## 注音點字規則整理（zhuyin-braille-rules.html）

- 來源：`document/教材/注音點字規則整理.md`。2026-10-24 從網站 msg_view/75（聲韻調、拼法）、77（標點符號）轉成 md，之後以 md 為原稿（使用者同意網頁原稿可調整）。
- 調整：補上各節標題（點字的點位、聲母……），範例表加表頭；標點符號原本一個大表格（說明欄有多段），改成每個符號一個小標題，NVDA 可以用 4 鍵跳。
- 標點符號的名稱、說明引用教育部《重訂標點符號手冊》，開頭保留出處。

## UEB 學習手冊（ueb-book.html）

- 原稿是 Word：主編（使用者）在雲端硬碟「視覺障礙輔助科技筆記本/UEB/UEB 教學/UEB 學習手冊_日期.docx」改，改完複製到 `document/教材/UEB 學習手冊.docx` 再跑 build-books。
- 2026-10-24 使用者：共同作者陳英廷同意放上來；保留版權頁和 ISBN；只放封面圖（`ueb-book-cover.jpg`，從 Word 的封面縮成 1200 寬），其他圖不放；縮寫快速查詢表保留一張，不拆。
- `fixDocx()` 的整理：拿掉 Word 的目錄、標題裡的粗體、空標題、只剩圖說（設定畫面、顯示狀況）的段落；Word 預設把表格第一列當表頭，第一列不是粗體的改回一般列（練習單字表）。表格裡的點字不換行，表格太寬時在表格裡左右捲動。

## 整合進工具集（2026-10-25）

- 首頁一張「點字教材」卡片（使用者：卡片太多，2026-10-25），打開 `books.html` 教材列表（build-books 依 `BOOKS` 產生），再選一本；教材頁首有「所有教材」連回列表。`#books` 是列表；`#nemeth-book`、`#zhuyin-rules`、`#ueb-book` 直接在同一個框架開那一本（`BOOK_PAGES`、`fromHash()`），從卡片打開一律回到列表。iframe 用 `data-src`，第一次打開才載入，不拖慢首頁。
- 工具頁互連：數學點字 → 數理點字教材；文字轉點字 → 注音點字規則、UEB 學習手冊；UEB 查詢 → UEB 學習手冊。教材頁首連回工具。
- 教材裡的外部連結開新視窗（框架裡開不了學校網站）；文字裡沒做成超連結的網址（Word 常見）自動變連結。
- guide.html「點字教材」一節、README 工具表與授權（UEB 學習手冊版權所有，不適用 repo 其他檔案的授權）。
- 桌面版打包加 `*.jpg`（UEB 封面）。
- 首頁分組後（home-groups，2026-10-25），「點字教材」是「學習與查詢」的第一項，網址不變。列表順序照 `BOOKS`（使用者：注音點字放第一），後面接 `LINKS` 的現成網頁：音樂點字（music/rules.html，`#music-rules`）。
