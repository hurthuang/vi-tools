# 教材網頁版（nemeth-book.html、zhuyin-braille-rules.html）

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

## 待決定

- UEB 學習手冊（網站 msg_view/1039，原稿在雲端硬碟「視覺障礙輔助科技筆記本/UEB/UEB 教學/UEB 學習手冊_1150809.docx」）：作者黃偉豪、陳英廷，有 ISBN，版權頁寫「版權所有」。放進公開 repo 前要共同作者同意（2026-10-24 待使用者確認）。
- 首頁入口：等主頁分組（「學習與查詢」）時再加。
