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
- `reg-bt.html`：BT engine regression（446 liblouis ground truth，全部通過；後台頁面，不在主導覽列）

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

## 工具命名、圖示與導覽整合（已完成，2026-06-11）

### 工具正式名稱與符號
| 檔案 | 正式名稱 | 符號 | 頁面標題 |
|------|----------|------|---------|
| `braille-translate.htm` | 文字轉點字 | → | → 文字轉點字 |
| `braille-to-text.html` | 點字轉文字 | ← | ← 點字轉文字 |
| `nemeth_converter.html` | 數學點字 | π | π 數學點字 |
| `pdf-to-accessible.html` | 文件整理 | 📄 | 📄 文件整理 |
| `UEB-g2-query.html` | UEB 查詢 | 🔍 | 🔍 UEB 查詢 |

- 內部 codename（bt/b2t/nc/p2a/query）僅保留於 HTML id（`tab-bt`、`frame-bt` 等），不出現在 UI 文字
- 📄 🔍 為 emoji，字型渲染比 → ← π 略大，使用者確認「維持現狀」

### 導覽列順序（index.html）
主頁 → →文字轉點字 → ←點字轉文字 → π數學點字 → 📄文件整理 → 🔍UEB查詢 → 📖說明

### 說明頁（guide.html）
- 新增 `guide.html`，以 iframe 嵌入 index.html 的「說明」tab（`frame-guide`，hash `guide`）
- `window.self !== window.top` 偵測：iframe 內自動加 `.in-frame` class，隱藏 topbar，sidebar top 調為 0
- postMessage 主題同步（與其他工具頁相同協定）：父頁 `querySelectorAll('iframe')` 廣播，guide.html 監聽 `{type:'setTheme'}`
- 側邊欄區段：→文字轉點字、←點字轉文字、π數學點字、📄文件整理、🔍UEB查詢，含共同功能子節
- HASH_MAP 新增 `'frame-guide': 'guide'`

## zh-tw 正向多音字：已驗證事實（勿再自行推論）

### opcode 盤點（Opus 4.8 原始碼層級確認，2026-06-29）
- `noback always`：**0 條**，不存在，不用補。
- 唯一未處理且觸及 CJK 的 opcode：`word`(11) + `begword`(1) = 12 條。
  字：倔几唧子徬据祇茍虮觜迤。**只有「子」實際重要**
  （begword/word 子 = 125-156-4 zǐ；目前只有 letter 子的輕聲預設，
  獨立/詞首的「子」會錯，例：子曰 vs 桌子）。其餘多為簡體/異體/罕用。
- skip `%`/`$` 規則丟 0 條 CJK；`curr.length===1` 漏 0 條 CJK focus。

### liblouis pass 規則排序（lou_translateString.c / compileTranslationTable.c）
- `addForwardPassRule` 依 charslen **由大到小**插入 forPassRules；
  `findForPassRule` 回傳第一條 passDoTest 過的 → 實為「長 match 優先」，
  **檔案順序只在 charslen 相同時當 tiebreak**。作者不需排序，liblouis 強制排。
- charslen 來自 passFindCharacters = 扣掉 lookback 後第一段字面 run
  = **focus + 後文(next)**；**前文(prev/lookback)不計入優先序**。
  → 正確排序鍵：next.length DESC，再 file-index ASC（不是總脈絡長度）。
- `correct` 在 liblouis 是**獨立前置 pass**（makeCorrections 先改寫整串，
  再進 context）；context 看到的是**改寫後**鄰字。
  correct 內部排序也是 charslen DESC。

### 與目前實作（braille-translate.htm）的已知落差
- `_applyZhCtxRule` 用 array(file) 順序 first-match → 未照 next.length 排序。
- `_applyZhCorrect` 是 per-char inline、`_applyZhCtxRule` 前後文讀原始 `text[]` →
  未反映「correct 先跑、context 讀改寫後字串」。
  有 21 條 context 規則的 prev/next 引用了 correct 的 LHS 字（如 斗/彊/尸/价/种）。

### 驗證策略（先做這個，再決定要不要改）
用已載入的 liblouis WASM（LOU）當 oracle：讓 LOU 掛 zh-tw.ctb 做正向，
寫 differential test 比對「parseCtb 正向」vs「LOU 正向」，
每筆 diff 即真 bug（排序 / correct pass / word 三類之一）。
有真實 diff 數再決定排序修正的細度。

**oracle 實作要點（已確認）：**
- 載入：`_loadTableFile('zh-tw.ctb')` + TABLE_DEPS 補齊 5 個依賴（全在 `table/`）
  ```
  'zh-tw.ctb': ['en-us-comp8.ctb','IPA-unicode-range.uti','braille-patterns.cti','spaces.uti']
  'en-us-comp8.ctb': ['loweredDigits6Dots.uti','latinLetterDef8Dots.uti']
  ```
