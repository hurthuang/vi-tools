# 站內搜尋（search.html）

一次搜 vi-tools 的工具、說明頁各段，以及筆記本「視覺障礙輔助科技筆記本」（https://class.kh.edu.tw/19061，教育局的班級網站平台）的文章。首頁第一排「說明」後面的「搜尋」頁籤（`#search`，`frame-search`，點到才載入）。

## 檔案

| 檔案 | 內容 |
|---|---|
| `tools/build-search.mjs` | 產生索引；`--crawl` 先抓筆記本，`--limit N` 試作只抓前 N 篇 |
| `data/notes.json` | 抓下來的筆記本文章（也是筆記本的文字備份） |
| `search-index.json` | search.html 讀的索引：`{ built, source, tools, notes }` |
| `search.html` | 搜尋頁 |
| `tools/update-search.ps1` | 在使用者電腦上每週跑：抓筆記本、重建索引、推回 master |
| `.github/workflows/search-index.yml` | index.html、guide.html、build-search.mjs 改了就重建索引（不抓筆記本） |

## 抓筆記本

- **分類**：選單上 15 個分類頁（`/19061/page/view/N`）列出各分類的文章連結，一篇可以屬於好幾類。
- **列表**：最新文章的列表（`/bulletin/msg_list/19061/11/頁碼`，約 108 頁），每列有更新時間；置頂的排在最前面。
- **增量更新**：每次都讀全部列表頁，只有新文章或更新時間變了的才重抓文章頁；每篇間隔 0.8 秒。
- **文章頁**：
  - 「標題：」「發佈時間：」；內文在 `<div id="bulletin_content">` 到 `</div></td></tr></table>`。
  - 有附件時，內文後面先接「附檔：」，附件檔名放 `f`。
  - 設了密碼的文章（「本文章需要密碼」）記成 `locked`，不再抓也不放進索引。
- **內嵌（iframe）**，放在 `e: [{k, u, t, x}]`：

  | 類型 | 抓法 |
  |---|---|
  | YouTube | oEmbed 取標題 |
  | Google 簡報 | `/pub` 頁裡的字串取各頁標題（內文多半是圖，抓不到） |
  | Google 試算表 | `pub?output=csv`（第一個工作表） |
  | 其他網頁（neocities、Facebook 貼文等） | 內文，最多 3 萬字 |
  | PDF、非網頁 | 只記檔名 |
  | vi-tools 本身 | 略過 |

- **文章欄位**：`id`、`t` 標題、`c` 分類、`d` 發佈日、`u` 更新時間、`h` 內文標題、`x` 內文。
- **內容沒變不改檔**：`data/notes.json` 和 `search-index.json` 內容沒變就不寫，避免每週多出只改時間的 commit。

## 為什麼在使用者電腦上跑

class.kh.edu.tw 擋國外連線：2026-10-26 在 GitHub Actions 測過，連 443 port 等 136 秒仍然失敗。所以由使用者電腦上的工作排程器每週跑 `tools/update-search.ps1`：
- 它用自己的一份淺複製（`%LOCALAPPDATA%\vi-tools-search\repo`），不動 E:\Project 底下的 worktree。
- 紀錄寫在 `update.log`。
- 推 master 失敗（master 剛好有別的更新）時，會保留抓好的 notes.json，換成最新 master 重建後再推。

這兩個檔由 bot 推上 master，其他分支改 index.html、guide.html 時不用自己重建索引，GitHub Actions 會做。

## 工具與說明的索引

- **首頁卡片**：`.tool-card` 的名稱、標籤、說明；`p` 是分頁的網頁檔，`url` 是 `#hash`。
- **說明頁**：每個 h2、h3 一筆。h2 用所在 `<section id>` 當錨點，h3 用自己的 id。h3 的 id 是「section id-標題文字」（拿掉空白和標點），新增 h3 時照這個格式加 id。

## 搜尋頁

- **比對**：關鍵字以空白分開、全部要符合，NFKC 正規化並轉小寫後做字串比對。
- **排序**：計分權重是標題 30、分類 10、內文標題 8、內文 2（同一欄最多算 10 次）、內嵌與附件 1；同分的新的在前。
- **連結**：
  - 在首頁框架裡，工具與說明的連結用網頁檔名（例：`tactile.html`、`guide.html#tactile-標籤`），由 index.html 的框架連結攔截切到那個頁籤；帶錨點時，`jumpTo()` 捲過去並把焦點移到那個標題。
  - 單獨開 search.html 時，工具連到 `index.html#hash`，說明直接開 guide.html 的那一段。
- **桌面版**：不打包 `search-index.json`（`ViTools.csproj` 與 `make-manifest.mjs` 都排除），搜尋頁讀不到本機的就改讀線上的，都失敗就顯示要連網。
- **網址**：`?q=關鍵字&in=tools|notes` 可以直接帶查詢。
