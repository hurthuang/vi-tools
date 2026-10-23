# 縮點對照頁（zh-tw-short.html）

從 CLAUDE.md 搬出來的功能說明（2026-10-23）。縮點規則本身在本機的 zh-tw-short repo（E:/Project/zh-tw-short/rules.md）；跨 repo 的相依關係見 E:\Project\CLAUDE.md。

## 第一版（2026-10-19）

- 獨立頁面，不在主導覽分頁；入口是首頁「實驗功能」。縮點＝注音點字的調號併入第 7、8 點，只適用八點點顯器。規則文件在另一個 repo zh-tw-short（rules.md），網頁放這裡共用核心
- `zh-tw-short.js`（`window.ZhTwShort`，node 用 `require(...)(PrnCore)`）：國字用 `prn-core.js` 的 `zhChar`，英數與其他符號照 zh-tw.ctb 依序 include 的字元定義、以第一次為準（同 liblouis；例：● 由 en-us-comp8 先定義成 16）；`shortBraille()` 是 NVDA-brailleTableSwitcher `tools/build_short_ctb.py` 的移植，改規則兩邊一起改
- `prn-core.js` 為此加了：`loadZh(..., { nvda: true })`（不套 PDF 規範覆蓋、保留標點後的空方，和 NVDA 一樣）、`word`／`begword` 規則（子曰的子念 ㄗˇ，觸摸圖也受益）、匯出 `zhChar`／`zhData`／`dotsToUnicode`
- 驗證：1,694 句（含 book_txt、exam_txt）和 NVDA liblouis.dll 的 zh-tw、zh-tw-short 輸出逐句全部一致；`node tools/check-tactile.mjs` 全過
- 2026-10-20：縮點規則 v0.2（沒有聲母的一聲、輕聲不縮）；縮點閱讀表內建多音字修正（bt-zh-supplement-rules.json），所以頁面的「多音字修正」預設勾選，勾選時縮點欄和 zh-tw-short.ctb 1,694 句一致；改了 bt-zh-supplement-rules.json 要通知 NVDA-brailleTableSwitcher 重跑 build_short_ctb.py（它存了一份 tools/zh-polyphone-rules.json）

## 後續（2026-10-23）
- 規則 v0.3「讀打一致」：打字規則＝閱讀規則（一聲不加、輕聲聲母加點 8、沒有聲母的一聲／輕聲打兩方），只有 18 個音節的進階打法只打聲母；頁面的打法、讀寫範例照這個寫（6d-IME 的 tools/build_suodian.py 產生打法表）
- 標點：國語點字規範只有。？！後面空一方；zh-tw.ctb 的，、；後面多了空方。頁面勾「多音字與標點修正」（預設）時拿掉，和 brailleTableSwitcher 的 zh-tw-short.ctb、zh-tw-fix.ctb 一致（zh-tw-short.js 的 NO_BLANK_AFTER）
- 對照表國語點字和縮點等寬（table.compare 固定欄寬）；一個字一段（.seg，inline-block 不換行），結尾標點併進前一段、開頭標點併進後一段，標點不會在行首
- 點字字型 8DotBraille.ttf：由使用者在 FontStruct 做的「8-dot braille」（hurt.tw，CC BY-NC-SA 3.0，原檔 ../materials/8-dot-braille.otf，只有 NABCC ASCII）用 tools/build-8dot-braille-font.py 產生 U+2800–U+28FF 全部 256 個點型（空點畫成小點），並逐一驗證；改設計後重跑腳本。SimBraille 只有六點、NABCC 帶點 8 的是控制字元，所以頁面不提供 ASCII 顯示