- 解碼：zh-tw.ctb 無 text_nabcc.dis，UTF-32 build 直接輸出 Unicode codepoint（0x2800–0x28FF）
  → 解碼函式用 `String.fromCodePoint(val)`，**不套現有 NABCC_TO_UNI**
- 對齊：`_lou_translateString` 第 7 參數傳實際 outpos 陣列，可拿到每個 cell 對應的輸入 char index
  → 據此把多 cell 的點字聚回原始 CJK 字，再逐字比對

## 轉換判斷修正一輪（已完成，2026-07-03）

### bt：UEB 直單引號 `'` 誤判為引號
- `classifyApostrophes`（braille-translate.htm）原本「開引號候選 → 往後掃到下一個換行前找配對」，
  範圍過大且會跟所有格撇號（`-s'`）樣式衝突，例：`rock 'n' roll`、跨句的
  `'Twas ... boys' game` 都會被錯誤配成一對引號。
- 修法：① 加 `APOS_ELISION_WORDS` 白名單（n/til/cause/em/tis/twas/twill/round/bout/fraid/nuff），
  這些詞開頭一律當撇號、不進入配對搜尋；② 配對搜尋遇到句界（`.!?` 後接空白/行尾）就放棄，不跨句配對。
- 殘留已知風險：同一句內若真的有「省略號開頭詞 + 後方所有格詞」還是會誤判
  （例：`'Twas the boys' idea.`），機率低，接受此取捨。

### b2t：中文注音 / 英文 UEB 誤判
- `_isChineseChunk`（braille-to-text.html）原本只看 `convertBrailleToTokens` 回傳的第一個
  token 是不是 bpmf 物件；但 McBopomofoWeb 的判斷不檢查聲母/韻母/調號順序，
  英文字母格湊巧也可能被硬讀成不合語法順序的注音（例：`⠍⠁⠽`「may」被讀成「ㄇㄧㄥ˙」，
  調號夾在聲母韻母中間，不合法但仍回傳成功）。
- 修法：往返驗證——`convertBpmfToBraille(token.bpmf)` 重新編碼，若跟原始點字不完全一致，
  代表語法順序其實不合法，不當中文。真正的注音一定往返一致。
- `_buildChineseCharTokens` 順便簡化：改用 token 自帶的 `.braille`（原始輸入的實際點字格），
  不再用 `convertBpmfToBraille` 重新編碼去畫校對區（原本的重編碼可能跟原始輸入順序不同）。

### b2t：反向翻譯撇號亂碼（`_louBackTranslate`）
- `en-ueb-g2.ctb` 裡 wordsign+撇號縮寫（can't/it's/that's/you're/you'll/you've/child's…）的
  `nofor word` 反向翻譯規則，原始碼用彎撇號 U+2019；這個 liblouis WASM build 編譯這幾條規則時
  沒把它當一個 UTF-8 字元解碼，拆成三個原始位元組（U+00E2 U+0080 U+0099）分別輸出，
  導致反向翻譯結果變成 `canât`、`itâs` 這種亂碼。已用 Node + `build-no-tables-utf32.js` 直接
  掛真表驗證（`table/en-ueb-g2.ctb` 原始碼第153-296行可查到 `nofor word` 定義）。
- 這是 liblouis WASM build 內部行為，不是我們載入點字表方式造成的（位元組層級原封不動寫入虛擬檔案系統）。
- 修法：`_fixBackTranslateMojibake` 在 `_louBackTranslate` 輸出端做正規化，把固定的三位元組亂碼序列換回 `'`。

### bt：Nemeth 題號誤判限制在行首
- `isQNum`（braille-translate.htm）原本只要「數字 + `.` + 空白/行尾」就當題號，用上位 UEB 格式；
  但這個樣式跟任何數字結尾的句子一樣（`x = 5.`、`答案是 12.`），會誤判。
- 依使用者選擇：加上「數字前面（略過空白/縮排）必須是換行或文件開頭」的行首限制。
- 取捨：`Problem 5. Find x.` 這種題號夾在句中的寫法，行首限制後不再判定為題號，
  退化成一般 Nemeth 數字；使用者評估教材裡題號多半獨立成行，接受此取捨。

### 附帶修正
- 六點鍵盤面板提示文字「S=1 D=2 F=3」寫反了（`shared.js` `KEY_BITS` 實際上 F=1 D=2 S=3 才對），
  5 個檔案（shared.js/braille-to-text.html/braille-translate.htm/nemeth_converter.html/UEB-g2-query.html）
  的提示文字都改成 `F=1 D=2 S=3`，程式碼本身沒改。
