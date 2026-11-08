# vi-tools 中繼檔（vtdoc）規格 v1

2026-11-07 使用者確認方向（第 8 節）。產生端：vi-tools 辨識套件 app/exam/vtdoc.py；讀寫端：vtdoc.js（文字轉點字、文件整理）。

## 0. 目的與原則

- 拿到檔案（Word、PDF、圖檔、樂譜）後，先在「版面整理」對照原卷調好版面、改好字，存成**一個中繼檔**；之後再送去文字轉點字（國、英、數）、nc（整份算式校對）、點字樂譜、觸圖製作、朗讀與音檔。
- **中繼檔本身就是 NVDA 電子檔**：用瀏覽器打開就能讀（標題可以用 H 跳、表格可以逐格讀、算式用 MathML 念）。
- **內容回到中繼檔，格式留在各工具**：
  - 內容＝文字、讀音（多音字）、算式、圖的處理方式、樂譜的音符。哪個工具改的，都存回中繼檔，三種輸出一起變對。
  - 格式＝點字的換行與版面、朗讀的語速與停頓。存在各工具自己的校對檔，不寫回中繼檔。
  - **例外：數學、樂譜的點字成品**（2026-11-08 使用者同意）。nc、點字樂譜手改過的點字存回中繼檔（`data-brl`，3.4、3.7），文字轉點字才拿得到；沒手改的，文字轉點字直接從 LaTeX／MusicXML 自動轉。
- **單一檔案**：圖、算式的原卷裁圖、MusicXML 都內嵌，複製到闈場電腦或寄給同事都只有一個檔。
- **不懂標記也能用**：每個元素的文字內容，就是它輸出成純文字時的樣子（題號、選項記號都留在文字裡）。只認得純文字的工具照樣能用。
- **看得到的內容就是輸出**：瀏覽器裡看得到的文字＝純文字輸出（第 4 節）。設成不輸出的東西（不輸出的附圖、改成條列文字的表格）用 `hidden` 留在檔案裡當資料，看不到、不朗讀、不轉點字。

## 1. 檔案

- 副檔名：`.vtdoc.html`（例：`三年級第一次段考.vtdoc.html`）。雙擊用瀏覽器打開；vi-tools 各工具的「開啟檔案」認得它。
- UTF-8，`<html lang="zh-Hant">`。
- **不能有會執行的程式**：只允許下面兩種「資料用」的 `<script>`（瀏覽器不會執行）：`application/json`（文件資訊）、`application/vnd.recordare.musicxml+xml`（樂譜）。各工具讀檔時只留允許的標籤與屬性（見第 6 節），其他丟掉或原樣保留但不顯示。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="generator" content="vtdoc 1">
<title>113 學年度第一學期三年級第一次段考 社會</title>
<script type="application/json" id="vtdoc-meta">{ …文件資訊，見第 2 節… }</script>
<style>…閱讀用的樣式（大字、行距；可以省略）…</style>
</head>
<body>
<main>
  …內容，見第 3 節…
</main>
</body>
</html>
```

## 2. 文件資訊（`#vtdoc-meta`）

```json
{
  "format": "vtdoc",
  "version": 1,
  "title": "113 學年度第一學期三年級第一次段考 社會",
  "subject": "社會",
  "source": { "name": "三年級第一次段考_A.pdf", "kind": "pdf", "pages": 4, "sha256": "…" },
  "created": "2026-11-07T15:30:00+08:00",
  "modified": "2026-11-08T09:12:00+08:00",
  "history": [
    { "tool": "版面整理", "time": "…", "note": "自動分區塊，手動改 12 處" },
    { "tool": "文字轉點字", "time": "…", "note": "讀音 3 處、錯字 1 處" }
  ],
  "drops": [ { "section": "二、選擇題", "questions": [5, 9], "points": 6 } ],
  "project": { "tool": "辨識套件", "folder": "20261107-114122_三年級第一次段考_A" }
}
```

- `subject`：國語、英語、數學、社會、自然、音樂…，可以空白。下游用來選預設值（例：數學預設開 Nemeth）。
- `history`：誰在什麼時候改了什麼，方便同事接手。只加不刪。
- `drops`：刪題說明（現在辨識套件的 刪題說明.txt）。
- `project`：回到版面整理時找原卷與框（見第 5 節）。沒有原卷的（Word、貼上的文字）就沒有這一項。

## 3. 內容元素

### 3.1 標題、大題、題目

```html
<h1>113 學年度第一學期三年級第一次段考 社會</h1>

<h2 class="vt-section" data-points="2">一、選擇題：每題 2 分，共 40 分</h2>

<section class="vt-q" data-num="1" data-blk="p1-b5">
  <h3>1. 下列哪一個是臺灣的離島？</h3>
  <p class="vt-opt" data-label="A">(A) 澎湖</p>
  <p class="vt-opt" data-label="B">(B) 海南島</p>
  …
</section>
```

- 大題 `<h2>`、題目 `<section class="vt-q">`，題目的第一段用 `<h3>`（NVDA 按 3 一題一題跳）；題幹第二段以後用 `<p>`。
- 選項 `<p class="vt-opt">`，記號 (A)、①… 留在文字裡；`data-label` 給工具判斷用。
- 選項是圖：`<p class="vt-optfig">(選項請參閱附圖)</p>`，圖本身是 3.6 的附圖（`data-role="options"`）。
- 小項 (1)(2)、(甲)(乙)：`<p class="vt-item">`。
- 原卷本來就換行的地方用 `<br>`；寫滿一行折下來的已經接成一段。
- **刪題**：`<section class="vt-q" data-num="5" data-drop>` 裡只放 `<h3>5. 「此題型盲生不適合作答」</h3>`；原本的題目內容放在 `<template class="vt-dropped">`（不顯示、不朗讀，改回來時用）。
- **題組**（閱讀測驗：一篇文章配好幾題）：`<section class="vt-group">` 包住題組說明、文章與它的題目（`section.vt-q`），題組裡不放 `h1`、`h2`。各工具讀文字時題組是透明的，轉純文字時題組前空一行。
- `data-blk`：對應版面整理的區塊編號（見第 5 節），寫法 `p<頁>-b<區塊>`，例：`p2-b14`。每個區塊產生的元素都帶這個屬性。

