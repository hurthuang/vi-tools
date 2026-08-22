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
- 對齊：**（2026-07-04 更正，先前這則是錯的）** 不要用 `_lou_translateString`（8 參數）把
  outputPos 陣列塞進第 7 個「spacing」參數——那個參數型別是 `char*`（1 byte/cell），
  塞 int32 buffer 進去讀出來的位置全是垃圾值，比對會整批失真但不報錯。
  要拿逐字對應位置，必須用 `_lou_translate`（11 參數，內建正規的
  `outputPos`/`inputPos` int* 陣列）。`translateZhOracle`（braille-translate.htm）
  已在 2026-07-04 改用 `_lou_translate` 修正。

## 多音字補充規則（已完成，2026-07-04）

### 背景與方法
- `correction/`（未加入版控，授權使用）內的 `my_dict.dic`（心測中心 NVDA 語音校對紀錄）、
  `破音詞庫.json`（鄭明芳老師轉譯軟體用）都是「已知多音字容易誤讀」的詞表，
  跟 `bt-補充字典-得地.json`（國台圖字典.csv 得/地章節）性質相同，但消費端原本不同
  （NVDA 語音 vs 鄭老師的轉譯核心），細節見 `project_correction_dict_sources`／
  `project_zh_polyphone_moedict_verify` 記憶。
- 用萌典 API（`https://www.moedict.tw/uni/{詞}.json`）當權威來源交叉驗證候選字：
  查「from 詞」在該語境的正確注音、查「替代字」單字所有可能讀音，字串相同才採信——
  完全不做任何點字轉換（因為專案裡至少有三套互不相容的注音/點字慣例：
  zh-tw.ctb 的 U+3105-312F 注音符號 letter 定義、mcbopomofo 的
  `BopomofoBrailleConverter`、liblouis hanzi 直接查表，三者對同一注音給出的點字碼都不同）。
- **比對「bt 現在輸出什麼」務必用 bt 自己的 `parseCtb`/`zhMap`/`zhCtxRules`/`zhCorrectMap`
  邏輯（純 JS 正規表達式解析 zh-tw.ctb 原始檔+規則套用），不能用 liblouis WASM 的
  `_lou_translate` 代替**——兩者對於 word-boundary 相關的多字詞讀音會有落差
  （bt 的簡化版 JS parser 沒有實作 liblouis C 引擎的 word/begword opcode 全部語意），
  第一輪比對誤用 liblouis 當 bt 的替身，數字有出入但方向一致，已用 bt 自己的邏輯重跑校正。
- 得/地字典抓出 4 筆真錯（買得/樂得/落得/只得 的「得」記成輕聲，其實是動詞義
  「得以」該念完整二聲 ㄉㄜˊ，已訂正）。my_dict.dic + 破音詞庫 共 22 筆萌典驗證通過的新詞條。

### 檔案與整合
- `correction/bt-補充字典-得地.json`（701 筆，4 筆已訂正）+
  `correction/bt-補充字典-my_dict破音詞庫.json`（22 筆，新增）→ 合併成
  `bt-zh-supplement-rules.json`（repo 根目錄，**有進版控，會部署**；來源 `correction/`
  內的原始詞表授權來源不明確是否可公開發佈，故不進版控，只有合併後的
  word→braille 對照表上線）。同一詞若有多個 targetChar/targetIndex（如「長得」同時要修
  長跟得）會合併成同一條規則、一次套用全部修正。
- 整合進 `braille-translate.htm` 既有的「自定義規則」機制（`customRules`/`customRuleMatch`，
  整詞比對 → 整詞點字覆蓋，跟英文自訂規則共用同一套 tokenizer 攔截點）：
  新增 `builtinZhRules`（獨立於使用者自己的 `customRules`，不會混進使用者的規則列表/匯出/匯入）、
  `zh-supplement-toggle` 核取方塊（自定義點字規則面板內，狀態存
  `localStorage['vi-bt-zh-supplement-enabled']`），`customRuleMatch` 兩邊都查、
  同長度時使用者自訂規則優先。

### 已知殘留問題（未修，超出這輪驗證範圍）
- 「了不得」目前補充字典只修了「了」，「得」「不」的預設讀音其實也是錯的
  （萌典：ㄌㄧㄠˇ ˙ㄅㄨ ˙ㄉㄜ，兩個字都是輕聲，但 bt 預設都不是）；
  因為這牽涉「不」的聲調，超出得/地/my_dict/破音詞庫這輪的驗證範圍，先留著沒動。

