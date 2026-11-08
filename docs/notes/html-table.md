# HTML 表格（文件整理、文字轉點字）

2026-11-07 分支 `html-tables`。vi-tools 辨識套件的試卷輸出、使用者手打的點字試卷，表格都寫成一行 `<table border="1"><tr><td>…</td></tr></table>`（合併儲存格用 `colspan`）。使用者要「保留表格，vi-tools 也要看得懂」。

## html-table.js（`window.vitoolsHtmlTable`）

- `rows(html)`：DOMParser 解析，只取格子文字（textContent）與 colspan；不直接用原本的 HTML。
- `heads(rows)`：自動判斷第一列、第一欄是不是標題（第一欄不是數字、其他格大多是數字＝第一欄是標題）。數字可以帶短單位（30元、185mm、25%）。
- `toText(rows, axis)`：以列為軸一列一行「月均溫：1月 -3.7℃，2月 -0.7℃…」；以欄為軸一欄一行「1月：月均溫 -3.7℃，降水量 3mm」。
  - 合併儲存格的字填到它跨的每一格（標題套到底下每一欄）。
  - 標題裡的單位「月均溫（℃）」移到數字後面；括號裡有數字的「大杯(1000毫升)」不是單位。
  - 拆成好幾段的表（1～6 月、7～12 月，「月分」列重複）接成一張；兩層標題列（左上角空白）合成「價格 中杯」。
- `replaceAll(text, axis)`：每張表換成條列文字，表格前面同一行的字（「表(一)」）自己一行。
- 規則跟 vi-tools 辨識套件 `app/exam/layout.py` 的 `table_text` 相同，改一邊要一起改。

## 文件整理（pdf-to-accessible.html）

- 預覽、匯出 HTML：`tableLineHtml` 畫成真的表格（`th scope`），NVDA 在瀏覽器、Word 裡可以用表格指令逐格讀。
- 朗讀、匯出音檔、分段匯出：`getSpeakText()` 把表格換成條列文字（不改編輯區）；有表格時朗讀分頁出現「表格念法」（以列／以欄）。
- 自動調整：表格先換成 `@@VITABLEn@@` 記號再整理，整理完放回去（私用區字元會被 cleanExamText 清掉，不能用）。斷行整理：表格那一行前後都保留換行。

## 文字轉點字（braille-translate.htm）

- 輸入有表格時，輸入框上方出現「以列為軸／以欄為軸」：直接改寫輸入框（`btTablesToText`），跟題號排版一樣用 `btKeepZhBraille` 保住中文點字，報告可以「復原排版」。
- 沒有在轉換時偷偷換掉（轉換結果要對應回原文位置），所以沒按的話點字會照標籤原文轉。

## 從 vi-tools 辨識套件帶入（送到文件整理）

- 辨識套件（本機 http://127.0.0.1:<埠>）用 `window.open('…/pdf-to-accessible.html#from=haodian')` 打開文件整理；文件整理看到 `#from=haodian` 而且有 `window.opener`，就回 `{type:'vitools-ready'}`；辨識套件再送 `{type:'haodian-text', name, text, formatted:true}`。
- 文件整理只收 `e.source === window.opener`、來源是 `http://127.0.0.1` 或 `http://localhost` 的訊息（`p2aLoadFormatted`）。原本的內容先放進復原紀錄。
- 已排版（`p2aFromHaodian`）：檔案資訊下方顯示 `#fi-haodian` 提示；「自動調整」跳過斷行整理；打開「斷行整理」「頁首頁尾」時狀態列提醒通常不用做。開新檔案就清掉。
- 辨識套件預設打開線上版；用本機副本測試時在辨識套件頁面設 `localStorage['haodian.vitools'] = 'http://127.0.0.1:<埠>/'`。20 秒沒有回應（沒有網路、舊版）就請使用者貼上（辨識套件已先複製到剪貼簿）。