### 3.2 一般文字、跨語言

- 段落 `<p>`；閱讀測驗的文章段落 `<p class="vt-passage">`。
- 英文：`<span lang="en">The weather is nice.</span>`，整段英文用 `<p lang="en">`。朗讀換英文語音、點字換 UEB。
- 國語卷的注音（寫國字題的題目注音）：`<span class="vt-zhuyin">ㄉㄨㄥ</span>`。注音方格題的格式之後另外定。

### 3.3 讀音（多音字）

```html
<span data-reading="ㄓㄨㄥˋ">重</span>要
<span data-reading="ㄏㄤˊ ㄑㄧㄥˊ">行情</span>
```

- 用注音加聲調，一字一組、空白分開；一聲不標。
- **誰寫**：文字轉點字（在雙視校對區修正讀音時寫回）、版面整理（手動標）。
- **誰讀**：文字轉點字（直接用這個讀音轉點字）、朗讀與音檔（念這個讀音）、NVDA 電子檔（不影響，NVDA 照字念）。

### 3.4 算式

```html
<span class="vt-math" data-tex="\frac{1}{2}+x^{2}" data-conf="0.42" data-blk="p2-b7"
      data-crop="data:image/png;base64,…">
  <math>…（MathML，給 NVDA 念、瀏覽器顯示）…</math>
</span>
```

- `data-tex`（LaTeX）是**正本**；`<math>` 是由它產生的（版面整理、nc 存檔時用 MathJax 轉，離線也可以）。兩者不一致時以 `data-tex` 為準。
- 還沒產生 MathML 時，內容可以是 `\(\frac{1}{2}+x^{2}\)` 純文字；各工具都要認得這兩種寫法。
- 獨立一行的算式：`<div class="vt-math vt-display" …>`。
- `data-conf`：辨識信心（0～1）。低的 nc 整份算式校對排在前面。
- `data-checked="1"`：nc 整份算式校對確認過（或改過）的算式。
- `data-crop`：原卷裁下來的那一小塊圖（每個幾 KB），nc 校對時對照用。手打的算式沒有這一項。
- **誰寫**：版面整理（辨識、手動改）、nc 整份算式校對（用視覺編輯器改好存回）。
- **誰讀**：文字轉點字（Nemeth）、朗讀（MathCAT 報讀）、NVDA（MathML）。
- **手改的點字**（2026-11-08 定）：`data-brl`＝nc 裡手改過的 Nemeth 點字（Unicode 點字）；`data-brlsrc`＝產生這份點字時 `data-tex` 的雜湊（FNV-1a 32 位元，8 位十六進位）。
  - 只有手改過才寫；從 LaTeX 自動轉出來的不寫（文字轉點字自己轉）。
  - 文字轉點字：有 `data-brl` 而且 `data-brlsrc` 跟目前的 `data-tex` 對得上 → 用 `data-brl`；對不上（算式後來又改了）→ 用自動轉的，並提示「這個算式的手改點字是舊的」，讓老師決定要不要回 nc 重改。
  - 改 `data-tex` 的工具（版面整理、nc）不刪 `data-brl`，留著讓文字轉點字提示。
  - **實作（2026-11-08）**：`vtdoc.js` 的 `hash(s)`（FNV-1a 32，算 UTF-8 位元組，`data-tex` 去頭尾空白）、`mathBrl(v)` → `{ hand: Map(LaTeX → 點字), stale: [LaTeX…] }`。
    - nc 整份算式校對（nc-vtdoc.js）：Nemeth 點字下方「✎ 手改點字」（Unicode 點字或點字 ASCII，ASCII 打字時換成點字；跟自動轉的一樣就不算手改）、「改回自動轉的」（存檔時拿掉 `data-brl`）；算式後來又改了，畫面與清單標「手改點字是舊的」，附自動轉的結果。
    - 文字轉點字（braille-translate.htm）：輸入框裡同一行的 `\( … \)` 整個當一個算式 token（`isNemeth`、`isMath`），前後空一方（同 nc l2n 的寫法）；手改的（`_btMath.hand`）優先，否則在隱藏 iframe 載入 `nemeth_converter.html` 用 `latexToNemethAsc`＋`asc2brl` 自動轉（第一次遇到算式才載入，載好前原樣顯示、載好重新轉換；`_btMath.version` 進行快取鍵）。轉不出來原樣留著（輸出區下方的非點字提醒會列出）。開中繼檔時狀態列寫手改幾個、舊的幾個（列前三個 LaTeX）。不是中繼檔、自己打的 `\( \)` 也一樣自動轉。
  - **算式整理（2026-11-08，使用者回報）**：辨識的算式中間夾中文（`2 \frac{1}{3} 是 4 \frac{1}{9}`）要拆成兩個算式、中文放外面，不然點字裡後一個算式接著前一個、少了數字記號；原卷斷行把算式切開（`\sqrt{48\frac{8}{9}}` 換行 `<7`），後半被當成文字，要收回算式。
    - `vtdoc.js`：`splitCjk(tex)`（只看最外層，`\frac{甲}{乙}` 不拆；`\text{是}` 內容全中文也算文字）、`joinTail(text)`（算式後面緊接「< > = ≤ ≥ ≠＋數字或單一字母」收進算式，後面還接英數的不收，例：`≥ 2cm`）、`splitMathEls(root)` → `{ split, joined }`（改 DOM，新算式沿用信心、裁圖、位置，拿掉確認、手改點字）。
    - nc 開檔時自動整理（狀態列寫整理了幾個，要存回才會留下）；`inlineText` 輸出時也整理，所以沒經過 nc 的中繼檔，文字轉點字、文件整理也照樣對；`setInline` 找不到原本的算式時，從拆開前的算式、或是新算式開頭的舊算式沿用屬性。
    - 辨識套件同規則：`mathocr.split_cjk`（`edge_punct` 先拆，中文變成文字 token）、`vtdoc.join_tail`（`inline` 先收，再照「完全相同優先、其次開頭相同」對回辨識結果）。
  - **nc 原卷上改算式的框、框漏掉的算式（2026-11-08）**：原卷畫面還是 nc 自己的（翻頁、縮放、跟著算式放大都照舊），另開一份不顯示的 `vtdoc-view`（`cut`，pdf.js 載好之後才開，兩邊同時載會讓 `loadScript` 以為已經載好）負責 `regionSource`／`cropCanvas`，辨識跟版面整理同一套：本機有辨識套件 `vitoolsHaodian.recognize(…, {mode:'math'})`，沒有就 `vitoolsMfr`（網頁版）。選到的算式框畫 8 個控制點（`.hd`），放開 → `applyBox`：寫 `data-box`、重裁 `data-crop`（長邊 ≤ 600）、重新辨識換掉 LaTeX（`tex0` 不動，可以還原；辨識期間選了別的算式就直接改那一個、不動畫面）。原卷空白處拖曳 → `newMathFromBox`：mousedown 先 `preventDefault` 保住文字欄的選取；(a) 有選取（同一段一般文字）→ 換掉那串字；(b) 沒有 → 放進原卷上框住框中心、面積最小的那一段的結尾；之後 `rebuildItems` 重建清單、選到新的算式。在選到的框裡拖曳是搬框（同版面整理）。
  - **nc「✎ 改這段文字」（2026-11-08，使用者回報算式後面多出次方的「2」改不掉）**：文字欄點一段（`blkEl`）或選一個算式（它所在的那段，`BLOCKS` 選擇器），開 `<dialog>`，內容是 `vitoolsVtdoc.inlineText`（算式寫成 `\( \)`，先把還沒存的 LaTeX 寫進 `data-tex`、標 `mathDirty`），確定後 `setInline` 寫回（多行用 `<br>`；粗體、底線等格式會拿掉，對話框會提醒）。`rebuildItems` 照文件順序重建算式清單：同一個元素沿用；LaTeX 相同的對回原本狀態；剩下的跟這段沒用到的原本算式照順序配對（保留 `tex0`、信心、`data-box`、裁圖，顯示「改過」）；再剩的是新算式。存檔時 `mathDirty` 的重轉 MathML。「要檢查」多一種 `exp`：算式（結尾 `)` `]` `}`）後面緊接一個單獨的數字，提醒可能漏掉的次方，面板有「✎ 改這段文字」。
    - 已知：版面整理、文字轉點字改了算式的 LaTeX 時，`setInline` 換成新的 `vt-math`（照 LaTeX 對舊元素），手改的點字會跟著消失、不會留下來提示；之後再補。

