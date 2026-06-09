# 專案說明（Claude Code 自動載入）

## 專案性質
視障輔助工具集，以視覺障礙教學為核心目的。
GitHub：https://github.com/hurthuang/vi-tools
網址：https://hurthuang.github.io/vi-tools/

## 進行中的工作：UEB G2 規則整合

### 背景
- `braille-translate.htm`（bt）有按規則類別分組的勾選面板，讓初學者分批啟用 UEB G2 縮寫規則，以 liblouis 翻譯但資料表是自編的
- `UEB-g2-query.html`（query）有自寫 JS 引擎，逐條說明套用了哪條縮寫規則，教學用途
- 兩者與「直接丟 liblouis」的模式不同，以規則可見性為設計核心
- 目標：把兩個工具的規則資料整合為共用 JS，並與 liblouis 比對驗證正確率

### 三個步驟（依序）

**① 建立 `ueb-g2-rules.js`（最優先）**

把 bt 現有的資料表抽出：
- `G2_ALWAYS`、`G2_ANYWHERE`、`G2_BEGWORD`、`G2_MIDWORD`、`G2_MIDEND`、`G2_LOWWORD`、`G2_SUFWORD`、`G2_WORD`
- 類別定義與分組（`grp_alpha`、`grp_strong`、`grp_lower`、`grp_suffix`、`grp_word`）
- `buildFilteredTables(enabledSet)` 純函式（從 bt `buildCustomG2Tables` 提取）
- 常數：`WS_ALPHA_WORDS`、`WS_ALPHA_SET`、`WS_STRONG_SET`

bt 和 query 都改 `<script src="ueb-g2-rules.js">` 引用，移除各自的內嵌定義。

**② query 改用共用規則**
- 自寫引擎的規則說明標籤，對應 `ueb-g2-rules.js` 的類別
- 移除 query 裡的 `⚙ Regression` tab

**③ 獨立後台 Regression 頁面**
- 建立 `reg-test.html`，**不加進 `index.html` 分頁列**
- 自訂 JS vs liblouis 428 筆 ground truth 比對，可按規則類別看正確率

### 目前各檔案狀態
- `index.html`：有 3 行文字微調未 commit（「G2 反查」→「G2 反轉」等）
- `UEB-g2-query.html`：已 commit，含 liblouis 比對與「回報歧異」按鈕
- `braille-translate.htm`：已 commit，`buildCustomG2Tables()` 在 line 3273，資料表在 line 1225–1400
- `test-server.bat`：未 commit（Node.js 本機 HTTP server）
- **`ueb-g2-rules.js` 已建立（2026-06-09）**，語法驗證通過

### `ueb-g2-rules.js` 驗證結果
- G2_ALWAYS: 83 keys、G2_WORD: 1296 keys、G2_EXCEPTIONS: 84 keys
- UEB_GROUPS: 5 groups / 13 items（對應 bt checkbox 面板完整）
- `buildFilteredTables(enabledSet)` 可運作
- `getCategoryKey("gh")` → `gs_ch_sh`、`getCategoryKey("tion")` → `suffix_dot56` 等正確

### 下次繼續
步驟 ①（建 `ueb-g2-rules.js`）已完成。
接下來：
1. 修改 `braille-translate.htm`，移除內嵌的 G2_* 資料表，改 `<script src="ueb-g2-rules.js">`，`buildCustomG2Tables` → `buildFilteredTables`
2. 修改 `UEB-g2-query.html`，引用 `ueb-g2-rules.js`，移除 Regression tab
3. 建立 `reg-test.html` 後台頁面
先把目前所有修改（`index.html`、`CLAUDE.md`、`ueb-g2-rules.js`、`test-server.bat`）commit push。
