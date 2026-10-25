# 觸摸圖：畫的圖形是物件、編輯檔（.tactile）

2026-10-25 第一階段（分支 `tactile-objects`）。使用者希望手畫的線條和點字標籤一樣能再選起來搬、對齊。

## 資料

- 每頁兩層：
  - 底圖 `pg.dots`／`pg.fillMask`：PDF、圖片轉出來的點陣、填色、橡皮擦的結果、「轉成點陣」後的圖形。
  - 物件 `pg.objs`：`{ type: 'line'|'arrow'|'rect'|'ellipse'|'pen', pts, thick, dash }`。line／arrow 是起點、終點；rect／ellipse 是外框兩個對角；pen 是一筆的每一點。
- `compose()` 先 `withObjs(pg)`（底圖＋物件轉成的點），再蓋標題、標籤，所以畫面、縮圖、匯出都一樣。
- `objCells(o)` 照控制點算出佔的點，控制點、粗細、紙張沒變就用快取（`_ck`、`_cells`，不可列舉，複製、存檔不會帶到）。
- 搬移、翻轉、旋轉、縮放都只改 `pts`，重新轉成點，不會失真；粗細照原本。

## 操作

- 「選取」工具：
  - 點一下圖形或標籤 → 點選（`selItems`），Shift 加選／取消；拖曳、方向鍵（Shift 5 點）、Delete、Ctrl+C／X／V／D。
  - 空白處拉框：框裡沒有點陣只有物件、標籤 → 改成點選；有點陣 → 照舊浮動選取（`float`），整個在框內的物件放在 `float.objs` 一起搬、翻轉、縮放。
  - 對齊（`alignItems`）：兩個以上對齊彼此的外框；只選一個時左右上下對齊 `AREA`、置中對齊整頁；等距要三個以上。
  - 「轉成點陣」：物件蓋進 `pg.dots` 後刪掉物件。
- 橡皮擦擦到物件時，那個物件先 `flattenObjs` 轉成點陣再擦（使用者試用後要求；原本只擦底圖），狀態列提示。框選擦清底圖，並刪掉整個在框內的物件。
- 填色：物件當牆（`objMaskOf`），紋理也不貼著物件。填色結果在底圖，不會跟著物件搬（第二階段改成矩形、橢圓的屬性）。
- 標籤自動排位、重新產生圖形：物件算線；重新產生時物件跟著圖的位置、比例一起搬。「取代目前這頁的圖」會清掉物件。

## 編輯檔（.tactile）

- JSON：`{ format: 'vi-tools-tactile', version: 1, paper: { w, h }, pages: [{ title, titleBrl, dots, fillMask, objs, labels, fills }] }`。
- `dots`、`fillMask`：`{ enc: 'gzip'|'raw', data: base64 }`，有 `CompressionStream` 就 gzip。一頁 12×11 吋通常不到 1 KB 到十幾 KB。
- 標籤存 `text`、`brl`、`manual`（手動改過的點字開回來不會被重新轉換蓋掉）、位置。
- 不存原始 PDF／圖片：開回來 `src: null`，不能重新產生圖形或描圖。
- 開啟時插在目前這頁後面（同空白頁）；還沒有頁面時紙張改成檔案的尺寸，有頁面時用 `resizeDots` 依目前紙張裁切或補白（物件不裁，超出紙張的點不會匯出）。第一次開才帶入檔名、清掉未儲存的標記。
- 一開始就有一張空白頁；只有一張完全沒動過的頁面時（`onlyEmptyPage`），開啟 .prn／.tactile、加入框選的圖會取代它，否則照原本插入或加在後面。匯入的 PRN 頁面標 `fromPrn`，清單沒有標題時顯示「（匯入的 PRN）」，其他顯示「（無標題）」。
- `dirty`：`pushUndo`、標題、標籤文字改了就標記；匯出 PRN 時還沒存編輯檔，標頭顯示提醒。

## 第二階段（2026-10-25）

- 點選的控制點（`itemHandles`）：只選一條直線、箭頭時是兩個端點（`drag.endpt`，Shift 鎖角度）；其他是合起來外框的四個角（`drag.iresize`，`scaleItems` 依拖曳開始時的樣子縮放，對角固定、Shift 維持比例、拖過固定角會翻過去）。只有標籤時沒有控制點。
- 選取工具選到圖形時，工具列顯示 `#optStroke`、`#optDash`、`#fillLevel`（多一個「不填色」），值取第一個圖形（`syncSelOpts`），改了就套用到選到的圖形（`editSelObjs`）。
- 矩形、橢圓的 `fill`（同填色種類：3、7、dots、diag、grid）：`objInside` 判斷裡面，`objFillCells` 算出填色的點（紋理不貼外框，快取 `_fk`、`_fill`）。`withObjs` 只填在底圖空白的地方，`fm` 記下位置讓 `compose` 在標籤周圍清掉。填色工具點在圖形裡面就設定 `fill`，不做 flood fill；點選時點在有填色的圖形裡面也選得到；`flattenObjs` 連填色一起轉成點陣。
- 修正：框選範圍拖角縮放時，`float.objs` 沒有跟著更新（第一階段漏掉）。
- 自動備份（`AUTO_KEY = 'tactile-autosave'`，localStorage）：`markDirty` 後 1.5 秒存 `buildData()`；儲存編輯檔後清掉。打開時有備份就顯示 `#restoreBar`，恢復用 `loadTactile`（同開啟編輯檔，會取代沒動過的空白頁）；還沒決定前不覆蓋舊備份。頁面排序、刪除、匯入 PRN、加入框選的圖也會標記修改。
