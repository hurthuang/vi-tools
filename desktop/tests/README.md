# 桌面版自動測試

每次改動後跑一次，確認沒有壞掉、沒有當掉。

```powershell
cd desktop
dotnet build
node tests/run.mjs                                   # 測開發版（bin\Debug）
node tests/run.mjs --exe dist\ViTools\ViTools.exe    # 測可攜版（先 dotnet publish -p:PublishProfile=Portable）
node tests/run.mjs --only doc                        # 只跑檔名或名稱含 doc 的測試
node tests/run.mjs --only math,bilingual              # 多個關鍵字用逗號分隔
```

需要 Node.js 22 以上（用內建的 `fetch`、`WebSocket`）。測試期間 app 視窗會自己開關，**不要操作滑鼠鍵盤**，存檔視窗由測試自動填寫。

## 做法

- 用 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` 開 app，透過 CDP 操作頁面
- 每個測試用新的 WebView2 設定資料夾（環境變數 `VITOOLS_USER_DATA`），**不會動到使用者平常的設定與網頁本機資料**
- 預設 `VITOOLS_UPDATE_URL=none` 不自動檢查更新（不連真正的 GitHub）；`update.mjs` 改指向本機假伺服器
- 預設 `VITOOLS_WEB=local` 用內附網頁，結果不受線上網頁內容影響；`VITOOLS_SIMULATE_OFFLINE=1` 模擬斷線（除了本機網頁與內附檔案，對外請求都失敗）。這兩個環境變數只給測試用
- 視窗標題與訊息視窗網頁裡看不到，用 PowerShell 讀（`appTitle()`、`closeAppMessageBox()`）
- 存檔視窗用 `save-dialog.ps1`（Win32 API 找「匯出音檔」視窗、填檔名、按存檔），以 `powershell -Command` 執行，不需要改執行原則
- 輸出音檔放在 `%TEMP%\vitools-tests\`
- 每個需要 app 的測試結束時會檢查 app 還在執行（沒有當掉），並列出頁面丟出的錯誤

## 測試項目（`cases/`）

| 檔案 | 內容 |
|---|---|
| `findmath.mjs` | `findMath()` 算式判斷規則（網頁 `math-speech.js`：單個 `$` 的 Pandoc 規則、金額、`\$`、`$$`、數學點字頁的 `MATH_RE`），不開 app |
| `langseg.mjs` | `lang-segments.js` 中英切段規則（兩個以上英文單字才切、縮寫、夾數字、標點跟著前一段、撇號），不開 app |
| `cli-tts.mjs` | `ViTools.exe --tts-test` 直接合成 WAV／MP3，不開視窗 |
| `browser.mjs` | 一般瀏覽器（無視窗 Edge + 本機網頁伺服器）開網頁版：`desktop-audio.js` 不加面板；數學點字報讀區塊與存報讀檔、文件整理三種朗讀模式都能用，但沒有匯出按鈕；網頁照常轉換、相關檔案沒有錯誤，不開 app |
| `b2t-convert.mjs` | 點字轉文字主轉換（無視窗 Edge，不開 app）：reg-b2t.html 回歸測試全部通過；「給」不消失、ㄦ 接在音節後（偶爾、嬰兒、愛爾蘭）不被判成英文、唷／崖、輕聲（時候）、一聲音節（思議）、詞間空格、英文點字仍是英文 |
| `web-root.mjs` | 網頁來源：開發版用 vi-tools 根目錄，可攜版用內附 `web\` |
| `api.mjs` | `window.vitoolsDesktop`：每個頁面都有、版本號、`getVoices`、`previewAudio`（含錯誤）、同時多個請求、`exportAudio` 取消 |
| `b2t-speech.mjs` | 點字轉文字的報讀區塊：朗讀內容切換、點字讀音（同音字、英文反向翻譯、字典沒有的音節）、自動更新、點一行朗讀 |
| `bt-speech.mjs` | 文字轉點字的報讀區塊：點字讀音（多音字兩個「行」念不同字、UEB 二級縮寫反向翻譯、自動換行處的詞間空格、Nemeth 念「數學」）、點一行朗讀 |
| `music.mjs` | 點字樂譜（`music/`），模擬斷線：abcjs 與鋼琴音色用內附、五線譜畫出、按播放能播、全曲報讀有文字與「匯出音檔」、六點輸入用工具集的浮動面板 |
| `tactile.mjs` | 觸摸圖（`tactile.html`），模擬斷線：中文點字表（`table/zh-tw.ctb`）載入、標題轉點字、六點輸入面板、Letter 紙張、空白頁畫矩形、匯出 .prn 的標頭（寬高、檢查碼）與內容、開啟 .docx（JSZip 用內附、列出圖片、提示 Word 圖案讀不到） |
| `doc.mjs` | 文件整理（網頁本身的功能）：三種朗讀模式、起始句保留、匯出內容與語音對應、轉換中按播放、單個 `$`、沒有算式 |
| `math.mjs` | 數學點字的報讀區塊：舊面板已移除、Alt+Shift+A、轉報讀文字、朗讀與停止、逐行清單（點第 2 行從那行念、反白、Esc、方向鍵）、存報讀檔、自動更新、匯出 MP3、點字→數學方向、單個 `$`（和轉點字一致） |
| `offline.mjs` | 模擬斷線：數學點字頁的 MathJax 預覽、報讀區塊（含 `\ratio`）、文件整理開 PDF（pdf.js 與 worker）與 DOCX（JSZip）、數學式模式都用內附檔案，頁面沒有錯誤 |
| `online.mjs` | 線上優先（需要網路）：載入線上網頁、那裡也能用桌面功能、Ctrl+Shift+O 與離線版互換（保留位置、標題加「（離線版）」） |
| `update.mjs` | 檢查更新（本機假伺服器模擬 Release 清單）：啟動自動檢查有新版會詢問（略過網頁版標籤、預先發行、草稿）、Ctrl+Shift+U 已是最新版／檢查失敗／有新版；視窗標題帶版本號 |
| `autoupdate.mjs` | 自動更新（只測可攜版，複製到暫存資料夾再測）：只下載有變動的檔案、執行中的 ViTools.exe 改名後換新、核對失敗不覆蓋並改請使用者開下載頁、沒有新版時依 web-latest 更新離線網頁（可新增檔案）、minApp 太新時不更新 |
| `manifest.mjs` | 自動更新的檔案清單：repo 依規則挑出的檔案和可攜版一致（只測可攜版），不開 app |
| `online-fallback.mjs` | 線上網頁載不到時自動改用內附；這時 Ctrl+Shift+O 提示連不上並維持離線版 |
| `segments.mjs` | 原生層分段匯出：`exportAudio` 帶 `segments` 時各段用各自的 Windows 語音、三種停頓的長度差異、舊格式（沒有 segments）照常 |
| `bilingual.mjs` | 中英分語音：語音設定介面（預設自動、桌面版有停頓選項）、播放時英文段用英文語音、切換條件、不切換、各頁設定同步、匯出送出 segments 與停頓；文件整理的播放、位置標示、停止、匯出 |
| `voice-warning.mjs` | 模擬沒有臺灣中文語音，面板與文件整理顯示安裝方法 |

新增測試：在 `cases/` 放一個 `export default { name, needsApp, run(ctx) }` 的檔案，`ctx` 內有 `cdp`（`ev()` 在首頁執行運算式）、`check()`、`win()`／`doc()`（首頁分頁 iframe）、`waitFor()`、`saveDialog()`、`outPath()`、`audioKind()` 等，見 `lib.mjs`。