### 3.5 表格

```html
<table class="vt-table" data-how="table" data-hrow="1" data-hcol="1" data-blk="p3-b2">
  <tr><th></th><th>1月</th><th>2月</th></tr>
  <tr><th>月均溫（℃）</th><td>-3.7</td><td>-0.7</td></tr>
</table>
```

- `data-how`：`table`（保留表格，預設）／`rows`（以列為軸條列）／`cols`（以欄為軸）／`mark`（只標「(請參閱附表)」）／`none`（不輸出）。
- `data-hrow`、`data-hcol`：第一列、第一欄是不是標題（1／0；沒寫＝自動判斷）。
- 合併儲存格用 `colspan`、`rowspan`；格子裡可以有算式（3.4）、英文（3.2）。
- 條列文字的規則跟現在的 html-table.js、辨識套件 `layout.table_text` 一樣。
- 表名（「表(一)」）放在 `<caption>`。
- `data-how` 是 `rows`／`cols` 時：表格加 `hidden`，後面接 `<p class="vt-tbltext">` 條列文字（看得到、會輸出的是條列文字）。`mark`、`none` 也加 `hidden`；`mark` 的「(請參閱附表)」寫在題幹裡。

### 3.6 附圖

```html
<figure class="vt-fig" id="fig-3-1" data-how="mark" data-tactile="1" data-blk="p2-b9">
  <img src="data:image/png;base64,…" alt="圖中文字：甲、乙、丙、北">
  <figcaption>圖（一）</figcaption>
  <ul class="vt-labels" hidden>
    <li data-x="120" data-y="45">甲</li>
    <li data-x="300" data-y="210">北</li>
  </ul>
</figure>
<p class="vt-figtext">圖中文字：甲 乙 丙 北</p>      ← 只有 data-how="figtext" 才有
<p class="vt-figdesc">（改成文字敘述的內容）</p>      ← 只有 data-how="text" 才有
```

- 「(請參閱附圖)」寫在題幹文字裡（跟現在 試卷.txt 一樣），`<figure>` 本身不輸出成文字（`figcaption`、`img` 的說明只給看圖的人）。
- `data-how` 是 `text`、`none` 時，`<figure>` 加 `hidden`。