## bt：閉單引號緊接句尾標點被誤判為所有格尾（已完成，2026-07-04）

- `tokenizeWithCustom` 裡英數 run 收集完後，會判斷後面接的 `'` 是不是所有格尾
  （如 `students'`），排除條件原本只看「後面緊接的字元是不是引號類字元」——
  但 `'Yesterday'.` 這種「閉單引號後面先接句尾標點、再接外層閉雙引號」的情況，
  緊接 `'` 後面的是句號 `.`，不是引號字元，條件抓不到，於是把 `classifyApostrophes`
  pre-pass 已經配對好的閉引號誤當成所有格尾整個吸收進單字 run（`Yesterday` 變成
  `Yesterday'`），閉單引號因此消失、變成一個裸的撇號 ⠄。
- 修法：判斷式加一條 `!apoQuotes.has(i)`——如果 pre-pass 已經判定這個位置是配對好的
  引號，就不要再當所有格尾吸收。真正的所有格尾（如 `students'`）前面沒有配對的開引號，
  `apoQuotes` 本來就不會標記到，不受影響，沒有 regression。

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

## Word docx：docDefaults 預設西方語言若為 zh-TW，SimBraille 會被靜默替換成中文字型（已釐清，2026-08-09）

### 背景
在（本 repo 之外的）另一份 Word 文件「UEB 學習手冊」上，把內文中的 Unicode 點字
（U+2800-U+28FF）轉成 ASCII + SimBraille 字型時，每個點字 run 都已明確設定
`<w:rFonts w:ascii="SimBraille" w:eastAsia="SimBraille" w:hAnsi="SimBraille" w:cs="SimBraille"/>`，
但不論在 Word 畫面上或匯出 PDF，該文字仍顯示成新細明體（PMingLiU），完全看不到點字圖案。
用 Word COM 開文件確認 `Range.Font.NameAscii` 回報值正確是 `"SimBraille"`，但實際繪製的字型
不同，證實這不是 run 層級的設定錯誤。

### 根因
文件的 `word/styles.xml` → `docDefaults` → `<w:rPrDefault><w:rPr><w:lang w:val="zh-TW" .../>`——
也就是文件的**預設西方語言**被設成 zh-TW（正常應是 en-US）。這個設定會觸發 Word 的字型替換
（font-linking）邏輯，把 ASCII 範圍字元的顯示字型換成中文字型，即使該 run 有明確的
`w:ascii`/`w:cs` 覆寫也蓋不過去——這是「整份文件」層級的判斷，不是單一 run 的屬性能覆蓋的
（實測：在同一 run 上疊加 `w:lang w:val="en-US"` 直接覆寫也沒用，必須改 docDefaults 本身）。

### 診斷方法（因為畫面上看不出差異，肉眼除錯會卡死）
用 Word COM（PowerShell）把「會壞」和「不會壞」的文件分別 `ExportAsFixedFormat` 存成 PDF，
直接讀 PDF 內的 `/BaseFont` 清單比對兩者實際內嵌的字型名稱——這比對 Word 畫面截圖快很多，
也比單看 `Range.Font.*` 準（COM 屬性可能回報「宣告值」而非「實際繪製字型」）。用這個方法對
`styles.xml`/`fontTable.xml`/`settings.xml` 逐檔換入換出做二分法，鎖定到就是 docDefaults 的
`w:lang w:val`。

### 修法與影響範圍
只改 `docDefaults` 裡 `<w:lang>` 的 `w:val`（西方語言）從 `zh-TW` 改成 `en-US`；`w:eastAsia="zh-TW"`
不動，文件裡原有的中文內容不受影響（中文渲染看的是 `eastAsia`，不是 `val`）。

### 對本 repo 的相關性
`document/教材/.build/rebuild.js` 產生 ASCII+SimBraille 版 docx 用的是字元樣式
（`BrailleASCII` custom style，見該檔第 652-664 行），跟這次踩到的直接 run-level `rFonts`
寫法不同，且其來源文件 `docDefaults.lang.val` 本來就是 `en-US`（非 zh-TW），因此目前沒有中獎。
但只要哪天 rebuild.js 的輸入來源換成一份「預設西方語言是 zh-TW」的 Word 文件（例如直接用
繁中 Word 手動編輯產生的檔案，而非目前這種由程式產出的樣板），SimBraille 字型顯示就會無聲
失效——值得在該類來源文件上跑 rebuild.js 前，順手檢查一下 `styles.xml` 的 `docDefaults.lang.val`。
