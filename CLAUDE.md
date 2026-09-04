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

## nc（nemeth_converter.html）l2n/n2l 多輪修正與功能補強（已完成，2026-08-29）

### l2n 輸出功能補強
- 新增 Unicode／ASCII+SimBraille 輸出格式切換（比照 bt 既有做法，`@font-face` 載入
  SIMBRL.TTF，`brlToAsciiMixed()` 只轉字串裡的點字 Unicode 字元、其餘文字不動）。
- 修「l2n 複製到 n2l 換行消失」：`l2n-out` 是一堆 `<div data-line>` 組成，`.textContent`
  讀取多個 `<div>` 不會補回換行。改成保留 `l2nConvert()` 算出的原始行陣列
  （`_l2nOutLines`），複製/存檔改用 `.join('\n')`。
- 新增 `vi-nc-session`（localStorage）自動存檔，l2n/n2l 輸入內容 + 分頁 + 輸出格式，
  重整頁面會跳出「有上次輸入內容」提示列，跟 bt/b2t 既有存檔提示列同一套邏輯（bt/b2t
  的驗證函式本來就已預留 `type==='nc'` 分支，這次補上）。

### n2l 巢狀上標（Rule 14.4.3）解析 bug
- l2n 端疊冪（如 `n^{x^y}`）會疊加連續多個 `^` 表示深度（`N^X^^Y`），n2l 舊解析器
  （單一 regex `[^"^;]+`）不認得疊加，會拆成兩個各自獨立的上標，變成
  `n^{x}^^{y}` 這種缺共同底數的畸形 LaTeX——正是 MathJax "Double exponent: use
  braces to clarify" 錯誤的成因。改寫成小型手寫掃描 `_wrapNemSup`：連續 `^`
  只算一個指示符，遇到更深一層的 `^` 連續段視為目前內容的一部分、遞迴展開。
- 連帶修好：分數/根號內容含指數時被多包一層大括號（`a^{{n}}`）——原因是
  `parseNemFrac`/`parseNemRadical` 遞迴呼叫 `parseNemStr` 處理分子分母時，內部
  已轉換好的 `^{...}` LaTeX 被外層 `_wrapNemSup` 誤認成還沒處理的原始標記重包一次；
  修法是偵測「單一個 `^` 後面緊接 `{`」代表已轉換完的 LaTeX，直接照抄跳過。
- 上標內容終止條件加了空格：l2n 端「上標後面直接接空格」會省略回基線指示符 `"`
  （空方本身就讓讀者回到基線），n2l 原本沒把空格算終止條件，導致
  `2^{10}=a\times2^{6}` 這種算式，等號後面的內容全部被吞進前一個指數裡。

### n2l 分數 bug：`/`（分數線）跟 `\neg`（否定符號）共用同一字元互相打架
- `nemBrlToLatex` 在真正切開分數結構前會先跑一輪 GEO 符號表（處理集合/角度等），
  其中 `\neg` 規則把裸 `/` 直接轉成 `\neg`——但分數線 `?num/den#` 用的也是同一個
  `/`，GEO pass 這時候還沒切開分數結構，會把任何分數的分數線搶先吃掉，等
  `parseNemFrac` 要切分子分母時 `/` 已經不見了。修法：`nemBrlToLatex` 跑 GEO
  規則前先用 `_maskFracSlashes()`（規則跟 `parseNemFrac` 自己 4 條分數規則一一
  對應、順序相同）把真正的分數線暫時換成私有字元，跑完 GEO 規則再換回來，
  天生支援任意深度巢狀分數（繁分數/超繁分數）。
- 同類 bug 另外抓到兩個：`\because`（∵ 用 `` `/ ``，backtick+slash 複合符號，
  也被 `\neg` 規則搶走 `/`；修法：`\neg` 的 nemRe 加 lookbehind 排除前面緊接
  backtick 的情形，注意 lookbehind `(?<!x)` 要放在保護對象**前面**）；
  `\forall{x}`/`\exists{x}` 少了強制空格（GEO 表自己寫的還原函式忘了補，
  旁邊 `NEM_TOKENS` 表裡其實有正確版本但比對順序排後面、從未執行到，變成死碼），
  導致 `\forallX` 這種黏在一起、MathJax 直接報錯的結果，順便也讓變數字母沒被
  正確還原成小寫（沒空格時「反斜線後連續字母都當指令名跳過」邏輯把變數也吞了）。

### ASCII 點字顯示改用真正點顯器相容的字元 + 小寫字母
- 對照 `table/text_nabcc.dis`（liblouis 附的標準電腦點字 8 點 ASCII 對照表）發現：
  ASCII 64–95 這段字元（`@ A-Z [ \ ] ^ _`）除了底線 `_` 是唯一例外，點顯器都會
  自動多加第 7 點，導致 nc 原本挑的幾個 dot-4 系列符號在真實點顯器上顯示錯誤
  （例：`@` 想表達純 dot-4，點顯器會顯示成 dot4-7）。逐一換成 96–127 區段的
  安全字元：`@`→`` ` ``（dot4）、`^`→`~`（dot4-5，上標指示符）、`\`→`|`
  （dot1256，絕對值直線）、`[`→`{`（dot246，角/箭頭前綴）、`]`→`}`（dot12456，
  根號/修飾符收尾）。做法：`asc2brl`（輸入）新舊字元都收，`brl2asc`（輸出）跟
  所有比對「brl2asc 解碼結果」的 n2l regex 都改用新字元，l2n 內部建構字串維持
  用舊字元不動。事後發現 bt 的 `BR_TO_ASCII` 表早就獨立採用完全一樣的五個字元
  對應，互相印證選字正確。
- ASCII+SimBraille 顯示的英文字母改小寫（`brlToAsciiMixed()` 對 `brl2asc(c)`
  結果套 `.toLowerCase()`）——nc 內部 n2l 邏輯（大寫指示符、SIN/COS 函式名比對、
  化學元素判斷等）全部維持大寫不動，只在最後顯示層轉小寫；bt 的 `BR_TO_ASCII`
  本來就是小寫，這次是讓 nc 追上一致。

### l2n 題號自動轉 UEB 上位數字
- Nemeth 數學數字（下位，nc 內部 `Pr` 表數字一路在用）跟 UEB 文字數字（上位）
  點位真的不一樣（共用同一個數字指示符 ⠼ dots3456，但接在後面的數字本體點位
  一組是字母 a-j 那組、一組整組下移一排），題號不是數學內容，依慣例該用上位。
  `wrapStandaloneNumbers()` 原本刻意跳過題號、不包進數學區塊，導致題號從頭到尾
  沒進過轉換管線，永遠停留在純文字（不管 Unicode 或 ASCII+SimBraille 模式都
  顯示不出點字）。新增 `UEB_NUMSIGN`/`UEB_DIGIT`（點位跟 bt 的 `UEB_DIGIT` 一致）
  + `ueQNumBraille()`，`l2nConvert()` 每行開頭偵測「（可縮排）數字+`.`+空白/
  行尾」自動轉換，句點維持原樣文字（跟同行其他標點一致）。`(N)` 括號格式風險
  較高（可能跟函式引數 `f(3)`、公式標號引用混淆，且沒有「N.」天然的行首邊界），
  這輪刻意不處理，維持 `wrapStandaloneNumbers()` 現有排除行為。

## nc → bt 銜接工作流程調查與「複製並開啟 bt」按鈕（已完成，2026-08-30）

### 背景與動機
以「製作試卷」角度討論 bt 有哪些功能可以給 nc 共用時，發現更合理的方向不是搬功能，
而是分工：nc 專心做複雜數學（bt 完全不懂分數/指數/根號），bt 負責它本來就擅長的
中文/英文點字轉譯＋排版（每行方數、低年級模式、匯出檔案）。於是改成調查「nc 編輯
好的數學試卷，直接丟到 bt 轉成含中文的全點字檔案」這個工作流程是否可行。

### 技術驗證（起本機 HTTP server 實測，file:// 會被擴充功能擋掉）
- bt 主要翻譯引擎 `tokenizeWithCustom` 的比對順序（空白/換行→Nemeth模式數學符號→
  題號句點→一般標點表→`_isZhChar`中文字元→catch-all）逐一確認：非空白的點字
  Unicode 字元（U+2801~U+28FF）不會命中任何一關（`_isZhChar` 只認 0x4E00–0x9FFF，
  跟點字區不重疊），最後落到 catch-all 分支 `zhMap.get(_eff) || ch`，查不到就直接
  用原字元當輸出——**原樣穿透**。「中英文邊界自動插入空格」規則也不會誤觸點字段落
  （判斷依據是 `isEnglish`/`isNumber`/CJK，點字 token 兩者都不是）。
- 用真實瀏覽器測試驗證：nc 轉出 `⠼⠁⠓. 若 ⠼⠆⠘⠶⠐⠬⠆⠘⠦⠀⠨⠅⠀⠁ ，則下列何者不是
  ⠁ 的因數？`（Unicode 點字模式）直接貼進 bt、按轉換，數學段落一字不差原樣穿透，
  周圍中文正常翻譯，題號句點（nc 留的純文字 `.`）還被 bt 自己的題號句點邏輯接手
  轉成正確的上位 UEB 句號⠲——兩邊無縫接上。
- **前提是 nc 必須輸出 Unicode 點字模式，不能是 ASCII+SimBraille 模式**：ASCII
  模式的一般 ASCII 字元（`x`、`#`、`~` 等）會被 bt 的主引擎當成真正的英文字母/
  標點重新誤譯一次，整段數學會被搞爛（已用瀏覽器實測兩種情況對照確認）。