- `data-how`：`mark`（標「(請參閱附圖)」）／`figtext`（標記＋圖中文字）／`text`（輸出 `vt-desc` 的文字敘述，不標附圖）／`none`（不輸出）。跟現在辨識套件的四種一樣。
- `data-tactile="1"`：要做觸圖。觸圖製作開中繼檔時，列出這些圖，一張一頁，`vt-labels` 當點字標籤放在原位（座標是圖片的像素）。
- `data-role="options"`：選項是圖（同一題的選項圖，觸圖合成「第N題 選項」一頁）。
- 觸圖做好的 PRN 不放進中繼檔（太大、是格式），留在觸圖製作的 .tactile。

### 3.7 樂譜

```html
<figure class="vt-score" id="score-1" data-how="braille" data-blk="p1-b4">
  <img src="data:image/png;base64,…" alt="譜例一">
  <figcaption>譜例一</figcaption>
  <script type="application/vnd.recordare.musicxml+xml">&lt;score-partwise …&gt;…</script>
</figure>
```

- `data-how`：`braille`（轉點字樂譜，預設）／`mark`（只標「［譜例］」）／`none`。
- MusicXML 是**正本**：在點字樂譜工具改了音符（辨識錯），存回這裡。點字樂譜的換行、版面留在點字樂譜那邊。
- 文字轉點字遇到 `braille` 的譜例，放進 🎼 樂譜區塊（交給點字樂譜的轉換）；朗讀與音檔念「譜例一」，之後可以選擇播放。
- **手改的點字**：跟算式一樣用 `data-brl`／`data-brlsrc`（雜湊算 MusicXML 全文），寫在 `figure.vt-score` 上；點字樂譜的分行也算在成品裡（`data-brl` 用換行分行）。文字轉點字把它整塊放進 🎼 樂譜區塊、不重新斷行。

### 3.8 原卷頁碼（不朗讀）

```html
<hr class="vt-page" data-page="2" aria-hidden="true">
```

- 原卷換頁的位置。NVDA、朗讀都跳過；點字可以選擇要不要標原卷頁碼（點字課本常用）。

### 3.9 原卷與位置（2026-11-08 加）

整個 vi-tools 對照同一份原卷：原始檔放進中繼檔，各工具自己畫（PDF 用 pdf.js），需要哪一塊就當場裁。

```html
<!-- </main> 後面，二選一 -->
<script type="application/pdf" id="vtdoc-source">…PDF 的 base64…</script>
<script type="image/jpeg" class="vtdoc-page" data-page="1">…第 1 頁的 base64…</script>
```

- **PDF 不超過 15 MB**：原樣放（`application/pdf`）。`meta.source.page_map`＝中繼檔第幾頁對到原始檔第幾頁（只辨識部分頁面時用）。
- **PDF 超過 15 MB、圖檔、其他**：每頁一張灰階 JPEG（長邊 1600 像素），`data-page` 是中繼檔的頁碼。圖檔不放原圖，因為辨識用的頁面圖可能轉正過，座標要跟頁面圖一致。
- **不帶原卷**：`meta.source.embed` 寫 `none`（辨識套件存檔時「中繼檔包含原卷」不勾）。工具退回用算式的 `data-crop` 裁圖。
- `meta.source.embed`：`pdf`、`pages` 或 `none`。
- **位置** `data-box="頁 x0 y0 x1 y1"`：頁碼從 1 起，座標是那一頁寬高的比例（0～1，左上角為原點），所以不管畫多大都對得上；直書頁也是原卷方向。有位置的：算式（`vt-math`）、每個帶 `data-blk` 的元素（標題、大題、題目、選項、文字、表格、附圖）。
- 手打或下游新增的元素沒有 `data-box`；工具找最近的、有 `data-box` 的上層元素。
- **沒輸出的地方** `meta.omitted`（帶原卷時才寫）：`[{ page, box:[x0,y0,x1,y1], kind, text }]`，給下游檢查框錯、漏框。`kind`：`skip`＝版面整理設成「略過」的區塊（頁首頁尾也在內）；`uncovered`＝沒被收進任何區塊的字（手動刪框、縮框之後才會有）。

## 4. 輸出成純文字的規則

給只吃純文字的地方（文字轉點字現有的輸入框、複製到別的軟體）：

| 元素 | 純文字 |
|---|---|
| `h1`～`h3`、`p` | 文字內容，一個元素一行；題目之間空一行 |
| 算式 | `\(` + `data-tex` + `\)` |
| 表格 | 看得到的表格（`data-how="table"`）→ 表名＋`<table border="1">…</table>`；`hidden` 的表格不輸出，條列文字是後面的 `<p class="vt-tbltext">` |
| 附圖 | `<figure>` 本身不輸出；「(請參閱附圖)」在題幹裡，圖中文字、文字敘述是後面的 `<p>`（vt-figtext、vt-figdesc） |
| 樂譜 | 「［譜例］」 |
| 讀音 | 只留字（讀音另外傳給點字的引擎） |
| `hidden`、`template`、原卷頁碼 | 略過 |

這就是現在辨識套件 試卷.txt 的格式，現有流程不受影響。

## 5. 各工具讀什麼、寫回什麼

