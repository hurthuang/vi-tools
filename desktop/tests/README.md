# 桌面版自動測試

每次改動後跑一次，確認沒有壞掉、沒有當掉。

```powershell
cd desktop
dotnet build
node tests/run.mjs                                   # 測開發版（bin\Debug）
node tests/run.mjs --exe dist\ViTools\ViTools.exe    # 測可攜版（先 dotnet publish -p:PublishProfile=Portable）
node tests/run.mjs --only doc                        # 只跑檔名或名稱含 doc 的測試
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
| `cli-tts.mjs` | `ViTools.exe --tts-test` 直接合成 WAV／MP3，不開視窗 |
| `browser.mjs` | 一般瀏覽器（無視窗 Edge + 本機網頁伺服器）開網頁版：`desktop-audio.js` 不加面板；數學點字報讀區塊與存報讀檔、文件整理三種朗讀模式都能用，但沒有匯出按鈕；網頁照常轉換、相關檔案沒有錯誤，不開 app |
| `web-root.mjs` | 網頁來源：開發版用 vi-tools 根目錄，可攜版用內附 `web\` |
| `api.mjs` | `window.vitoolsDesktop`：每個頁面都有、版本號、`getVoices`、`previewAudio`（含錯誤）、同時多個請求、`exportAudio` 取消 |
| `b2t-speech.mjs` | 點字轉文字的報讀區塊：朗讀內容切換、點字讀音（同音字、英文反向翻譯、字典沒有的音節）、自動更新、點一行朗讀 |
| `bt-speech.mjs` | 文字轉點字的報讀區塊：點字讀音（多音字兩個「行」念不同字、UEB 二級縮寫反向翻譯、自動換行處的詞間空格、Nemeth 念「數學」）、點一行朗讀 |
| `doc.mjs` | 文件整理（網頁本身的功能）：三種朗讀模式、起始句保留、匯出內容與語音對應、轉換中按播放、單個 `$`、沒有算式 |
| `math.mjs` | 數學點字的報讀區塊：舊面板已移除、Alt+Shift+A、轉報讀文字、朗讀與停止、逐行清單（點第 2 行從那行念、反白、Esc、方向鍵）、存報讀檔、自動更新、匯出 MP3、點字→數學方向、單個 `$`（和轉點字一致） |
| `offline.mjs` | 模擬斷線：數學點字頁的 MathJax 預覽、報讀區塊（含 `\ratio`）、文件整理開 PDF（pdf.js 與 worker）與 DOCX（JSZip）、數學式模式都用內附檔案，頁面沒有錯誤 |
| `online.mjs` | 線上優先（需要網路）：載入線上網頁、那裡也能用桌面功能、Ctrl+Shift+O 與離線版互換（保留位置、標題加「（離線版）」） |
| `update.mjs` | 檢查更新（本機假伺服器模擬 Release 清單）：啟動自動檢查有新版會詢問（略過網頁版標籤、預先發行、草稿）、Ctrl+Shift+U 已是最新版／檢查失敗／有新版 |
| `online-fallback.mjs` | 線上網頁載不到時自動改用內附；這時 Ctrl+Shift+O 提示連不上並維持離線版 |
| `voice-warning.mjs` | 模擬沒有臺灣中文語音，面板與文件整理顯示安裝方法 |

新增測試：在 `cases/` 放一個 `export default { name, needsApp, run(ctx) }` 的檔案，`ctx` 內有 `cdp`（`ev()` 在首頁執行運算式）、`check()`、`win()`／`doc()`（首頁分頁 iframe）、`waitFor()`、`saveDialog()`、`outPath()`、`audioKind()` 等，見 `lib.mjs`。
