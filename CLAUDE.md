# 專案說明（Claude Code 自動載入）

## 專案性質
視障輔助工具集，以視覺障礙教學為核心目的。
GitHub：https://github.com/hurthuang/vi-tools
網址：https://hurthuang.github.io/vi-tools/

## UEB G2 規則整合（已完成，2026-06-10）

### 背景
- `braille-translate.htm`（bt）有按規則類別分組的勾選面板，讓初學者分批啟用 UEB G2 縮寫規則，資料表是自編的
- `UEB-g2-query.html`（query）有自寫 JS 引擎，逐條說明套用了哪條縮寫規則，教學用途
- 兩者與「直接丟 liblouis」的模式不同，以規則可見性為設計核心
- 目標：把兩個工具的規則資料整合為共用 JS，並與 liblouis 比對驗證正確率 ✓

### 相關檔案
- `ueb-g2-rules.js`：共用規則模組（G2_ALWAYS/WORD/…、blocking predicates、buildFilteredTables）
- `braille-translate.htm`：bt，已移除 inline G2_* 表，改用 ueb-g2-rules.js
- `UEB-g2-query.html`：query，GA/GN/GB/GME/GL/GW 已遷移至共用常數；Regression tab 已移除
- `reg-bt.html`：BT engine regression（428 liblouis ground truth，全部通過）
- `reg-test.html`：reg-bt.html 的 iframe 包裝（後台頁面，不在主導覽列）

### blocking predicates（ueb-g2-rules.js）
con/dis begword、ea groupsign、of/gh/here/there/those/ever/mother/one/under/had/st always、
th/wh/sh 跨複合詞邊界、跨前綴邊界、dis+c 細分（disco/discern 可縮；disc 字尾不縮）

## 六點輸入統一浮動面板（已完成，2026-06-11）

### 背景
- bt / b2t / nc 三頁各有六點鍵盤輸入（Ctrl+B）和點陣輸入面板，但實作分散、按鈕位置與樣式不一致
- 目標：整合為 `shared.js` 的 `initBraillePanel`，三頁統一觸發按鈕位置、浮動面板 UI、鍵盤模式顏色指示 ✓

### 架構
- `shared.js` 新增 `initBraillePanel(opts)`，取代原有 `initBrailleInput` + `initDotGrid`
- 浮動面板（`position:fixed`）錨定觸發按鈕下方；手機寬度 ≤540px 自動變 bottom-sheet
- 面板分兩區：上方六點鍵盤開關（含按鍵說明），下方六點點陣輸入格
- 暗色主題支援；ESC 或點外側關閉

### 三頁整合方式
| 頁面 | 觸發按鈕位置 | 整合模式 |
|------|------------|---------|
| `braille-to-text.html`（b2t） | 輸入框標題旁 `area-label` | 完整模式（含 Ctrl+B 鍵盤管理） |
| `nemeth_converter.html`（nc） | n2l 輸入標題 `.ph` 右側 | 完整模式，`checkActive: curMode==='n2l'` |
| `braille-translate.htm`（bt） | 輸入框標題旁 | `externalKbd` 模式（保留 bt 原有 ASCII/Unicode 感知鍵盤邏輯與 fmt-textarea 支援） |

### opts 參數
- `triggerId`：觸發按鈕 id
- `targetId`：目標 textarea id
- `onInsert?`：插入後 callback
- `checkActive?`：`() => bool`（tab 頁面用）
- `globalToggle?`：Ctrl+B 不需 textarea 有焦點
- `insertFn?`：`(bits) => void`，覆寫插入邏輯（bt ASCII 模式用）
- `externalKbd?`：`{ toggle(bool), getState:()=>bool }`，由外部管理鍵盤狀態

### 視覺規範
- 觸發按鈕：`.brlp-trigger` class，中性邊框樣式（`:not(.btn)` 時由 shared.js 提供）
- 鍵盤模式開啟時：`kbd-on` class → 藍底白字（`#1565c0`）
- `title` 氣泡提示三行：功能說明、Ctrl+B 按鍵對照、點陣操作方式

### 注意事項
- `UEB-g2-query.html`（query）為小量文字查詢模式，點陣輸入保留原有 inline 實作，不納入 initBraillePanel