| 工具 | 讀 | 寫回中繼檔 | 留在自己這邊 |
|---|---|---|---|
| 版面整理（新，合併文件整理＋辨識套件） | 原卷、Word、文字 | **全部產生**：結構、文字、算式、表格、附圖、樂譜、區塊的框（`data-box`） | — |
| nc 整份算式校對 | 算式（含裁圖、信心）、前後文字 | 算式的 `data-tex`、MathML；手改的點字 `data-brl` | — |
| 文字轉點字 | 全部（純文字規則＋讀音＋語言＋手改的數學／樂譜點字） | 讀音 `data-reading`、錯字 | 點字換行、版面、點字校對檔 |
| 點字樂譜 | 樂譜的 MusicXML | 改過音符的 MusicXML；手改的點字 `data-brl` | — |
| 觸圖製作 | `data-tactile` 的附圖、標籤 | 標籤文字改過的（可選） | .tactile、PRN |
| 朗讀與音檔（原文件整理） | 全部（讀音、語言、算式報讀） | 錯字（朗讀時發現的） | 語音、語速、停頓、MP3 |
| NVDA 電子檔 | 中繼檔本身 | — | — |

**寫回的方式**：每個工具「存回中繼檔」時，只改自己負責的那幾種屬性與文字，其他原樣保留（包括不認得的元素和屬性），並在 `history` 加一筆。

**回到版面整理**（中繼檔已經在下游改過字，又要回去調框）：版面整理打開中繼檔，用 `data-blk` 對回自己的區塊，把下游改過的文字、讀音、算式當成那一塊的「手動修改」。重新產生中繼檔時這些修改不會不見。改了框、重新辨識的那一塊才會失去下游的修改（會先提醒）。

## 6. 允許的標籤與屬性

- 標籤：`h1 h2 h3 p br span div section template table tr th td figure figcaption img ul li hr math`（以及 MathML 的標籤）、`script`（只限 `application/json`、`application/vnd.recordare.musicxml+xml`，以及原卷的 `application/pdf`、`image/jpeg`、`image/png`）。
- 屬性：`class id lang hidden aria-hidden alt src`（`src` 只能是 `data:image/…`）、`colspan rowspan`，以及 `data-` 開頭的：`num label points drop blk how tactile role hrow hcol tex conf crop checked box brl brlsrc reading page x y`。
- 不允許：事件屬性（onclick…）、外部連結的圖片、`<iframe>`、`<a href="javascript:…">`。工具開檔時清掉，存檔時不產生。

## 7. 版本

- `version` 是整數。新增元素或屬性、舊工具不認得也不會出錯的，版本不變；要改既有寫法時才升版本。
- 工具遇到比自己新的版本：照樣開，不認得的部分原樣保留，提示「這個檔案是新版產生的，部分內容可能沒顯示」。

## 7.5 實作狀態

- 2026-11-07 辨識套件產生中繼檔（`app/exam/vtdoc.py`，版面調整畫面「輸出」→「存成中繼檔」）：標題、大題（含每題分數）、題目、選項、小項、選項是圖、刪題（原文放 template）、算式（data-tex、信心、原卷裁圖；下載時用 MathJax 轉成 MathML）、表格（caption、data-how、hidden）、附圖（裁圖、圖中文字與位置、data-tactile、選項圖 data-role）、整行英文 lang="en"、原卷換頁 hr。圖可以選擇不內嵌。附圖長邊最多 1400 像素、灰階，照片自動用 JPEG：考卷 0.3～1.2 MB，363 張圖的課本 18 MB。
- 檢查：19 份數學卷、16 份國語卷與使用者的試卷，瀏覽器看得到的文字跟 試卷.txt 逐字相同（表格另外比）。
- 還沒做：題組（vt-group）、樂譜 MusicXML（辨識套件的試卷模式不辨識樂譜，只有譜例圖）。
- 2026-11-07 第 2 步：`vtdoc.js`（parse／sanitize、toText＝第 4 節純文字並記住每行來自哪個元素、applyText＝行的最長共同子序列對應後改寫元素（算式沿用原本的信心、裁圖、MathML；多出來的行加 `<p>`、刪掉的行拿掉元素，題目那行刪了只刪那行）、applyReadings／readings、serialize 加 history）。
  - 文字轉點字：開啟檔案認得中繼檔，輸入框放純文字，`data-reading` 轉成多音字修正（ctxKey＝前兩字｜本字｜後一字）；「存回中繼檔」寫回改過的文字與讀音（點字修正能轉成注音的才寫）。點字換行、版面不寫回。
  - 文件整理：開啟檔案認得中繼檔（標成已排版）、辨識套件「送到文件整理」連中繼檔一起送；「存回中繼檔」寫回改過的文字。
  - 檢查：6 份中繼檔 toText 跟辨識套件 試卷.txt 逐字相同；改字、刪行、加行、改表格格子存回再讀，內容對（不比空行）；讀音 148 個包回去、位置都對、文字不變。

- 2026-11-07 第 3 步：nc（nemeth_converter.html）第三個分頁「整份算式校對」（`nc-vtdoc.js`）。
  - 開中繼檔 → 算式清單（預設信心低的先，可改原卷順序、只列還沒確認的；信心低於 90% 標紅；手打的算式沒有信心排最後）。
  - 每個算式：原卷裁圖、MathJax 畫出目前的算式、LaTeX 欄（可開原本的「📝 數學編輯器」點按鈕插符號）、Nemeth 點字、前後文字（同一行，算式加框）。Ctrl＋Enter＝正確並跳下一個還沒確認的；Alt＋PageDown／PageUp 下一個／上一個；可以還原辨識結果。
  - 存回：改過的寫 `data-tex`，改過的與還沒有 MathML 的用 MathJax 重轉 `<math>`；確認過的加 `data-checked="1"`；history 加一筆。
  - 辨識錯出來的 `\newcommand`、`\def` 之類（會改到整頁 MathJax）：不畫、不轉 MathML，提示對照原卷重打。
  - 檢查：數學卷 86 個算式（信心 83%～100%），改 2 個、確認 3 個存回，再讀 toText 只有那 2 行不同，86 個都有 MathML；LaTeX → Nemeth 分頁與數學編輯器照舊。
  - 沒做：真正所見即所得的算式編輯（像 MathLive，要多帶一個函式庫）；目前是 LaTeX 欄＋數學編輯器的按鈕＋即時預覽。
