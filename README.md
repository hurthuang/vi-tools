# 視障輔助工具集

一組專為視障者及點字工作者設計的瀏覽器端工具，無需安裝任何軟體，直接線上開啟即可使用。

## 線上使用

**主頁：** https://hurthuang.github.io/vi-tools/

| 工具 | 連結 | 說明 |
|------|------|------|
| 點字翻譯 | [braille-translate.htm](https://hurthuang.github.io/vi-tools/braille-translate.htm) | 中英文即時轉點字，支援 SimBraille 字型顯示 |
| PDF 友善文字 | [pdf-to-accessible.html](https://hurthuang.github.io/vi-tools/pdf-to-accessible.html) | PDF 擷取並整理為適合點顯器閱讀的純文字 |
| Nemeth 轉換 | [nemeth_converter.html](https://hurthuang.github.io/vi-tools/nemeth_converter.html) | 數學式 ↔ Nemeth 點字雙向轉換，含 MathJax 預覽 |
| G2 反查 | [g2-to-text.html](https://hurthuang.github.io/vi-tools/g2-to-text.html) | UEB G2 點字還原為一般文字 |
| G2 查詢 | [UEB-g2-query.html](https://hurthuang.github.io/vi-tools/UEB-g2-query.html) | UEB Grade 2 縮寫對照查詢 |

## 技術說明

- 純前端實作，所有運算在瀏覽器本地執行，不傳送任何資料至伺服器
- 點字字型使用內附的 `SIMBRL.TTF`（SimBraille）
- 點字轉換規則表採用 [liblouis](https://github.com/liblouis/liblouis) 格式，存放於 `table/` 目錄

## 授權

點字轉換規則表版權歸屬原始 liblouis 專案（LGPL）。
