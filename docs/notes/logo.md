# logo 與圖示

使用者的網站 logo（「視覺障礙輔助科技筆記本」，線圈筆記本加點字與 VI tech，原檔 E:\Project\Logo.svg，Inkscape 700×600）。2026-10-26 起用在網頁和桌面版。

## 檔案

| 檔案 | 內容 |
|---|---|
| `logo.svg` | 原圖裁成正方形（viewBox 50 0 600 600），筆記本內部填白，深色背景也看得到；32 像素以上用這個，首頁標題旁也是它 |
| `logo-small.svg` | 小尺寸版（16～24 像素）：線條加粗、線圈 5 個、中間只放 VI（使用者在 A／B／C 三種裡選 A） |
| `favicon.ico` | 網頁分頁圖示：16、24（小尺寸版）＋ 32、48、64 |
| `apple-touch-icon.png` | 手機加到主畫面：180，白底 |
| `desktop/app.ico` | 桌面版 exe：16、20、24（小尺寸版）＋ 32、40、48、64、256；`ViTools.csproj` 的 `ApplicationIcon`，視窗用 `Icon.ExtractAssociatedIcon` 取同一個 |
| `tools/build-icons.mjs` | 改了 svg 之後重產上面三個檔：`node tools/build-icons.mjs`（用 Edge headless 畫，不用另外裝套件） |

## 頁面

- 每個 html 的 `<title>` 後面有兩行 `<link rel="icon" href="favicon.ico" sizes="16x16 24x24 32x32 48x48 64x64">`、`<link rel="apple-touch-icon" …>`；子資料夾（music/、abacus/）用 `../`。新增頁面時一起加。
- `tools/build-books.mjs` 的樣板也有，重產教材頁不會掉。
- 不宣告 SVG favicon：瀏覽器會拿 logo.svg 縮到 16 像素，字和點字會糊掉。
- 首頁標題 `<img class="home-logo" src="logo.svg" alt="">`：裝飾用，報讀軟體略過。
- 桌面版打包加了根目錄的 `*.svg`（ViTools.csproj 與 make-manifest.mjs 一起改）；favicon、apple-touch-icon 桌面版用不到，不打包。

## 桌面版

exe 圖示包在執行檔裡，網頁自動更新換不到，要發新版（0.4.1 起）才會換。
