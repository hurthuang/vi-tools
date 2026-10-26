# 首頁分組（index.html）

2026-10-25 使用者：工具越來越多，卡片太多，改成分組。比較過下拉式選單，使用者決定維持兩排頁籤。

- 兩排頁籤，包在 `<nav aria-label="工具導覽">` 地標裡；工具內容在 `<main id="panels">`。NVDA 按 D 在兩者之間跳。
  - 第一排 `#tabbar`（`aria-label="分組"`）：主頁、點字轉換、教材製作、學習與查詢、附加元件、說明、搜尋（2026-10 加，見 site-search.md）。深色／淺色按鈕在頁籤列外面（`.toprow` 裡），頁籤列裡只放頁籤。
  - 第二排每組一個 `.subbar`（`role="tablist"`，`data-group="group-xxx"`），只顯示目前那一組；主頁、附加元件、說明沒有第二排。
- 分組：
  - 點字轉換：文字轉點字、點字轉文字、數學點字、音樂點字（music/index.html，原名點字樂譜）
  - 教材製作：文件整理、觸摸圖
  - 學習與查詢：點字教材（第一項）、珠算練習、點字樂譜練習（music/student.html）、UEB 查詢（使用者：珠算和 UEB 查詢對調）、縮點對照（zh-tw-short.html，`#zh-tw-short`，放在 UEB 查詢後面）。
  - 附加元件：`#addons-panel`（不是 iframe），NVDA 附加元件的卡片連到 GitHub。首頁只放一張卡片打開這一頁。
- 點字樂譜規則（music/rules.html）在點字教材列表裡，叫「音樂點字」（`tools/build-books.mjs` 的 `LINKS`）；`#music-rules` 在點字教材框架裡開它。rules.html 頁首加「所有教材」連回列表。
- 分組頁籤的 `data-target` 是 `group-xxx`，`resolve()` 換成那組上次用的工具（`localStorage` `vitools-group-last`，下次開網頁也記得），沒用過就是第一項。網址還是一個工具一個（`#math`、`#abacus`、`#music-student`、`#addons`…），分組本身沒有網址；舊連結都照常。
- 方向鍵只在同一排移動（自動切換）；Tab 從第一排到第二排。手機寬度兩排都可以左右捲，切換時目前的頁籤會捲進畫面。
- 首頁：h1 標題，每組一個 `<section aria-labelledby>`（區域地標）加 h2、一行說明，底下是該組的卡片（卡片拿掉功能標籤，短一點）。
- 新的框架（點字樂譜練習、點字教材）用 `data-src`，第一次打開才載入。
- guide.html：側欄、工具總覽表格、各節順序都照分組；README 工具一節開頭說明分組。
- 縮點對照（zh-tw-short 分支，2026-10-25）：放進「學習與查詢」第二排（UEB 查詢後面），首頁卡片在學習與查詢那一組；原本放在附加元件區的「實驗功能」卡片已拿掉。框架用 `data-src`；頁面在框架裡會隱藏「回首頁」連結、接收 `setTheme`，外部連結開新分頁。
- 框架裡的連結指到別的工具頁（`iframe.panel` 的 src）或教材頁（`BOOK_PAGES`、books.html）時，攔下來改成 `switchTo()`，兩排頁籤跟著切；教材頁在點字教材框架裡開，網址換成那本的 hash。同一頁的錨點、開新視窗、按 Ctrl/Shift 的點擊照常。例：音樂點字頁首「回到點字樂譜轉換器」→ 點字轉換／音樂點字；轉換器的「規則對照」→ 學習與查詢／點字教材裡的音樂點字。