- 2026-11-08 原卷與位置（第 3.9 節）：辨識套件存中繼檔時放原卷（預設勾「中繼檔包含原卷」）並寫 `data-box`；`vtdoc.js` 加 `source(v)`、`box(el)`。
  - nc 整份算式校對改成像辨識套件版面調整：算式清單（可收合）｜原卷（pdf.js 畫，可換頁、放大）｜整份文字（MathJax 畫算式）。選到的算式：原卷上粗紅框＋外圈黃光（剛選到時閃三下，系統設定減少動態時不閃），文字裡粗紅框＋黃底；兩邊自動捲到那裡、自動換頁。原卷上其他算式：黃虛線＝還沒確認、綠框＝確認過；點框就選那個算式。點文字裡其他段落，原卷上用粗藍框框出那一塊。
  - 2026-11-08 框錯、漏框的檢查：原卷顯示方式「整頁／合寬／放大」（預設整頁，可勾「跟著算式放大」）、「顯示全部框」（其他區塊淡灰框、不輸出的虛線、略過的灰斜線）；清單最上面「⚠ 要檢查」：沒收進區塊的字（每頁一筆，原卷紅斜線）、不在頁首頁尾而且有 10 字以上的「略過」區塊、文字裡像算式的寫法（字母接數字、數字運算、數學符號、a/b、字母等式），按「看過了」消掉。改內容：文字欄選取文字→「選取的文字變成算式」、「不是算式，改回文字」；框本身不在 nc 改（回版面整理）。編輯區搬到右欄文字上方，原卷那欄用整個高度。
    - LaTeX 有錯（MathJax merror、大括號／\\begin 沒配對、轉不出點字）的算式標「⚠有錯」排最前面：信心 99% 也可能整個辨識錯（g2a1 第 1 題）。辨識套件找不到 來源.*（11-07 以前辨識的資料夾）時放每頁辨識圖（embed=pages）。
    - 檢查：數學卷模擬刪掉一個選項框，標出 8 處沒收進區塊；自動分區塊把第 2 頁一行題目誤設成略過，也被標出來；「90°」被抓成可能漏掉的算式，選取後變成 `90^\circ`；存回後 toText 有 `\(90^\circ\)`，原卷與 omitted 都還在。
  - 檢查：數學卷（PDF 340 KB → 中繼檔 779 KB，234 個位置，86 個算式都有位置）、直書國語卷（旋轉頁 PDF，框對到那一行）、截圖（頁面圖）三種都對得上；存回後原卷、位置都還在，純文字只有改的那行不同。

