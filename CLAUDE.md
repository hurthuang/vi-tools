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

### 已知但延後處理：enough / in（Rule 10.5.2-10.5.4）
`enough`/`in` 的官方規則結構跟 be/his/was/were 不同——是更寬鬆的「Lower sign rule」
（10.5.4）：只要「整段鄰接的下位點標點序列裡有一個上位點訊號」就仍可用縮寫，
不是單純看緊鄰的下一個字元。liblouis oracle 對 `enough,` 給出的退回拼字結果
（多出一個跟 e-n-ou-gh 拼法對不起來的 dots126）看起來像是這個 repo 用的 WASM
build 另一個獨立缺陷（不是規則本身的行為），沒有 abcbraille.com/BrailleBlaster
交叉驗證前不敢照抄這個 oracle 的行為直接實作，所以這輪沒有動 `enough`/`in`——
下次要處理時，先用真實工具（abcbraille.com/BrailleBlaster）測 `enough,`／
`enough.`／`in,`／`in.` 等案例拿到可信 ground truth，再決定要不要／怎麼實作
10.5.4 的寬鬆邏輯。