### 兩個規則細節的判斷（討論後決定不動）
- **題號句點用英文/UEB 慣例（dots256 ⠲）而非中文慣例**：對照 `table/zh-tw.ctb`，
  中文全形句號「。」是 dots36、全形句點「．」是 dots46，都不是 dots256——bt 的
  題號句點邏輯是獨立特判、沒有走 `getPunct()` 既有的中英文語境切換機制
  （`ZH_CONFLICT_PUNCT`/`isCJKContext`）。但因為題號的**數字本身**就是刻意選擇
  「上位 UEB」格式（跟中文/Nemeth 下位數字都不同源），句點維持同一套英文慣例
  反而內部一致，決定維持現狀不用改。
- **Nemeth 夾雜文字不加正式的「切換指示符」**：查到 Nemeth 2022 規則書 4.2 節
  的 Code Switch Indicators（開始 `_%`=⠸⠩、結束 `_:`=⠸⠱、單詞 `,'`=⠠⠄），但
  確認過這是 BANA 針對 **UEB** 訂的規範，注音/國語點字不是 UEB，不能直接套用；
  這個 repo 裡也沒有查到「國語點字夾 Nemeth」的既有轉寫慣例可以參考（CH1~11
  教材專案產出的是 Word docx 給老師視覺閱讀，不是走 bt 的全點字檔案，沒有先例）。
  沒有權威資料可查證，維持現有「中文/數學用空格自然分隔」的方式即可，不強加
  規則書沒有明確涵蓋的指示符。

### 實作：nc 新增「送到 bt →」按鈕
- l2n 面板新增按鈕，呼叫 `l2nCopyForBt()`：內容一律用 Unicode 點字（新增
  `_l2nOutLinesUnicode`，在 `l2nConvert()` 裡於套用 ASCII 顯示轉換**之前**存一份，
  不受目前 ASCII+SimBraille 顯示切換影響）。
- 第一版做「複製到剪貼簿＋開新分頁」，使用者反饋應該直接切到 index.html 的
  bt 分頁（`#t2b`）、直接填入 bt 輸入框，不要剪貼簿——但 nc/bt 都是包在
  `index.html` 裡的 iframe（`frame-nc`/`frame-bt`），彼此是平行關係，要跨三個
  檔案傳訊息：nc（iframe）→`index.html`（父頁，負責切分頁）→bt（另一個
  iframe，負責把文字放進輸入框）。改成依執行環境分流：
  - **包在 index.html 裡**（`window.parent!==window`）：`l2nCopyForBt()` 用
    `window.parent.postMessage({type:'sendToBt',text})` 送給父頁；`index.html`
    新增的訊息監聽器收到後呼叫既有的 `switchTo('frame-bt')` 切分頁（會正確更新
    分頁 UI 跟網址 hash），再用 `document.getElementById('frame-bt').contentWindow
    .postMessage({type:'setBtInput',text})` 轉發給 bt 的 iframe；bt 新增的
    `setBtInput` 監聽器直接覆蓋 `#input-text` 的值並呼叫 `render()`
    （沿用既有 `setTheme` postMessage 的同一套跨 iframe 協定，訊息監聽器寫在
    一起）。
  - **單獨開啟 nc**（`window.parent===window`，例如直接開 `nemeth_converter.html`
    測試）：沒有父頁可以轉發，退回第一版的「複製到剪貼簿＋開新分頁」，使用者
    自己 Ctrl+V。
  - 覆蓋 bt 現有輸入內容前不彈確認框——這是使用者主動按下按鈕的操作，視為
    有意換掉目前內容。
- 用本機 server + 真實瀏覽器測完整流程（`index.html#math` 觸發按鈕 → 分頁自動
  切到 `#t2b` → bt 輸入框收到內容並自動 `render()` 出正確結果）跟單獨開啟 nc
  時 `window.parent===window` 正確判斷退回剪貼簿模式，兩條路徑都驗證過。

## bt：alphabetic/strong wordsign 緊接開括號/開引號時誤用整詞縮寫（已完成，2026-09-01）