- 2026-11-08 第 4 步：版面整理（測試版）`layout.html`＋`vt-layout.js`，原卷顯示抽成 `vtdoc-view.js`（之後 nc 可以改用）。
  - 做法：`<main>` 是正本；每次操作把 main 攤平成區塊清單（`section.vt-q` 的 h3＝題目，section 的屬性跟著題目走），改清單再重排 main。元素原樣搬動，算式的信心、裁圖、MathML、讀音、data-box 都保得住。
  - 功能：改類型（鍵跟辨識套件一樣 1 題目 2 選項 3 文字 8 大題 9 標題 0 略過；略過＝`p.vt-skip[hidden]`）、Alt＋↑↓ 搬（表格、附圖帶著 tbltext／figtext／figdesc）、改字（contenteditable，算式換回原元素）、從游標處分段、併到上一段、新增一段、刪題／恢復（內容收進 `template.vt-dropped`；辨識套件產生的 `<p>` 版恢復時第一行變 h3、(A) 開頭變選項）、表格／附圖 `data-how` 與 `data-tactile`（rows／cols 用 html-table.js 產生條列文字）、`meta.omitted` 加回來（同一行接成一段、一行好幾個選項記號自動拆）、復原 40 步。存檔：重算 `meta.drops`、沒有 MathML 的算式用 MathJax 轉、history 加一筆。
  - 檢查：數學卷改類型、刪題再恢復（跟原本一樣）、搬附圖、分段再合併、改字（算式的 data-conf、data-crop、data-box 都在）、表格改以列為軸；刪掉選項框的那份，8 塊沒收進的字「這一頁同樣的都加回來」→ 4 個選項 (A)～(D)；存回後原卷還在、omitted 少掉加回來的、83 個算式都有 MathML，純文字只多加回來的那行。
  - 2026-11-08 搬辨識套件版面調整的功能：排順序（O，在原卷上依序點框；單位＝連續同一個 data-box 的幾塊＋表格附圖的衍生文字，點過的照順序、沒點到的排後面，整段一步復原）、套用到所有頁（其他頁框重疊超過自己面積一半的文字區塊改成同類型）、多選合併（G，data-box 取聯集）、表格 data-hrow／data-hcol（1／0／自動）、原卷空白處拖曳新增區塊（框裡有 omitted 就用它；PDF 用 pdf.js getTextContent 讀文字層，`vtdoc-view.js` 的 `textIn`，直書旋轉頁一欄一行；都沒有＝空白段落開始改字）、存成 .txt、複製全部文字、送到文件整理（同辨識套件的 postMessage；文件整理改成也收同網站來源、`#from=layout`）。
    - 檢查：數學卷拉框讀文字層「1.關於二次函數y＝－4＋x 2的圖形敘述何者正確？」（算式要再檢查）；排順序先點標題再點大題 → 標題、大題排最前；兩段多選 G 併成一段；表格以列為軸、第一欄改「不是標題」條列文字跟著變。
  - 2026-11-08 接本機辨識套件（使用者 11-07 的決定：辨識做成桌面版選裝套件，偵測到才有功能；過渡先偵測開著的辨識套件）：`haodian-ocr.js`（`vitoolsHaodian.detect()` 同時試 127.0.0.1:18760～18779 的 `GET /api/ocr`；`recognize(src, box, {type, mode})`，PDF 送 sha256，辨識套件沒記住才送整份 PDF；頁面圖送裁好的 PNG）。辨識套件那邊是 app/exam/region.py。版面整理：偵測到才出現「已連上辨識套件」、拉框方式（辨識套件文字＋算式／辨識成一個算式／只讀 PDF 文字層）、「重新辨識」（R，同一個 data-blk＋data-box 的幾個元素一起換，第一個元素留著、其他拿掉、多的行照題號／(A) 判斷類型；有 nc 確認過的算式先問）。
    - 檢查：數學卷第 2 題重新辨識 → 題目一段（含原本拆在後面的題幹），不重複；第 1 題選項那塊（直接呼叫 API，type=opt）→ (A)～(D) 四個選項；拉框「辨識成一個算式」框住 y=-4+x^2 有辨識出來（框多切到旁邊的字，算式模式改成只外加 2 px）；PDF 只送一次（之後只送 sha256）；evil.example 來源 403。
  - 2026-11-08 **沒有辨識套件時的網頁版辨識一個算式**（使用者同意「有辨識套件用辨識套件，沒有用精簡 onnx」）：`mfr-web.js`（主程式介面 `vitoolsMfr`）＋`mfr-worker.js`（Web Worker，onnxruntime-web 1.20.1 WASM，從 jsDelivr 載入）＋`mfr-tidy.js`（Pix2Text post_process＋辨識套件 mathocr.tidy 的 JS 版）；模型 `models/mfr/`（Pix2Text MFR 1.5 int8 動態量化，encoder 23 MB＋decoder 10 MB，MIT，做法 `tools/quantize-mfr.py`）。第一次用才下載，存 Cache API（`vitools-mfr-1`，換模型改名字）；本機與桌面版不另存。前處理照辨識套件：PDF 200 DPI 算圖（`vtdoc-view` 的 `sv.cropCanvas`，框外加 2 px）、灰階、>=200 變白、PIL BICUBIC 縮 384×384；貪婪解碼（最多 512 個 token，辨識套件是 1024）。不放 MFD（AGPL），所以只辨識框好的一個算式。版面整理的拉框方式：辨識套件連上時「文字＋算式（辨識套件）」「一個算式（辨識套件）」，沒連上時「一個算式（網頁辨識）」；都有「讀文字（PDF 文字層）」。
    - 檢查：`mfr-tidy.js` 跟辨識套件 Python 版 3,126 筆（19 份 mfr.tsv＋150 個原始輸出）逐字相同；量化版 2,976 個算式跟原版一字不差 92%，拿手打答案判斷原版對量化錯 31、量化對原版錯 23（E:\Project\agy-work\20261108-mfr-web）；瀏覽器（單執行緒，GitHub Pages 沒有 COOP/COEP 就是這樣）PDF 卷 40 個算式跟辨識套件結果一字不差 32 個（其他多是空白，1 個辨識套件亂碼網頁版對、1 個網頁版多字），平均 1.2 秒、最慢 2.6 秒，載入模型 6 秒；版面整理實際拉框（辨識套件關著）：載入＋辨識 2.7 秒，新增一塊算式。只有頁面圖的中繼檔（g2a1）比較常多切到旁邊的字。
    - 桌面版離線：onnxruntime-web 的 ort.wasm.min.js、ort-wasm-simd-threaded.wasm／.mjs 要放進 desktop/desktop-assets/cdn/（還沒放）；WebView2 跑 Worker＋WASM 還沒實測。
  - **首頁（2026-11-08）**：教材製作第一個（`frame-layout`、`data-src`、`#layout`，測試版）。「送到朗讀與音檔」在首頁框架裡：`postMessage({type:'sendToP2a', name, text, vtdoc})` 給首頁，首頁切到 `frame-p2a` 再轉交 `haodian-text`（`from:'layout'`），朗讀與音檔收「開它的視窗」或「首頁」送來的，檔名後面標「（版面整理）」；單獨開版面整理時照舊開新分頁。兩條路都在瀏覽器測過。
  - **題組（2026-11-08）**：`flatten` 每個區塊記 `grp`（所在的 `section.vt-group`），`build` 把連續同一個 `grp` 的區塊放進去（題目不跨題組）；`normGroups`：標題、大題不進題組，夾在同一個題組中間的區塊（新拉的框、搬進來的）併進去，跟前面斷開的離開，沒有題目的題組拆掉。`T`／「設成題組」：選好範圍；只選一塊時照文字裡「第 11～13 題」「11-13 題」「第 11 題至第 13 題」「25及26題」自動選到最後一題（含選項）；在題組裡只選一塊再按＝取消。清單上題組的列左邊紫色線，開頭、結尾標「題組開始」「題組結束」（螢幕報讀念得到）。
  - 還沒做：首頁卡片（改 index.html 要先 rebase）、送到文件整理還沒實測開分頁。
  - 2026-11-08 **直接開原始文件**（製作流程第 1 步）：「📂 開啟檔案」收中繼檔、PDF、圖檔（可多張）、.docx、.txt。
    - 連上辨識套件（`found.doc`，0.3 起）而且是一份 PDF 或一張圖：對話框問「用辨識套件辨識」（可填頁碼）或在網頁裡讀。辨識套件那邊是 `/api/doc`（app/server.py：POST 送檔 → 試卷模式的工作；GET 進度；GET `/vtdoc` 拿中繼檔（含原卷、位置，沒有 MathML，版面整理存檔時轉）；POST `/cancel`；CORS 同 `/api/ocr`；PDF 順便記住，之後「重新辨識一塊」不用再送）。`haodian-ocr.js` 的 `doc(file, {pages, onProgress, signal})`。進度只在換頁時更新文字（報讀軟體不會一直念），辨識中 Esc 不關對話框。
    - 網頁裡讀（`vtdoc-build.js`，`vitoolsVtdocBuild.fromFiles`）：PDF 用 pdf.js 文字層，一行一行（同一高度但水平隔太遠的分兩行；兩欄頁先左欄後右欄）、上下靠近而且不是題號／選項／小項開頭的接成段落，照開頭判斷類型（`1.`→題目、`(A)`／①→選項、`一、`→大題、`(1)`／`(甲)`→小項，第一段 60 字以內當標題），一行好幾個選項自動拆；英數字之間 PDF 真的隔開（超過字高 1/4）才補空白。原卷照辨識套件的規則放（15 MB 以下放 PDF，超過放每頁 JPEG 長邊 1600）。文字層少於 20 字的頁當掃描頁，只放原卷。圖檔每張一頁 JPEG，沒有內容。.docx 用 shared.js 的 `docxXmlToText`（用到才載入 shared.js、JSZip），.txt 一行一段，都沒有原卷（`meta.source` 不寫，原卷那欄說明沒有原卷）。
    - 剛做出來的算「還沒存」（關頁面、開別的檔會提醒），存檔檔名＝原檔名＋.vtdoc.html。
    - 2026-11-08 使用者試用回饋（地理卷 114-2-1 二年級 A）：
      - **附圖**：讀文字層時用 `getOperatorList` 追 CTM 找內嵌圖片（頁面 0.3%～60%，相連的併成一張），框裡（外擴 0.01）的文字行當圖中文字（`ul.vt-labels`），不再當段落；裁圖 JPEG 長邊 1400，預設 `data-how="mark"`、`data-tactile="1"`。圖片裡的字（點陣）讀不到，要辨識套件。拉框方式多「框成附圖」（`figFromBox`：框裡 30 字以內的文字區塊、沒輸出的字收進附圖當標籤）。
      - **兩欄**：先在頁面 30%～70% 找幾乎沒有字跨過、左右各至少 8 塊字的直線當分界，字分左／右／跨欄（左右兩塊間隔不到字高 0.4 的算同一行，置中標題不會被切開），同一欄才接成一行；跨欄的行之間先左欄後右欄。地理卷 1～16 題順序全對。
      - **新拉的框插在目前選到的區塊後面**（`afterCur`：表格、附圖連同後面的文字之後；框成附圖、辨識、讀文字層都一樣；沒選到才照原卷高度），插完選到新的那塊，連續拉框照順序。原本照原卷高度插，兩欄時常插錯地方。
      - **拉框「辨識純文字」**（連上辨識套件才有）：`/api/ocr` 的 `mode=text`，辨識套件 `mathocr.raw_items(img, math=False)` 不跑 MFD，PDF 有文字層照樣讀文字層。頁面下方的按鍵說明改成 `<details>` 收合（預設收起）。
      - **改框、刪除、拖曳排順序**：選到的框有 8 個控制點（拖曳改大小、拖中間搬；同一個框的幾個元素一起改 `data-box`）；文字區塊改完問要不要重新讀字（`rereadBlock`：有辨識套件用 `/api/ocr`，沒有讀文字層、續行接成段落）；附圖改框重新裁圖、標籤換算座標、框外的拿掉。`Delete`（焦點在原卷那邊也可以）／選到的框右上角 ✕／「刪除區塊」真的拿掉（表格、附圖連同後面的文字），`0` 才是略過。右邊清單 HTML5 拖曳，拖題目連同選項（到下一題、大題、換頁為止），多選就搬選到的。
    - 檢查：鳳山 2b1 PDF 網頁讀 3 頁 110 段（題目、選項、大題都分對；分數的分子分母是分開的幾行，要拉框辨識成算式）；同一份用辨識套件辨識 2 頁 79 塊、37 個算式、原卷對得上；Word 報告 60 段（標題、大題分對）；兩張 PNG → 2 頁原卷。

