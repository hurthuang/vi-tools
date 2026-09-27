# 視障輔助工具集 桌面版（原型）

以 WebView2 包裝 vi-tools（本專案的上層資料夾）的網頁工具，並加上網頁版做不到的「匯出音檔」（Windows OneCore 語音，含臺灣中文 Hanhan / Yating / Zhiwei）。

## 建置與執行

```powershell
dotnet build   # 需要 .NET 10 SDK
.\bin\Debug\net10.0-windows10.0.19041.0\ViTools.exe
```

### 可攜版（給別台電腦用）

```powershell
dotnet publish -p:PublishProfile=Portable
```

產生 `dist\ViTools\` 與 `dist\ViTools-portable.zip`（約 56MB），解壓縮後執行 `ViTools.exe` 即可，不用安裝 .NET：
- `ViTools.exe`：單一執行檔，內含 .NET 10 執行環境
- `web\`：從上層 vi-tools 複製執行時用得到的檔案（`*.html`、`*.htm`、`*.js`、`*.json`、`*.TTF`、`table\`，排除 `reg-*` 測試頁），不含 `document\` 等資料
- `desktop-assets\cdn\`：網頁從 CDN 載入的 pdf.js 3.11.174、JSZip 3.10.1、MathJax 3.2.2（網址一一對應，app 一律改用這份，離線也能用）

執行需求：
- Windows 10（1809 以上）或 11，x64
- Microsoft Edge WebView2 Runtime（Windows 10/11 通常已內建；缺少時程式會提示並開啟下載頁）
- Windows 臺灣中文語音（缺少時面板與文件整理會顯示安裝方法：設定 → 時間與語言 → 語音 → 新增語音 → 中文(台灣)）
- 網路：有網路時用線上網頁（網頁的修正與新功能直接拿到）；沒有網路也能用全部功能（改用內附網頁與內附 CDN 函式庫）

### 網頁來源：線上優先，離線用內附

- 啟動時試連線上網頁 https://hurthuang.github.io/vi-tools/ （最多 3 秒），連得上就用線上版；連不上用內附網頁（`https://vitools.local/` 對應到網頁資料夾），視窗標題加「（離線版）」
- 線上網頁載入失敗（斷線、網站出錯）時自動改用內附的同一頁
- **Ctrl+Shift+O**：線上版與離線版互換，停在同一頁；連不上線上網頁時提示並維持離線版
- `ViTools.exe --offline`：不試線上網頁，直接用內附的
- 只有本工具的網頁（`vitools.local` 與線上 `hurthuang.github.io/vi-tools/`）能留在 app 裡、使用桌面功能；其他連結用預設瀏覽器開
- 線上版與離線版在瀏覽器眼中是不同網站，設定與本機資料（例如語音、速度、數學點字頁的上次輸入）各存一份
- **發佈順序**：線上網頁是 GitHub 上目前推送的版本。網頁功能改了要先推上去，app 的線上版才會有；還沒推送前，線上版看不到新功能（可按 Ctrl+Shift+O 或用 `--offline` 改用內附版）
- CDN 函式庫：網頁向 cdnjs／jsDelivr 要 pdf.js、JSZip、MathJax 時，app 改給 `desktop-assets\cdn\` 的同一份檔案（內容已確認和 CDN 相同）；沒內附的照常走網路

### 檢查更新與發佈

- app 檢查 GitHub 上 vi-tools 的 Release，只看標籤 `desktop-v*`（略過草稿、預先發行與網頁版的標籤），和 `ViTools.csproj` 的 `<Version>` 比較
  - 啟動後在背景檢查，一天最多一次，沒有新版不出聲；**Ctrl+Shift+U** 手動檢查，已是最新版或檢查失敗也會告知
  - 有新版時詢問是否開啟下載頁面（解壓縮覆蓋原本資料夾即可更新）
- **發佈新版**：
  1. 網頁的修改先推送上線（app 優先載入線上網頁）
  2. 把 `ViTools.csproj` 的 `<Version>` 改成新版本號（例如 0.2.0），commit 並推送
  3. 推送標籤 `desktop-v0.2.0`：GitHub Actions（`../.github/workflows/desktop-release.yml`）自動建立可攜版，上傳成 Release 的 `ViTools-0.2.0-portable.zip`；標籤和 `<Version>` 不同時會中止
- 只想確認打包流程沒壞（例如升級 Actions 元件後）：在 GitHub 的 Actions 頁面對「桌面版發佈」按 Run workflow，只建置、不發佈（`gh workflow run desktop-release.yml`）
- 程式沒有數位簽章，下載後第一次執行 Windows SmartScreen 會警告，要按「其他資訊」→「仍要執行」

網頁資料夾搜尋順序：`--web <資料夾>` 參數 → 執行檔旁的 `web\` → 往上層找含 `braille-translate.htm` 的資料夾（開發時就是 vi-tools 根目錄）。

## 使用

**文字轉點字／點字轉文字**：網頁本身的「🔊 報讀」區塊（在輸入／輸出區下方，預設收合），瀏覽器版也有，桌面版多「匯出音檔」（這兩頁因此不再加右下角浮動面板）。「朗讀內容」選單：
- 文字轉點字：「原文」或「點字讀音（校對用）」；點字轉文字：「轉出的文字」或「點字讀音（校對用）」
- **點字讀音**：照點字實際代表的音念，用耳朵校對點字
  - 注音點字：每個音節換成念法固定的同音常用字（`../brl-reading.js` + `../brl-reading-data.js`，資料來自 NVDA-DictSwitcher 1.5.0 起的 `brl_dict.dic`，字都用 Windows 臺灣中文語音 Hanhan 確認過念法）；沒有對應字的音節念注音加聲調（例：「ㄌㄥ第一聲」），並列在狀態列（這類音節常是點字打錯）。例：「銀行」的 ㄏㄤˊ 念「航」、「行走」的 ㄒㄧㄥˊ 念「型」，多音字選錯一聽就知道
  - 英文：用目前的英文點字表（liblouis）反向翻譯回英文再念，可以抓出縮寫用錯
  - 數學（Nemeth）：先念「數學」帶過
  - 資料檔用 `node ../tools/build-brl-reading.mjs <brl_dict.dic>` 重新產生；改字典前後用 `node ../tools/sim-brl-dict.mjs <現行版.dic> <修正版.dic>` 模擬 DictSwitcher 逐條取代的結果（每個音節單獨、兩個音節相連），`../tools/hanhan-phonemes.ps1` 取得 Hanhan 實際的念法
- 逐行清單、存報讀檔、Alt+Shift+A 同數學點字頁

**文件整理**：網頁本身（`../pdf-to-accessible.html`）的功能，瀏覽器版也有；桌面版在「朗讀」分頁的播放控制列多一顆「💾 匯出音檔…」（或 Alt+Shift+A），缺臺灣中文語音時顯示提示：
- 沿用該頁選好的語音、速度、音量（網頁語音名稱對應到同名的 Windows 語音，找不到時改用臺灣中文語音並提示）
- 匯出範圍和「播放」一致：點過某一句就從該句到結尾，否則全文
- 檔名預設用開啟的檔案名稱
- 文件裡有 `\( \)`、`\[ \]`、`$$ $$` 或單個 `$ $` 算式時，多一組「朗讀內容」切換（記住上次的選擇；沒有算式時隱藏）：
  - 單個 `$ $` 照 Pandoc 規則判斷，避免把金額當算式：開頭 `$` 後面不是空白、結尾 `$` 前面不是空白且後面不接數字、不跨行；`\$` 是錢字號本身。（數學點字頁則照它自己轉點字的規則，單個 `$` 不做金額判斷）
  - **報讀文字**（預設）：朗讀區顯示、播放、匯出都用 MathCAT 報讀文字（同數學點字頁）
  - **數學式（聽報讀）**：朗讀區顯示渲染後的數學式，播放、匯出念報讀文字
  - **原文**：照 LaTeX 原文顯示和念，可用來校對原始碼
  - 切換時先停止播放，保留目前的起始句；切句時避開算式內部（如 `n!`），三種模式的句子一一對應

**數學點字**：網頁本身的「🔊 報讀」區塊（`../speech-block.js` + `../math-speech.js`，「數學→點字」「點字→數學」各一個，預設收合；Alt+Shift+A 展開並移到「朗讀」）。瀏覽器版也有，桌面版多「匯出音檔」：
- 算式經 MathJax 轉 MathML、再由 [MathCAT](https://github.com/daisy/MathCAT) 轉成中文報讀文字（例：`x^2-5x+6=0` →「x 平方 減 5 x 加 6; 等於 0」），其餘中文照舊；認算式沿用頁面轉點字的 `MATH_RE`（`\( \)` 與單個 `$ $`），逐行處理，和轉點字一致
- 報讀文字一行一個項目：點一行（或方向鍵移到那行按 Enter／空白鍵）從那行念到結尾，念到的行反白，Esc 停止；方向鍵只移動、不自動開始念（避免和 NVDA 同時出聲）
- 顯示算式數量和無法轉換的算式（LaTeX 有誤時念成「無法轉換的算式」）；展開時輸入改了會自動更新
- 朗讀用瀏覽器內建語音；「📄 存報讀檔」存完整報讀文字（.txt，瀏覽器下載）；匯出音檔用同名的 Windows 語音，也是全文；缺臺灣中文語音時顯示提示
- MathCAT（`../mathcat/`，約 3.5MB）第一次展開才載入；頁面的 MathJax 從 CDN 載入，桌面版離線載不到時改用內附的 MathJax 3.2.2

**中英夾雜分語音**（`../voice-settings.js` + `../lang-segments.js`，瀏覽器版也有）：報讀區塊的「語音設定」、文件整理朗讀分頁的「中英語音設定」（都預設收合），設定各頁共用、記在瀏覽器：
- **英文語音**：「自動」（預設；有英文語音就用，名稱寫在括號裡，沒有時寫「這台電腦沒有英文語音」並照舊全用中文）、「不切換」或指定某個英文語音
- **切換條件**：「兩個以上英文單字」（預設；單獨的縮寫如 PDF、NVDA 仍用中文語音念）或「每個英文字」；數字、標點跟著前一段
- 播放時每段各用各的語音（多段 utterance，朗讀位置標示照常）；匯出時每段各用同名的 Windows 語音合成再接起來
- **匯出時換語音的停頓**（只有桌面版顯示）：「縮短（建議）」把兩段交界的靜音縮成 0.1 秒（句末標點後 0.35 秒）、「保留原本」、「最短」（0.05 秒）
- 英文語音要另外安裝：設定 → 時間與語言 → 語音 → 新增語音 → English (United States)
- 桌面版需要 `vitoolsDesktop.features` 含 `'segments'`；舊版 app 沒有時照原本整段單一語音匯出

存檔視窗可選 MP3（單聲道 64kbps，約每小時 28MB）或 WAV，會記住上次選的格式。

測試語音合成：`ViTools.exe --tts-test out.wav`（或 `out.mp3`）

## 給網頁用的介面：`window.vitoolsDesktop`

桌面版在每個頁面（含首頁分頁的 iframe）提供 `window.vitoolsDesktop`，網頁偵測到它才顯示桌面專用介面；在瀏覽器裡沒有這個物件，網頁行為不變。iframe 裡是在 DOMContentLoaded 才注入，網頁程式可能先跑，所以要等 `vitoolsdesktop-ready` 事件：

```js
function onDesktop(fn) {
  if (window.vitoolsDesktop) fn(window.vitoolsDesktop);
  else window.addEventListener('vitoolsdesktop-ready', () => fn(window.vitoolsDesktop), { once: true });
}
```

| 成員 | 說明 |
|---|---|
| `apiVersion` | 目前 `1`。只有不相容的改變才加 1；新增功能不加，網頁用 `'功能名' in vitoolsDesktop` 判斷 |
| `appVersion` | app 版本（`ViTools.csproj` 的 `<Version>`），例如 `'0.1.0'` |
| `features` | 新增功能的清單，網頁用 `vitoolsDesktop.features?.includes('segments')` 判斷。目前：`'segments'`（分段匯出） |
| `getVoices()` | → `[{ id, name, lang, isDefault }]`，Windows 內建語音 |
| `previewAudio({ text, voiceId, rate, volume })` | 合成前 300 字 → WAV 的 base64（`new Audio('data:audio/wav;base64,' + 結果)`）。播放要在使用者操作之後，否則瀏覽器會擋 |
| `exportAudio({ text, voiceId, rate, volume, fileName }, onProgress)` | 跳出存檔視窗（MP3／WAV）→ `{ saved: true, path }` 或 `{ saved: false }`（取消）。有 `segments: [{ text, voiceId }]` 時忽略 `text`、`voiceId`，逐段用各自的語音合成再接起來，`pause`（`natural`／`original`／`min`）決定段落交界的靜音長度。`onProgress({ stage: 'synthesize', done, total })`、`onProgress({ stage: 'encode' })` |

錯誤（例如沒有文字）以 Promise reject 回報。原生層只接受本工具網頁（`https://vitools.local/`、`https://hurthuang.github.io/vi-tools/`）送來的訊息。

