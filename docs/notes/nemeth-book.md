# 數理點字教材網頁版（nemeth-book.html）

- 內容來源只有一份：`document/教材/Nemeth-數學點字教材-CH1-9.md`（CH1～CH11、兩個附錄、參考資料；檔名沿用舊名）。
  - 網頁：`node tools/build-nemeth-book.mjs` 產生 `nemeth-book.html`（要有 pandoc）。`--check` 只檢查網頁是不是最新的。
  - Word：`document/教材/.build/rebuild.js` 產生點字版、ASCII+SimBraille 版 docx。
  - 規則依據寫在 `document/教材/Nemeth-轉寫依據紀錄.md`（給維護者，不放進網頁）。
- 網頁做法：
  - pandoc 轉 HTML（`markdown+east_asian_line_breaks`，中文換行不會多出空格；`--mathjax`），標題往下一層（md 的 `#` 章 → h2）。
  - 算式用 MathJax 顯示，設定跟數學點字工具一樣（`\ratio`、`\proportion`）；MathJax 會附隱藏的 MathML 給報讀軟體。
  - Unicode 點字包成 `<span class="brl">`，頁首可切換成 SimBraille 字型的 ASCII 點字（跟 Word 的 ASCII+SimBraille 版一樣），記在 localStorage `nemeth-book-simbrl`。
  - 目錄：每章一項，章底下列節。
- 首頁入口：等主頁分組（「學習與查詢」）時再加。
- 使用者 2026-10-24：網站（class.kh.edu.tw/19061）上的注音點字規則（msg_view/75 聲韻調、77 標點符號）和 UEB 學習手冊（msg_view/1039）之後也可能照這個方式放進來。