## 8. 決定事項（2026-11-07 使用者回覆）

1. 注音方格題：先不處理。
2. 閱讀測驗的題組：用 `<section class="vt-group">` 把文章和它的題目包起來。
3. 英文試卷的特別結構：暫時沒有。
4. 點字不預設標原卷頁碼（`vt-page` 照樣記，只是點字預設不輸出）。
5. 讀音用注音（朗讀頁需要時自己轉）。
6. 圖很多時可以選擇不內嵌圖（只留處理方式與圖中文字），存檔時讓使用者選。

### 2026-11-08 使用者定的製作流程

1. 開原始文件（Word、PDF、圖檔…），對照原卷重新排版，框選圖、表、樂譜，算式初步處理 → **vi-tools 版面整理**（辨識套件只當辨識引擎；辨識套件的 /exam/ 版面調整畫面不再加功能）
2. 存成中繼檔，NVDA 直接讀
3. 中繼檔 → 文字轉點字，轉點字送列印
4. 中繼檔 → 原文件整理（之後改名朗讀與音檔），轉 MP3
5. 中繼檔 → 觸圖製作，修編 PRN（直接開中繼檔的 `data-tactile` 附圖，不再經過辨識套件的 .tactile 匯出）
6. 中繼檔 → nc／點字樂譜後續修編；手改的點字存回 `data-brl`，文字轉點字組成完整的點字檔
7. 做的功能都要能公開使用。