## 架構

| 檔案 | 說明 |
|---|---|
| `MainForm.cs` | WebView2 外殼：線上優先／離線內附（`https://vitools.local/` 對應到網頁資料夾）、攔截 CDN 改用內附、外部連結改用瀏覽器開、處理網頁訊息 |
| `TtsService.cs` | WinRT `SpeechSynthesizer`，長文依標點分段合成後接成單一 WAV；`MediaTranscoder` 轉 MP3 |
| `desktop-assets/cdn/` | CDN 函式庫的內附版本，路徑同網址：`cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/`（Apache 2.0）、`cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/`（MIT／GPLv3）、`cdn.jsdelivr.net/npm/mathjax@3/es5/`（3.2.2，Apache 2.0；三個合併檔 tex-chtml、tex-mml-chtml、tex-svg 加上 a11y、adaptors、input、output、ui，不含 3.8MB 的 sre 語音引擎）；取自 npm 套件，各資料夾附授權檔 |
| `bridge.js` | 注入每個頁面（含首頁分頁的 iframe），提供 `window.vitoolsDesktop`（介面都在網頁），經由最上層頁面的 `chrome.webview` 和原生層溝通；首頁的 Alt+Shift+A 轉給目前分頁 |
| `../desktop-audio.js`（網頁） | 桌面版共用小工具（`onDesktop`、缺語音提示文字、匯出進度文字）；原本的右下角浮動面板已由各頁的報讀區塊取代；網頁先上線、再發佈需要它的 app 版本 |
| `../speech-block.js`、`../math-speech.js`、`../mathcat/`、`../brl-reading*.js`（網頁） | 「🔊 報讀」區塊（數學點字、文字轉點字、點字轉文字）、算式報讀（數學點字、文件整理）、點字讀音（文字轉點字、點字轉文字），瀏覽器與桌面版都能用。MathCAT 取自 [mathcat-lab](https://github.com/hurthuang/mathcat-lab) 的 `mathcat-wasm/`，原始碼見該專案 `rust-src/` |

## 待辦

- **刪除舊資料夾 `E:\Project\vi-desktop`**：桌面版搬進 vi-tools 的 `desktop/` 之前的副本。等搬移後的所有步驟都確認沒問題、commit 之後才刪。
- **數學點字頁「整理」按鈕的包覆記號問題**（上層 `nemeth_converter.html` 數學編輯器的 `convertAllDelimiters()`，屬於網頁部分，非桌面版）：遇到 `$` 就切換進出算式，沒有判斷上下文：
  - 金額會被誤判：「$100 和 $200」→ `\(100 和 \)200`
  - `$$x$$` 被拆成 `\(\)x\(\)`，獨立算式壞掉
  - `\[ \]` 被轉成行內的 `\( \)`，失去獨立算式
  - 沒處理 `\$`（錢字號本身）
  - 可參考桌面版 `bridge.js` 的 `findMath()`（Pandoc 規則）。這段程式碼源自外部「通用數學文件編輯器」，授權不明，修改前留意