### 背景與發現過程
使用者觀察到 abcbraille.com 和 APH BrailleBlaster 把 `you(` 轉成 `y|"<`（ASCII 點字，
`|`=dots1256），而非直覺預期的 `y"<`。用 repo 自己的 `build-no-tables-utf32.js` +
`en-ueb-g2.ctb` 寫 Node script 直接掛 liblouis WASM 驗證（繞開瀏覽器 fetch，改用
`fs.readFileSync` 把整個 `table/` 目錄塞進 `M.FS`），結果與兩個外部工具一致：
`y|"<` 才是對的。查 `document/Rules of Unified English Braille 2024.pdf`
（`document/2024_nolayout.txt`）Rule 10.1.1／10.2.1：alphabetic/strong wordsign
只有在整詞「standing alone」（Section 2.6）時才能用單格縮寫；Rule 2.6.3 列出
後方哪些標點仍算 standing alone（逗號/分號/冒號/句點/驚嘆號/問號/**閉**括號/
閉引號/撇號…），但**開**括號、開引號不在清單內。緊接開括號時（`you(`），wordsign
要退回一般拼法（如 "you" → letter Y + "ou" strong groupsign = `⠽⠳`）。

用 Node 腳本大量測試（`you` 後接各種字元）發現：這個 repo 用的 liblouis WASM build
本身對 Rule 2.6.3 的「允許清單」實作有缺陷，逗號/句點等其實都被錯誤觸發 fallback
（`you,` 該是 `y1` 卻給 `y|1`）——外部工具（abcbraille/BrailleBlaster）在這點是對的，
所以 fix 沒有直接照抄這個 WASM 的行為，而是自己重新實作 2.6.3 的允許清單。

### bt 原本的問題與根因
`translateWordWithApos`／`translateG2Word`（braille-translate.htm）原本用純字典查表
（`G2_WORD['you']` 等）忽略任何後方 context，一律直接用整詞縮寫。就算補上 context 判斷，
還會被 `applySpanTranslation`（`_getLineTokens` 在 `tokenizeWithCustom` 之後接著跑）蓋掉：
這個函式對每個英文 token 用「前一詞 空格 本詞 空格 後一詞」重組字串丟給 `LOU.translateSpan`
（liblouis WASM）取代 `t.braille`，`nextWord`/`prevWord` 只抓「下一個英文 token」，
標點完全不會進到這個字串——原文「you(」中間沒有空格的事實整個遺失，liblouis 看到的等於
「you」單獨一個字，永遠判定 standing alone。這是比 wordsign 查表更上層、更隱蔽的根因，
一開始只修 `translateWordWithApos` 完全沒用（有測試但看到頁面輸出沒變才發現）。

### 修法
1. `WS_BREAK_TRAILING`（新常數）＝會讓 standing alone 失效的開括號類字元：`( [ { ' “`
   （直引號 `"`/`'` 因開閉語意不明確、實務上少見緊貼詞尾，本輪不處理）。
2. `translateWordWithApos` 新增第三參數 `nextCh`（run 後方緊接、無空格的下一字元）；
   純字母無撇號分支內，若 `run` 屬於 `WS_ALPHA_SET`（見 `ueb-g2-rules.js`，23 個
   alphabetic wordsigns）或 `WS_STRONG_SET`（6 個 strong wordsigns：
   child/shall/this/which/out/still）且 `nextCh` 落在 `WS_BREAK_TRAILING`，改呼叫
   `translateG2Seq` 逐字元/groupsign 拼寫，不查整詞字典。呼叫端 `tokenizeWithCustom`
   把 `text[i]`（run 結束後緊接的原始字元）傳進去。
3. 因為 `applySpanTranslation` 會蓋掉這個 fallback，`tokenizeWithCustom` 同時算出
   `wsNotStandingAlone` 布林值存進 token，`applySpanTranslation` 的 skip 條件
   （原本只跳過 `isCustom`/`isNemeth`）加上 `|| t.wsNotStandingAlone`，讓它完全略過
   這個 token、不要用 liblouis 整句查詢覆蓋掉已經算好的 fallback 拼法。
4. `and/for/of/the/with`（strong contractions）不在 `WS_ALPHA_SET`/`WS_STRONG_SET`
   範圍內，這幾個是「anywhere」型 groupsign 本來就沒有 standing alone 限制，不受影響。

### 驗證
本機 HTTP server + Chrome 瀏覽器跑真實 `render()` pipeline（非單獨呼叫函式，因為
`applySpanTranslation` 只在完整流程才會生效），涵蓋：`you(` → `⠽⠳⠐⠣`、
`go(`/`out(`/`this(`/`have(` 都正確退回拼寫、`you,`/`you)`/`you.`/`you!`/`you;`/
`you:` 維持整詞縮寫不受影響（Rule 2.6.3 允許清單內）、`(you go)` 開括號在前不受影響
（Rule 2.6.2 本來就允許）、`you're happy`／一般句子（`You can go.`／
`Do you have it?`／`people like you`／`the cat sat`）均無 regression、
`ueb-custom` 模式同樣正確。

### 後續追查（同日）：be/his/was/were（Rule 10.5.1）有更嚴格的獨立規則，一併修好
使用者接著要求「檢查其他類似的規則遺漏」。用同一套 liblouis Node oracle 批次測
`G2_LOWWORD`（`his`/`was`/`were`/`enough`/`be`/`in`，見 `ueb-g2-rules.js`）發現
`was,`/`was.`/`was;`/`was:`/`was!`/`was?`/`was'`/`was"`/`was-`/`was[`/`was{` 全部
要退回逐字母拼寫（`w-a-s`），只有 `was)`/`was]`/`was}`（右括號類）才保留 lower
wordsign——比對 `document/Rules of Unified English Braille 2024.pdf` Rule 10.5.1
確認：這條規則比 10.1.1/10.2.1 更嚴，除了 standing alone 之外，「緊接任何**只有
下位點**的標點（含連字號/破折號，任何引號一律視為只有下位點）」就不能用縮寫，
即使該標點原本在 2.6.3 允許清單內（逗號、句號等）也一樣擋，因為右括號類完整點字
含上位點，不算「只有下位點」，是唯一例外。his/were/be 同一條規則、行為一致。

新增 `LOWER_WS_SET`（be/was/his/were）+ `LOWER_WS_ALLOW_TRAILING`（`)]}` 加空格），
用「允許清單」邏輯（預設擋、白名單放行）跟 alphabetic/strong wordsign 那條「擋清單」
邏輯（預設放行、黑名單擋）方向相反，接線位置一樣（`translateWordWithApos` 同一個
分支、`wsNotStandingAlone` 旗標同一個 `applySpanTranslation` skip 機制）。
**踩過一次坑**：`LOWER_WS_ALLOW_TRAILING` 一開始漏放空格，導致 `his car`／
`That was right` 這種最常見的「後面接空格」案例被誤判成不能用縮寫，整個退化成逐字母
拼寫——用瀏覽器測完整句子才抓到（單獨測 `was,` 這類邊界案例看不出來），修法是把
`' '`／`'⠀'` 加進允許清單。

### 後續追查（同日）：10.9.1 shortforms 同一個 standing alone 缺口，已修
使用者再要求「查一下 shortforms（10.9）有沒有一樣的缺口」。從 `table/en-ueb-g2.ctb`
第 1641-1715 行的 `match` 規則原文直接抽出官方 75 個 Rule 10.9.1 shortform 詞
（比手動輸入可靠），確認 bt 的 `G2_WORD` 早就有這些詞的正確縮寫值（如
`letter`→`⠇⠗`、`friend`→`⠋⠗`），但完全沒有 standing alone 判斷——跟 `you(` 那次
同一個缺口。liblouis oracle 交叉測試顯示這些詞緊接逗號/右括號時「一律」退回
逐字母拼寫，但這點**沒有照抄**：Rule 10.9.1 原文只講「standing alone」，用詞
跟 10.1.1/10.2.1 一樣，沒有 10.5.1 那種額外限制的文字依據；逗號、右括號照理仍在
2.6.3 允許清單內，這個 oracle 結果比較像是跟 `you,`/`enough,` 同一個 WASM build
對 2.6.3 允許清單實作不完整的已知缺陷重演，不是真的規則差異。所以新增的
`SHORTFORM_SET`（75 詞）套用跟 `WS_ALPHA_SET`/`WS_STRONG_SET` 完全一樣的
`WS_BREAK_TRAILING`（只擋開括號/開引號）判斷，不套用 `LOWER_WS_SET` 那種更嚴格
的擋法。範圍刻意只涵蓋 Rule 10.9.1（整詞＝shortform），不含 10.9.2-10.9.5
（shortform 當作較長複合詞一部分，如 aboveground/goodafternoon）——那半在
`G2_WORD` 裡跟一般整詞縮寫混在一起沒有獨立集合可查，範圍更大、風險更高，
呼應舊稽核記憶 #5「shortform 集合沒有乾淨的方式獨立列出來查」的已知限制。

驗證：`letter(`/`friend(`/`could(`/`would(` 都正確退回拼寫；`letter,`/`letter)`/
`letter a` 維持縮寫；一般句子（`I got your letter.`／`Could you help?`／
`good friend`／`She said hello.`／`the quick brown fox`）無 regression。

### 後續追查（同日）：liblouis oracle 對逗號類 standing alone 判斷不可信，已釐清根因
使用者質疑「同樣用 liblouis/wasm 為什麼會跟 abcbraille.com/BrailleBlaster 不一致」。
用 `C:\Program Files\NVDA\louis\tables`（NVDA 內建、完全不同來源的官方 liblouis 表格）
重跑 `you,`/`was,`/`enough,`/`letter,` 等測試，結果跟這個 repo 的表格**一模一樣**
（都退回拼寫），排除「這個 repo 表格版本落後」的假設；順便發現 `en-ueb-g2.ctb` 裡
be/enough/his/was/were 那幾條規則有個字元類別跟 NVDA 版本語法不同（多一個反斜線），
但實測結果不受影響，不是根因。也排除字串結尾邊界效應、liblouis mode 參數
（brute-force 測過 0/1/2/4/8/16/32/64/128/256）。

結論：liblouis 這幾條 match 規則的 trailing-context 判斷只認得「括號」這組字元
類別例外，沒有把 Section 2.6.3 完整允許清單（逗號/句號/分號/冒號/驚嘆號/問號等）
也編進判斷——這是兩個獨立 liblouis 來源共有的缺口，比較像共同上游（liblouis 表格
本身）多年沒補齊的實作限制。使用者直接在 abcbraille.com/BrailleBlaster 上實測
`you,` 確認是乾淨的 `y1`，符合規則書 10.1.1 條文本身沒有額外限制的讀法——
**bt 現有的修法（照規則書文字走，不照抄 oracle 對逗號的過度攔截）維持不變是對的**。
之後任何 wordsign/shortform 的 trailing-punctuation 判斷，遇到 2.6.3 允許清單裡
的標點，優先信規則書條文，不要照抄 liblouis oracle 對逗號類標點的攔截行為。

## UEB 規則書 docx 突破 + enough/in（Rule 10.5.2-10.5.4）補完（已完成，2026-09-03）

### docx 突破：解除「PDF 點字圖形抽不出來」的舊限制
使用者把官方 `Rules of Unified English Braille 2024.pdf` 轉成
`document/Rules of Unified English Braille 2024.docx`（未進版控）。確認這份 docx
裡的點字範例雖然顯示用 `SimBraille` 字型，但 `word/document.xml` 底層文字層存的是
**真正的 Unicode 點字字元**（U+2800-U+28FF），不是圖形也不是圖片——整份文件約
24,000 處這類 SimBraille 文字 run，全部可直接讀取比對，直接解掉舊稽核（見上面
「liblouis oracle 對 standing alone 逗號類判斷不可信」段落之前的稽核記錄）反覆
卡住的「PDF 裡的點字方格是內嵌字型/圖形，pdftotext 抽不出實際點位」限制。

用 Node 腳本（正規表達式抽取所有 `<w:t>` 文字，含 Unicode 點字）把 docx 轉成乾淨的
文字＋點字交錯純文字檔，存到 **`document/2024_braille.txt`**（未進版控，跟其他
`document/` 底下的規則書衍生檔一致）。**踩過的坑**：自封閉的 `<w:t xml:space=
"preserve"/>` 標籤如果沒排在正規表達式優先順序最前面，會被誤判成開始標籤、非貪婪
比對一路吃到文件後面很遠的下一個 `</w:t>`，把中間一大段原始 XML 當文字吐出來——
加了「輸出裡不該殘留任何 `<w:...>` 標籤」的完整性檢查才抓到。

之後任何 UEB 稽核都優先用 `document/2024_braille.txt`（grep 規則編號或關鍵字找
`Examples:` 段落），比舊的 `document/2024_nolayout.txt`（無點字，只有條文說明）
更完整可信；10.10-10.13（之前卡住的章節）跟完全沒碰過的 Section 1-9 現在都
具備重新稽核的條件。

### enough/in（10.5.2-10.5.4）Lower sign rule 已實作
用 `document/2024_braille.txt` 找到 10.5.2/10.5.3/10.5.4 全部官方例句，取代原本
「沒有 abcbraille.com/BrailleBlaster 交叉驗證不敢照抄 liblouis oracle」的延後決定。
規則跟 be/his/was/were（10.5.1，`LOWER_WS_SET`）不同：
- **enough（10.5.2）**：仍需 standing alone（跟一般 wordsign 同一套 2.6.3 開括號/
  開引號限制）。
- **in（10.5.3）**：連 standing alone 都不需要（原文「wherever the word it
  represents occurs」），可以出現在複合詞中間（mother-in-law、listen-in）。
- **兩者共同受 10.5.4「lower sign rule」約束**：緊接的標點序列裡只要有一個訊號
  含上位點（字母/數字/右括號/引號）就還能用縮寫；連字號/破折號/其他一般標點視為
  穿透（繼續往後看）；序列一路到空白或字串結尾都沒找到，才退回逐字母/groupsign
  拼寫。

實作在 `braille-translate.htm`：新增 `LOWER_WS_SEQ_SET`（enough/in）+
`_lowerSeqResolves(text, pos)`（只往右/trailing 掃，不看左邊，跟 be/his/was/were
的 2.6.2 前導括號不影響 standing alone 同一個簡化假設）；`ueb-g2-rules.js` 新增
`blocksInAnywhere`（比照既有 `blocksEnAnywhere`）——**這個是連帶抓到的獨立 bug**：
`translateG2Seq`（wordsign 被擋掉後的逐字母/groupsign 拼寫 fallback）對 2 字母的
「in」原本會透過 10.6.8 的 ANYWHERE groupsign 把縮寫寫回同一個點位 ⠔，等於白費
wordsign 那邊擋掉的判斷（`enough`不會踩到，因為`be`已經有`begword`長度限制擋住同類
問題，但`in`的ANYWHERE規則沒有這層限制）；加了 `blocksInAnywhere` 後才真正生效。
另外發現並移除了一個跟新邏輯衝突的舊 post-process 函式 `postProcessEnough`（比對
「下一個 token 是不是標點」就無條件展開，沒有真正做序列判斷，跟新邏輯衝突時
給出錯誤答案，已刪除）。

**已知、故意保留的落差**（都不敢照抄的原因是樣本太少/沒有第二來源）：
- `in/out` 官方範例緊接斜線仍可縮，但 `enough/sufficient` 緊接斜線不可縮——兩者
  表面結構相同、結果相反，推測差異在斜線後第一個字母是否含 dot1，只有這兩個範例
  無法確認，本輪把「緊接斜線」一律當「找不到上位點」處理（enough/sufficient 正確，
  in/out 保守擋掉）。
- 10.5.4「一串多個 lower wordsign 相連、整段都沒有上位點時只擋最後一個」的鏈式
  情形——只往右掃的簡化模型會在「最後一個 wordsign 後面直接接空白」時誤判成獨立
  情形（官方範例 `"That's enough!"–in a firm voice` 的 in 應該退回拼寫，目前輸出
  保留縮寫）。試過往左掃已 push 的 tokens 陣列來補這一刀，但發現 bt 的引號配對
  邏輯會在引號兩側自動插入 `isSpace:true` 的「顯示用」合成空格 token（不是原文
  真的有空格），導致「遇到空白就停」的判斷不可靠，會提前誤判——這個坑本身已經
  超出這輪範圍，加上鏈狀多個 wordsign 相連在真實教材文字裡極罕見，評估後刻意
  收斂、只做往右掃，回退了往左掃的實作。
- `"In any case"` 前面緊接開引號、後面接空白，官方仍要退回拼寫，但
  `Listen!—In this case` 前面緊接破折號、後面也接空白卻保留縮寫——兩個範例
  方向相反，樣本太少無法歸納規則，沒有實作「前導字元」判斷，維持現狀。

用本機 HTTP server（Node 寫的簡易靜態伺服器，非 python，這台機器沒裝）+ Chrome
瀏覽器跑真實 `render()` pipeline 驗證，含 be/his/was/were 既有案例、一般句子
全部無 regression；`reg-bt.html` 446/446 全部通過。

## bt：UEB Section 7（標點）稽核第一輪（進行中，2026-09-03）

### 背景與範圍界定
使用者要求「先把 t2b（bt）完整處理」，比對整份 UEB 2024 規則書。先盤點 bt 實際
功能範圍：**沒有實作** Section 9（排版強調/斜體粗體）、12（古英文）、13（外語
切換）、14（code switching）、15（重音/格律標記）、16（導引點/行模式格式）、
4（重音字母修飾符）——這些不算稽核範圍，是功能缺口不是規則錯誤；Section 11
（技術/數學材料）是 nc 的工作。真正要稽核的剩餘範圍：Section 2、3、6、7、8，
加上 Section 10 沒做完的 10.10-10.13。這輪先做 **Section 7（標點）**。

### 已修好的 4 個真 bug
1. **半形 `?`/`!` 被誤塞進強制空格**：`TERMINAL` 常數（分詞用，句末標點後自動補
   一個空格 token）原本混了全形中文標點（。？！）跟半形英文標點（?!），中文
   本身無空格分詞、句界需要這個補的空格沒問題，但半形英文標點本來就靠原文空白
   分詞，官方範例（`What??? ⠠⠱⠁⠞⠦⠦⠦`、`STOP!! ⠠⠠⠌⠕⠏⠖⠖`、
   `persons?/people? ⠏⠻⠎⠕⠝⠎⠦⠸⠌⠏⠑⠕⠏⠇⠑⠦`）完全不加空格，"What???" 之前會被
   誤譯成三個問號中間各插一個空格，"a?b" 這種無空格黏著寫法也會被拆開。
   → `TERMINAL` 改成只留全形中文標點，半形 ?/! 移除（Rule 7.1.2 只要求「多個
   空格收斂成一個」，沒有要求「原文沒空格也要生一個」）。
2. **問號 grade-1 symbol indicator（Rule 7.5.2-7.5.4）完全沒實作**：問號 ⠦ 跟
   「his」lower wordsign／開雙引號共用同一格，規則書規定問號緊接（可穿過 2.6.2
   允許的開括號/開引號/撇號）空白/連字號/破折號/字串開頭時要加 ⠰ 消歧義，緊接
   字母/數字/其他標點（多數情況）則不用。原本完全沒做，`?-1750`／`(?—1750)`／
   `10:30-?`／`Replace each ? with a letter: ?e??u` 這類寫法全部漏加 ⠰。
   → `getPunct` 新增 `_isStandAloneLeftBoundary(text, pos)`（通用的 2.6.2 左邊界
   檢查函式）+ `Q1_TRANSPARENT`（開括號/開引號/撇號穿透集合），問號命中時前面
   插入 `G1_SYM`。用官方例句全部驗證通過。
3. **單字母 wordsign（WS_LETTERS：b c d e f g h j k l m n p q r s t u v w y）
   完全沒有 standing alone 判斷**：`translateG2Word` 原本只要整個 run 剛好是
   單一字母就無條件加 ⠰，沒檢查是否真的 standing alone（2.6.1：前後都要是空白/
   連字號/破折號，可穿過 2.6.2/2.6.3 允許清單）。官方範例 `?e??u` 裡的 e/u
   緊貼問號、不是 standing alone，不該加 ⠰（官方 `⠰⠦⠑⠦⠦⠥`，e/u 都是純字母），
   但 bt 原本一律加。
   → 沿用同一個 `_isStandAloneLeftBoundary`（左邊界）+ `WS_BREAK_TRAILING`
   （右邊界，跟 alphabetic/strong wordsign 共用）在 `translateWordWithApos`
   裡攔截，不是 standing alone 時繞過 `translateG2Word`、直接輸出純字母。
   `WS_LETTERS` 從 `translateG2Word` 內部 hoist 成模組層級常數以便共用。
4. **多個空格沒有收斂成一個（Rule 7.1.2）**：`Yes,  please.`（兩個空格）原本
   輸出兩個空方，規則書明訂「不管原文幾個空格，點字只留一個」。
   → 分詞主迴圈遇到空白時，消耗掉後面連續的空白字元，只 push 一個空格 token。
   **踩過的坑**：第一版用 Node 腳本直接改字串時漏掉了原本 `continue;` 陳述式，
   導致跳過 `continue` 後用「已經過期」的 `ch`/`i` 落到後面的分支，"a b" 這種
   最基本的單一空格案例反而整個壞掉（`b` 憑空消失、後面字全部對不上）——用
   446 回歸測試沒測出來（reg-bt.html 測的是單詞不是含空格的完整句子），是肉眼
   測 "a b" 才抓到，**改動空白/分詞這類貫穿全文的核心邏輯，一定要測完整句子，
   不能只信單詞層級的回歸測試**。

### 技術筆記：braille-translate.htm 是 CRLF 換行
這次才發現 `braille-translate.htm` 用 `\r\n`（CRLF）換行，不是 `\n`（LF）。
Edit 工具的多行 `old_string` 比對用 LF 假設，直接複製貼上多行字串當
`old_string` 會「找不到字串」失敗（單行 `old_string` 不受影響，因為沒有跨行
比對）。踩到時的排查方法：`node -e "console.log(JSON.stringify(fs.readFileSync(...,'utf8').split('\n')[N]))"` 印出該行 raw 內容，若結尾是 `...\r"` 就是 CRLF。
繞過方法：改用 Node 腳本直接讀檔、用陣列 index（`split('\n')`，每行結尾自帶
`\r`）定位要改的行，而不是用多行字串比對；**改完務必整段重讀確認邏輯完整
（尤其 `continue`/`break` 這類容易被漏掉的陳述式），不能只看 diff 片段**。
CLAUDE.md 本身也是 CRLF，同一個坑之後改這個檔案時也可能踩到。

### 已知但這輪沒修、記錄供下一輪參考
- **Rule 7.2.6 雙連字號當破折號**：`an expression--such as this--set apart`
  官方把 `--` 轉成破折號符號 `⠠⠤`（例：`⠎⠨⠝⠠⠤⠎⠡`），bt 目前原樣輸出兩個獨立
  連字號 `⠤⠤`，沒有這條轉換。
- **`persons?/people?` 的 "people" 不該用 alphabetic wordsign**：官方例句裡
  "people" 前面緊接斜線時是逐字母拼出（`⠏⠑⠕⠏⠇⠑`），不是單格縮寫 `⠏`，但
  bt 目前直接用縮寫——只有這一個範例，還不確定是「斜線讓 people 不算
  standing alone」還是別的原因，也可能跟已經記錄的 in/out vs enough/sufficient
  斜線不對稱屬於同一類問題，需要更多範例才能下手。
- **Section 2.6.4 範例 `section B2 ⠎⠑⠉⠰⠝ ⠠⠃⠰⠔⠼⠃`**：大寫字母後緊接數字
  （`B2`）中間官方插入了 `⠰⠔`，bt 完全沒有這個處理，懷疑是 Section 6
  （Numeric Mode）字母接數字的消歧義規則，這輪沒深入查，留給 Section 6 那輪。
- **`child-safe` 範例多了一個 `⠨⠂`**：2.6.2 範例列表裡 `child-safe` 開頭比
  bt 現在輸出多一個 `⠨⠂`，不確定是這個範例本身用來示範某個 2.6.2 情境的
  合成前綴、還是真的漏規則，需要再查才能判斷，這輪沒動。
- Section 7.6（引號/撇號）已有大量既有實作跟稽核記錄（見前面「轉換判斷修正
  一輪」等段落），這輪沒有重新逐條核對；但 7.6.8/7.6.10 有一個新發現的細節
  沒查證：規則書規定「單獨的引號本身 standing alone 時要讀成 wordsign」
  （開雙引號⠦=his、閉雙引號⠴=was、開單引號⠠⠦=His、閉單引號⠠⠴=Was、
  雙向不定引號⠠⠶=Were），如果 bt 有輸出「單獨一個引號字元」的情境（不常見），
  需要用兩格引號 ⠘⠦/⠘⠴ 避免誤讀，這輪沒有測試 bt 會不會踩到這個情境。

尚未核對的 Section 7 部分：7.2（dash/hyphen 完整規則，只驗證了雙連字號那條
未做）、7.3（ellipsis 間距）、7.4（solidus 換行處理，bt 沒有分行功能，可能
不適用）、7.7（multi-line brackets，bt 沒有這個功能）。

## bt：UEB Section 8（大寫）稽核第一輪——capsphrase 合併邏輯被 liblouis 覆蓋掉的重大 bug（已修，2026-09-03）

### 發現過程
延續 Section 7 稽核往下做 Section 8。`postProcessCaps` 函式裡本來就有處理
「連續 3 個以上全大寫詞要合併成 ⠠⠠⠠...⠠⠄ capsphrase」（UEB 8.5.2-8.5.3）的
`runLen >= 3` 分支，邏輯看起來完整，但實際測 `GIVE MORE THAN ENOUGH`／
`CAUTION: WET PAINT!` 這類官方規則書 4 詞/3 詞範例，輸出完全不對：每個詞各自
保留自己的 ⠠⠠、詞與詞之間還多出詭異的雙重空格、結尾也沒有 ⠠⠄ 終止符——
`postProcessCaps` 的合併結果整個看起來像沒生效過一樣。

### 根因（兩個疊加的 bug）
1. **`applySpanTranslation` 把 `postProcessCaps` 的合併結果蓋掉了**：pipeline
   順序是 `tokenizeWithCustom → postProcessCaps → applySpanTranslation`，
   後者對每個 `isEnglish` token（沒有 `isCustom`/`isNemeth`/`wsNotStandingAlone`
   旗標時）會用「前詞 空格 本詞 空格 後詞」重組字串丟給 liblouis 重新翻譯、
   直接覆蓋 `.braille`。liblouis 這個 span 只看得到緊鄰前後各一詞，看不到
   `postProcessCaps` 才知道的「這整段其實是 4 詞的 capsphrase」，會用自己的
   per-word ⠠⠠ 猜測蓋掉已經合併好的 ⠠⠠⠠ 結果——這正是這個 session 稽核
   enough/in 時就已經踩過、也用同一套「旗標讓 applySpanTranslation 跳過」機制
   修過的模式（見前面 enough/in／wordsign standing alone 段落），這次是同一個
   根因在完全不同的規則（Section 8 大寫）上又發作一次。
   → `postProcessCaps` 在直接改動 `.braille` 的兩個地方（capsphrase 合併、
   `attachEndCaps` 補終止符）都新增 `isCapsProcessed = true` 旗標，
   `applySpanTranslation` 的 skip 條件加上這個旗標。
2. **run 偵測邏輯遇到標點就中斷，但 8.5.2 明訂 passage 可以夾雜標點**：原本
   「找連續全大寫詞」的迴圈只放行空格（`isSpace`）中間插入，遇到任何非空格、
   非全大寫英文的 token（包括純標點如冒號、數字）就直接 `break`，導致
   `CAUTION: WET PAINT!`（冒號隔開 CAUTION 跟 WET）在偵測階段就被切成三段各自
   獨立的 1 詞 run，永遠不會湊到 `runLen >= 3` 的門檻。8.5.2 原文明講「a passage
   is three or more symbols-sequences and **it may include non-alphabetic
   symbols**」——`FOR SALE: 1975 FIREBIRD`、`A.A. (ALAN ALEXANDER) MILNE` 這類
   官方範例本身就是明證。
   → run 偵測迴圈的中斷條件改成只有「真正小寫/混合大小寫的英文字」才會中斷，
   純標點（`!t.isEnglish`）一律放行、繼續往後找下一個全大寫詞。

### 驗證
用 `document/2024_braille.txt` 官方例句（`GIVE MORE THAN ENOUGH`／
`CAUTION: WET PAINT!`／`STOP RUNNING NOW!  It's dangerous.`／
`Please KEEP OFF THE GRASS in this area.`／`FOR SALE: 1975 FIREBIRD`／
`THE BBC AFRICA NEWS`）真瀏覽器 render() 跑過，**6/7 逐字元完全吻合**，一般
非全大寫句子、2 詞以下的 capsword（`NEW YORK`、`PARLIAMENT`）都無 regression，
446 條回歸測試全過。

### 已知但沒修的殘留問題
`He shouted "I WILL NOT!"` 這條官方例句裡，終止符 ⠠⠄ 跟閉引號 ⠴ 的先後順序
跟官方相反：官方是 `...⠝⠖⠠⠄⠴`（終止符在閉引號**之前**，Rule 8.6.2「巢狀
（nested）」原則——閉引號是在 capsphrase **之前**就開的，所以要在 capsphrase
**之後**才閉，終止符要先收），bt 目前輸出 `...⠝⠖⠴⠠⠄`（順序相反）。
`attachEndCaps` 目前的邏輯是「找到 capsphrase 後面第一串連續標點，終止符無條件
加在這串標點的最後面」，沒有處理「這個標點是不是本來就巢狀包住 capsphrase的
閉合符號」這個區分，需要額外判斷閉引號/閉括號是否對應到 capsphrase **開始前**
就已經打開的引號/括號才能正確決定終止符插入位置——範圍比這次的主要 bug 更小、
更少見（大寫段落剛好被引號整個包住的情況），這輪沒有修，記錄供下一輪參考。

Section 8 還有 8.3（重音字母大寫、Section 4 相關）、8.4.3-8.4.4（行末斷字大寫，
bt 沒有分行功能，可能不適用）沒有逐條核對。

## bt：UEB Section 6（數字模式）稽核第一輪（進行中，2026-09-03）

### 已修好的 1 個真 bug：6.5.2 數字後 a-j 字母缺 grade-1 indicator（句點/逗號中介的情況）
Rule 6.5.2：小寫 a-j 緊接在數字/句點/逗號後面時要加 ⠰（跟數字的點位共用同一組
形狀，避免誤讀）。`3b`（數字直接接字母）這種已經有做，但 `4.b`／
`report3.doc`（數字→句點→字母）完全沒加——根因是外層 tokenizer 只有「句點前後
都是數字」才會把句點併入同一個 run（處理小數點），`4.b` 的句點後面是字母，
三者被切成 `4`／`.`／`b` 三個獨立 token，數字模式的狀態沒有跨 token 傳遞。
→ 新增 `_precededByNumericDigit(text, pos)`（往前掃過一個句點/逗號檢查是不是
數字），在 `translateWordWithApos` 算好之後：(1) 單字母 WS_LETTERS 分支跟
wordsign standing alone 判斷並列成另一個獨立成立條件；(2) 一般多字母詞
（如 `report3.doc` 的 `doc`）在呼叫 `translateG2Word` 後檢查結果開頭是否已有
⠰，沒有的話補上——只補一次，不限單字母。用官方例句
`3b`/`3B`/`3m`/`4.2`/`4.b`/`4.B`/`4.m`/`report3.doc`/`report3.xls`/
`houses4lease` 全部驗證通過，446 回歸測試全過。

### 發現但沒修的問題

**a. WS_LETTERS/wordsign standing alone 的邊界掃描是「只看下一個字元」的簡化版，
不是真的掃到底**：Section 7 稽核時建的 `_isStandAloneLeftBoundary`（左邊界）
跟 `WS_BREAK_TRAILING`（右邊界）用的判斷本質上都是「檢查緊鄰的下一個字元是否
在允許清單內」，但官方規則 2.6.3 的原文是「這些符號介於字母跟後面的空白/連字號/
破折號**之間**」——也就是穿過允許的標點後，終點必須真的是空白/連字號/破折號，
不是「隨便一個允許的標點就好，不管它後面接什麼」。這在大多數情況下沒差（允許
標點後面接的通常就是空白，一般句子如此），但遇到「允許標點後面接的不是空白，
是別的內容」時就會誤判：`K.545`（規則書 6.4.1 範例本身）官方是 `⠠⠅⠲⠼⠑⠙⠑⠲`
（K 不需要 ⠰，因為句點後面接的是數字、不是空白，K 其實不算 standing alone），
但 bt 目前判斷會誤加 ⠰（因為只檢查「緊接的是不是允許清單內的句點」就判定
standing alone，沒有再往後確認句點後面是不是真的到空白）。
**這個簡化假設貫穿這個 session 好幾個 fix**（WS_ALPHA_SET/WS_STRONG_SET/
SHORTFORM_SET 的 trailing 判斷、LOWER_WS_SET 的 trailing 判斷、這次的
WS_LETTERS），但目前只在 `K.545` 這種「單一大寫字母+句點+數字」的罕見縮寫/
目錄編號場景抓到反例；範圍太大、風險太高，這輪沒有動手改成真正的「穿透掃描到底」
版本，記錄下來——如果之後陸續發現更多類似的假陽性（standing alone 誤判成立），
要考慮把這幾個 trailing 判斷統一換成掃描到底的版本。

**b. Rule 6.6 numeric space 完全沒實作**：`population: 3 245 000`（用空格分隔的
單一大數字）、電話號碼、日期等，官方規則要求用特殊的「數字空格」符號
（⠐+數字，10 個專屬符號）把整串視為**同一個數字**，而不是遇到空格就當作獨立
數字各自重下數字指示符。bt 目前完全沒有這個功能，`population: 3 245 000` 會
被錯誤拆成三個獨立數字。這是一個**新功能**而不是單純修 bug——規則本身要求
「不確定是不是同一個數字的分隔空格時當一般空格處理」，需要判斷邏輯（純數字
之間、且看起來像同一串大數字/電話/日期格式，才套用），不是機械式字元轉換，
風險/範圍評估後這輪沒有實作，記錄供之後參考。

尚未核對的 Section 6 部分：6.7（日期/時間/幣值格式，部分已對，但跟 6.6 numeric
space 有交集的案例還沒測）、6.8（spaced numeric indicator，⠼ 後面接空白再接
數字，較罕見）、6.9（numeric passage，跟 Section 8 capsphrase 類似的大量數字
段落標記，bt 應該也沒實作）、6.10（跨行數字切分，bt 沒有分行功能，不適用）。

## bt：UEB Section 3（一般符號）稽核抓到的重大 bug——standing alone 右邊界判斷是「擋清單」不是「允許清單」（已修，2026-09-03）

### 背景
Section 3 大部分是符號對照表（©®±貨幣符號等），逐一跟 `document/2024_braille.txt`
比對後發現 bt 現有 `UEB_PUNCT` 擴充表本身是對的（先前已對照 liblouis ctb 原始碼
校正過）。但測 Rule 3.1（ampersand）官方範例 `B&B` 時發現 bt 輸出多了一個不該有
的 grade-1 indicator（`⠰⠠⠃⠈⠯⠠⠃`，官方是 `⠠⠃⠈⠯⠠⠃`，B 前面不該有 ⠰）。

### 根因：`WS_BREAK_TRAILING` 從一開始的設計方向就反了
`WS_BREAK_TRAILING`（Section 7/8 這幾輪陸續建立、給 WS_ALPHA_SET/WS_STRONG_SET/
SHORTFORM_SET/WS_LETTERS 共用的 standing alone 右邊界判斷）原本只是一個「擋
清單」：`new Set(['(', '[', '{', '‘', '“'])`，邏輯是「預設放行，只擋開括號/
開引號」。但 UEB 2.6.3 原文其實是「允許清單」：只有明列的符號（逗號/分號/冒號/
句號/刪節號/驚嘆號/問號/右括號/右引號/不定向引號/撇號）才算 standing alone，
沒列出的symbol 一律不算——`&`（ampersand）沒有在 2.6.3 清單裡，也不是開括號，
用擋清單邏輯會誤判成「還算 standing alone」，導致 `B&B`、`Q&A`、`R&D` 這類
常見縮寫的字母被誤加 ⠰。

這個方向性錯誤在 Section 7/8 稽核時沒被抓到，因為當時測試案例全部集中在 2.6.3
清單內、且是「開括號/開引號 vs 逗號/句號等」這組已知對比的標點，沒有測過完全
不在清單內、也不是開括號的符號（ampersand、星號、波浪號等 Section 3 的一般符號）
——直到這輪核對 Section 3 才第一次測到 `&`，暴露這個方向性問題。

### 修法
把 `WS_BREAK_TRAILING`（擋清單）換成 `STANDALONE_TRAILING_ALLOWED`（允許清單，
2.6.3 條文列出的符號＋連字號/破折號本身——後者是 2.6.1 的終點邊界本身，不是
「允許穿透」的符號，但效果一樣要放行，跟空白同一類），6 處使用點全部從
「有沒有命中擋清單」反轉成「沒命中允許清單」。**enough 的 `_blockOpen` 判斷
故意沒有套用同一份允許清單**，維持原本只查開括號/開引號的窄範圍（新命名
`WS_OPEN_BLOCKING`）——因為 enough 除了基本 standing alone，還有 10.5.4 更
寬鬆的序列規則（`_lowerSeqResolves` 會繼續往後掃描找上位點訊號），如果這裡也
套用完整允許清單反查，會在 `_lowerSeqResolves` 還沒機會解圍前就把「&」這類
符號提前擋掉，跟 10.5.4 的寬鬆用意衝突。

**修的過程中自己踩了一個坑，測試才抓到**：第一版 `STANDALONE_TRAILING_ALLOWED`
忘記把空白字元本身放進允許清單（只顧著加 2.6.3 條文列出的標點），導致
`nextCh` 是空白時「不在允許清單內」被誤判成「不是 standing alone」——這比
原本的 bug 嚴重得多，`That was right!`、`it was enough`、`people like you`、
`Do you have it?` 這種最基本、後面接空白的句子全部被打壞（wordsign 全部退化
成逐字母拼寫）。**教訓：改動 standing alone 這類貫穿全文的核心判斷邏輯，
換套用整個句子測，不能只測改動動機本身的那個案例（`B&B`），基本款案例
（單純接空白）反而最容易因為「以為已經涵蓋、其實漏掉」而漏測。**

### 驗證
用官方範例 `B&B`／`AT&T`／`Q&A`／`R&D` 確認 ⠰ 正確消失；同時完整重測這個
session 這幾輪累積的所有案例（be/his/was/were、enough/in、單字母 wordsign、
capsphrase、一般句子）確認零 regression；446 條回歸測試全過。

## bt：UEB 10.10-10.13 稽核（進行中，2026-09-03）

### 10.11.1（複合詞不可跨界縮寫）/ 10.11.2（h 不發音時照常縮寫）/ 10.11.3（be/con/dis 字首）：抽測全過，確認已正確
用 `document/2024_braille.txt` 抓出官方範例逐條測（compound word 25 個、
aspirated-h 8 個+3 個「But」反例、be/con/dis 字首 7 個），**全部逐字元吻合**，
沒有動手改任何東西——這幾條規則本質是「哪些詞的縮寫要被特定字母組合擋掉」的
詞彙表資料，bt 現有的 `G2_WORD`/blocking predicate 顯然已經是從可靠來源（很可能
liblouis 字典本身）建的，不是需要重新推導的規則邏輯，這輪確認品質已經很好。

### 10.10.10「Lower sign rule」（多個 lower wordsign 相連時只擋最後一個）：找到新證據，釐清但仍未修
這條就是稽核 enough/in（10.5.2-10.5.4）時多次遇到、最後決定不修的「鏈狀多個
lower wordsign 相連」限制的正式規則編號跟完整條文。這輪讀到官方例句
`"Enough!" ⠦⠠⠢⠳⠣⠖⠴` 才第一次抓到一個**修正了之前理解的重要新事實**：
- 條文明文規定「任何引號一律視為只有下位點」（跟 10.5.1 be/his/was/were 用的
  同一句話），這代表 `_lowerSeqResolves` 裡把「閉引號視為解圍訊號」這個判斷
  **理論上是錯的**——引號本身沒有上位點，不該算解圍。
- 但這個判斷當初是靠 `teach-in`（⠦⠞⠂⠡⠤⠔⠴）這個範例反推出來的，這次重新分析
  才發現：`teach-in` 真正解圍的原因其實是 `teach` 本身是有上位點字母的真實
  單字（透過連字號穿透掃描找到），閉引號只是剛好也在後面、從未真正是解圍的
  原因——「引號解圍」是誤歸因，只是巧合對過。
- 兩個要求互相衝突：拿掉「引號解圍」會讓 `"Enough!"` 這種案例修對，但因為
  bt 目前是「只往右掃」的簡化模型看不到 `teach-in` 左邊的 `teach`，會連帶
  讓 `teach-in` 變成誤判（bt 看不到左邊解圍，唯一撐住它的是那個其實不該存在
  的「引號解圍」）。要兩個都對，必須做雙向掃描＋能分辨「這串字母是不是已經
  要被壓成 wordsign、其實不含上位點」——這正是先前評估過、因為 bt 的引號配對
  邏輯會插入合成空格 token 而放棄的雙向掃描（見 enough/in 那段的「已知但沒做」
  記錄）。
- **這輪的判斷**：`teach-in` 這類「連字號複合詞」在真實文字裡遠比
  `"Enough!"` 這種「整句只有一個獨立 wordsign、外層剛好包一層引號」常見，
  兩害相權，維持現狀（保留引號解圍，`teach-in` 對、`"Enough!"` 錯）風險
  比反過來小。沒有修改程式碼，只更新了對這個限制成因的理解，記錄下來。

### 10.10.1-10.10.9（groupsign 選用優先序、發音相關判斷）：確認為詞彙表資料，不深入
這幾條規則本質是「同一個詞有多種可能縮寫時該選哪個」的原則（省空間優先、
strong 優先於 lower、避免扭曲發音等），例字都是個別單字的縮寫選擇結果，
性質跟 G2_WORD 巨表一樣屬於「機械化資料」，不是可以獨立稽核的規則邏輯
——維持先前稽核（Section 10 contractions 第一輪）就定調的判斷：優先度低，
不逐條核對。

### 10.12（Miscellaneous）：規則本身是「原則說明」，非機械可測試規則
10.12.1-10.12.14 大部分是「不確定發音時怎麼辦」「方言/縮寫/暱稱等特殊詞彙
沿用一般規則」這類**原則性、需要人工判斷**的說明文字，沒有新的、獨立於
10.1-10.11 之外的機械規則需要另外實作。10.12.3（電腦資料如 email/URL 內嵌
一般文字要照常用縮寫）先前稽核 bt→nc 銜接時已確認過行為一致（見「nc → bt
銜接工作流程調查」段落）。

### 10.13（Word division，跨行斷字）：確認不適用
整節都是「點字換行時單字/連字號怎麼斷」的規則，bt 沒有逐行分頁/換行功能，
不適用，維持先前稽核就已經做的判斷。

**10.10-10.13 這輪到此告一段落**——已經涵蓋規則書裡跟 bt 現有實作直接相關的
部分；剩下沒動的都是（a）詞彙表資料（10.10.1-10.10.9、G2_WORD 巨表本身）或
（b）需要雙向+dot-pattern-aware 掃描才能完整解決、已經評估過風險大於效益
的深層限制（10.10.10 lower sign rule 鏈式情形）。

## bt：殘留問題處理輪（已完成 2 個真 bug + 釐清 1 個誤會，2026-09-03）

### 修好：WS_ALPHA_SET/WS_STRONG_SET/SHORTFORM_SET 完全沒檢查左邊界（2.6.1/2.6.2）
Section 7.5.1 官方範例 `persons?/people?` 裡的 "people" 緊接在 "/" 後面（不在
2.6.2 允許清單內，只有開括號/開引號/撇號/typeform/大寫指示符才允許穿透），
不算 standing alone，官方逐字母拼出（`⠏⠑⠕⠏⠇⠑`），但 bt 一直都用整詞縮寫
（`⠏`）——根因是 `translateWordWithApos` 對 WS_ALPHA_SET/WS_STRONG_SET/
SHORTFORM_SET 這條路徑從頭到尾**只查右邊界**（`nextCh`），完全沒有查左邊界，
只有 WS_LETTERS（單字母 wordsign，Section 7 稽核時才補上）才有用
`_isStandAloneLeftBoundary` 查左邊界。補上左邊界檢查（跟 WS_LETTERS 共用同一個
函式），`wsNotStandingAlone` 旗標也對應加了獨立的 `_wsAlphaLeadBlocked` 判斷
（不能放進原本被 `!!text[i]` 包住的判斷式，因為左邊界問題不需要「後面有沒有
接東西」這個前提）。用 `persons?/people?` 官方範例 + 一般句子（people like
you、Do you have it? 等）+ 446 回歸測試驗證，零 regression。

### 修好：Rule 8.6.2 巢狀終止符順序
`He shouted "I WILL NOT!"` 官方是 `...⠝⠖⠠⠄⠴`（終止符在閉引號**之前**），
bt 原本輸出 `...⠝⠖⠴⠠⠄`（順序相反）——見上一輪（Section 8 稽核）記錄的殘留
問題。`attachEndCaps` 新增 `_capsFindNestedCloser`：檢查 capsphrase/capsword
開始前緊接的 token 是不是開括號/開引號，如果 caps 結束後的標點串裡有它的
閉合對應，終止符插在那個閉合符號前面（`CAPS_CLOSING_OF` 對照表 + 直引號同
字元比對），不是插在整段標點最後面。用官方範例驗證，446 回歸測試全過。

### 釐清（非 bug）：`child-safe` 的 `⠨⠂` 不是遺漏，是範例本身帶 typeform 指示符
重新對照原文才發現 2.6.2 那組例子（`p ⠨⠆⠰⠏`、`people ⠘⠂⠏`、`enough ⠸⠂⠢`、
`child-safe ⠨⠂⠡⠤⠎⠁⠋⠑`）每一個前面都帶了不同的 typeform symbol indicator
（斜體/粗體/底線），用來示範 2.6.2「開啟的 typeform 指示符可以穿透」這條，
不是單獨的 "child-safe" 該有的輸出。bt 沒有實作 typeform（Section 9，前面已
確認不適用），所以 bt 現在的純輸出（不含 typeform 前綴）本來就是對的，之前
稽核記錄誤把帶 typeform 前綴的範例當成純文字比對，已訂正、不用修任何程式碼。

### 仍未處理（評估後維持現狀）
- Rule 6.6（numeric space，新功能非 bug）
- K.545 型 standing alone 假陽性（左/右邊界判斷都是「只看下一個字元」的簡化
  版，沒有掃到真正的空白/連字號/破折號終點；風險/範圍評估後仍未動手）
- in/out vs enough/sufficient 斜線不對稱（需要第二來源驗證）
- 10.10.10 lower sign rule 鏈式情形（`"Enough!"`），需要雙向+dot-pattern-aware
  掃描才能完整解決，已評估過風險大於效益
- 7.2.6 雙連字號當破折號：規則本身「有疑慮就用雙連字號」，bt 現在的行為
  已經是規則允許的保守預設，不需要額外實作

## bt「ueb自定」模式 + query（UEB-g2-query.html）稽核（已完成主要部分，2026-09-04）

### bt ueb自定 模式：確認繼承這個 session 全部修好的 bug，沒有額外問題
`ueb-custom` 模式跟 `ueb-g2` 模式共用同一套 `tokenizeWithCustom`/
`translateWordWithApos`/`postProcessCaps`/`applySpanTranslation` pipeline，
差別只在 `getActiveG2Tables()` 回傳全表還是 `buildFilteredTables(ucpEnabled())`
篩選過的表。全部 13 個規則類別開啟時，跑這個 session 修過的全部測試案例
（you(、was,、B&B、persons?/people?、4.b、enough/in、capsphrase 等）逐字元
比對，跟 `ueb-g2` 模式輸出完全一致；個別關閉某類別（測了 lw_words）也正確
回退成逐字母拼寫，沒有錯誤或例外。**這輪沒有在 bt 本身抓到新 bug**，但意外
發現一個很重要的方法論教訓，見下面「重大發現」。

### 重大發現：bt 在 `ueb-g2` 模式的「正確」有一部分是 liblouis 補救出來的，不是自己的規則邏輯真的對
`applySpanTranslation` 對每個沒有 skip 旗標的英文 token 都會送去 liblouis 重新
翻譯、覆蓋掉 `translateG2Seq`/`translateG2Word` 自己算出來的結果——這件事在
Section 8 稽核 capsphrase 時就抓到一次（那次是「該保護的沒保護，liblouis 誤蓋
好結果」），這次反過來發現「不該掩蓋的地方也被掩蓋了」：`preamplifier`／
`hideaway` 這類詞，bt 自己的 `blocksEaGroupsign`/`_BLOCKED_EA` 邏輯其實有漏洞
（會誤用 ea groupsign），但 `ueb-g2` 模式測起來完全正常——因為這些 token 沒有
命中任何 skip 旗標，`applySpanTranslation` 照樣把它們送去 liblouis 重新翻譯、
liblouis 給出正確答案、蓋掉了 bt 自己算錯的中間結果。**只有切到 `ueb-custom`
模式（liblouis rescue 一樣會跑，但因為兩者這次剛好都测出同樣的錯誤結果，才
確認 bt 自己的規則引擎跟 query 共用同一批漏洞）或 query.html（完全沒有
liblouis 覆蓋自己輸出的機制，只用來跟自己結果比對顯示徽章）才會真正暴露**。
**How to apply**：以後懷疑 bt 的 `ueb-g2-rules.js` 規則邏輯（不是 standing
alone 那類、而是 groupsign 選用本身）有沒有 bug，`ueb-g2` 模式測不準，要用
`ueb-custom` 模式（`ucpSetAll(true)` 全開）或直接測 query.html 才會看到真正
未經 liblouis 補救的結果。

### 用這個方法論抓到、修好的 4 個真 bug（ueb-g2-rules.js，bt/query 共用）
1. **`_BLOCKED_EA` 沒有整批擋 'prea'**：liblouis ctb 928 行有一條通用 fallback
   規則「沒有專屬字典條目的 prea- 開頭字一律不縮 ea」，只有 preach/
   preachiev(e)/preakness 三個字根有專屬條目、真的縮 ea。原本這裡故意不整批擋
   'prea'（誤以為會連累 preach 系列），但 preach 系列其實是靠自己的專屬
   sufword 規則、優先序更高、根本不會走到這個 predicate——沒整批擋的後果反而是
   `preamplifier`/`preamble` 這類真正該擋的字被漏掉。已修：整批擋 'prea'，
   額外加 `_EA_PREA_UNBLOCKED_PREFIXES=['preach','preakness']` 用前綴比對排除
   兩個字根的所有衍生詞（preacher/preaching/preachable 等），不用窮舉。
2. **`blocksEaGroupsign` 的 `pfxLen` 寫死只有 re-(2)/pre-(3) 兩種前綴長度**：
   一般複合詞（非 re-/pre- 前綴，兩個獨立單字併成一個詞，如 hide+away）字首
   長度不是 2 或 3，寫死的假設會讓 `pos < pfxLen` 判斷式失效、永遠不會擋。改成
   從命中的 pattern 本身推導：`pfxLen = p.indexOf('ea') + 1`，通用適用任何
   長度的字首。同時把 `hidea`（hideaway）加進 `_BLOCKED_EA`。
3. **query 的 gg/bb/cc/ff「讓給 always」lookahead 沒有檢查那個 always 候選會
   不會被複合詞跨界規則擋掉**：`egghead` 在位置 1 的 gg 因為位置 2 湊得出
   "gh"（GA 表裡存在）而被錯誤放棄「讓給」，但 gh 在 egghead 這裡實際上會被
   `blocksCrossCompound` 擋掉（跨 egg/head 複合詞界）——結果變成兩個都沒縮
   （逐字母拼出 g-g）。已修：yield 前先確認那個 always 候選不會被
   `blocksCrossCompound` 擋，會被擋就不讓，繼續用原本的 gg。
4. **`_GH_BLOCKED_STEMS` 缺 'egg'**：這是第 3 點的根本原因之一——
   `blocksCrossCompound('gh','egghead',2)` 本來因為 'egg' 不在停用字根清單裡
   而回傳 false（不擋），egghead 官方規則書 10.10.5「But:」例外清單明確要求
   gg 不要 gh。加入 'egg' 到 `_GH_BLOCKED_STEMS`。

用官方規則書例句（egghead/preamplifier/hideaway 等）+ 既有的 40+ 個
compound/aspirated-h/be-con-dis 測試詞批次重測 + 446 條回歸測試，全數通過、
零 regression。

### query 額外發現、還沒修的問題
- **`dishonest`**：query 顯示 `⠙⠊⠩⠕⠝⠑⠌`（sh+onest，錯），官方是 `⠲⠓⠐⠕⠌`
  （dis 開頭縮寫）。根因追查到 `LL_MATCH_SUF` 有一條 "onest" 條目（大概是為了
  honest 這個字本身），比對時用 `lw.indexOf('onest')` 找到 dishonest 裡的
  "onest" 子字串、把前段 "dish" 遞迴丟回 `translateWord` 當獨立單字翻譯——但
  "dish" 剛好自己就是一個真實單字（餐盤），有自己的整詞字典條目，於是被錯誤
  當成「dish」這個詞翻譯（用 sh 縮寫），而不是「dis-」前綴+"h"。**這是一個
  potentially 系統性的架構風險**：`LL_MATCH_SUF`／LL_MATCH 這類「切一段字根、
  前后段遞迴丟回 translateWord」的機制，只要切出來的片段剛好巧合等於另一個
  真實單字，就可能被那個字的整詞字典條目劫走、失去「這其實是某個更大詞的
  片段」的資訊。這次沒有修（範圍不確定多大、需要先弄清楚 LL_MATCH_SUF 遞迴
  呼叫時要怎麼標記「這是片段不是完整詞」才能安全排除整詞字典查詢，风险較高），
  記錄下來，之後如果還發現類似案例（切出來的片段剛好是別的真實單字）可以
  參考這個根因。
- query 沒有實作 Section 7 一般標點的翻譯（`cat.`/`Hello, world!` 這類句子，
  句號/逗號/驚嘆號都是原樣輸出 ASCII 字元，不轉點字）——**這是設計範圍內的
  限制，不是 bug**：query 的定位是「輸入英文單字，查詢用了哪條縮寫規則」的
  教學工具（UI placeholder 明講），不是像 bt 一樣的全文翻譯工具，句子層級的
  標點翻譯本來就不是它的功能範圍。

## b2t（braille-to-text.html）稽核：往返測試法 + 修好一個真 bug（2026-09-04）

### 方法論：往返測試（round-trip），不是逐條規則比對
b2t 是反方向工具（點字→文字），架構上跟 bt/nc/query 完全不同——它**不是**自己
重新實作一套 UEB 規則引擎，核心解碼直接呼叫 liblouis WASM 的
`_lou_backTranslateString`（`_louBackTranslate`），bt 那幾輪抓到的「規則判斷
邏輯錯誤」類 bug 基本上不適用（b2t 沒有自己的規則判斷邏輯，是 liblouis 的
責任）。b2t 自己的程式碼主要是「中文注音 vs 英文 UEB 分段」跟少數已知 WASM
解碼缺陷的後製修正（如既有的撇號亂碼修正 `_fixBackTranslateMojibake`）。
因此這輪稽核方法改成：**用這個 session 已經驗證過的 bt 正確輸出（英文句子→
確認過的正確點字）反向丟進 b2t，檢查解碼回來的文字跟原文是否一致**——這樣
同時測得到 b2t 自己的分段邏輯、也測得到 liblouis 反向翻譯本身的正確性。

### 修好的真 bug：`_isChineseChunk` 只驗證 tokens[0]，沒驗證整塊
`_segmentLine` 把一行依空格切塊，每一塊呼叫 `_isChineseChunk` 判斷是中文注音
還是英文 UEB，再合併相鄰同類型塊。`_isChineseChunk` 原本（見
`project_braille_to_text` 記憶「中文注音/英文 UEB 誤判」那次修復）已經有做
「往返驗證」防止 McBopomofoWeb 誤讀語法順序不合法的注音——但**只驗證了
`tokens[0]`**，如果一個 chunk 的前幾格剛好湊出一個合法注音音節、後面剩下的
格子轉不出音節而變成裸字串殘留在 `tokens[1]` 之後，完全沒被檢查到。
**具體案例**：英文 "than" 的點字 `⠹⠁⠝`（th-groupsign+a+n），前兩格 `⠹⠁`
剛好是合法注音「ㄧㄣ˙」、往返驗證通過，但最後一格 `⠝` 轉不出音節、變成裸
字串 `"n"` 留在 `tokens[1]`——只查 `tokens[0]` 完全看不出這個殘留，導致
`than` 整個被誤判成中文注音，送進 McBopomofo 解碼引擎，輸出完全錯誤的內容。
這在 `GIVE MORE THAN ENOUGH` 這種真實句子的往返測試中直接現形
（"than" 憑空消失、輸出跑掉）。
→ 修法：檢查迴圈改成 `tokens` 裡**每一個**元素都要是合法 `BopomofoSyllable`
物件（沒有殘留裸字串），且**每一個**都要通過往返驗證，不是只查第一個。
測過 18 個常見英文詞（than/that/this/with/the/and/for/of/was/were/more/
some/time/name/here/there/where/one）確認只有 than 誤判、其餉都正常，這輪
修完後 than 正確判回英文，單音節/多音節真正的中文注音（用 mcbopomofo 自己的
編碼函式反向產生的測試資料）都還是正確判成中文，沒有 regression。

### 發現但沒修：liblouis WASM 反向翻譯把「enough + capsphrase 終止符」讀成 "en"
`_louBackTranslate('en-ueb-g2.ctb', '⠢⠠⠄')` 回傳 `"en"`（應為 `"enough"`；
`⠢` 單獨測是對的，加上終止符 `⠠⠄` 之後才錯）——這是 liblouis WASM build
本身反向翻譯表的缺陷（跟已知的撇號 mojibake 問題同一個性質，repo 位元組層級
原封不動載入的問題，不是 b2t 分段邏輯造成的）。**沒有修**：跟 mojibake 那次
不同，mojibake 是「固定、任何情況下都錯」的位元組序列，可以安全地做無條件
字串取代；但這裡 "en" 是非常常見、合法的一般輸出（en 本身也是合法縮寫/單字
片段），沒辦法用簡單的字串取代規則安全修正，需要知道「這個 en 是不是剛好對應
輸入點字裡的 enough+終止符」這種輸入感知的修正，風險/複雜度較高，這輪沒有
動手，記錄下來供之後參考。只在 capsphrase/capsword 結尾剛好是 enough 時才會
踩到，範圍窄。

用這個 session 稽核 bt 時建立的完整驗證句子批次（含大寫段落、撇號、標點、
wordsign、B&B 等）做往返測試，除了上述兩個發現以外全部正確，沒有 b2t 專屬
的其他新問題。
