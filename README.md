# 視障輔助工具集

一組專為視障教育設計的瀏覽器端工具，供教師製作教材使用。無需安裝任何軟體，直接線上開啟即可使用；所有運算在瀏覽器本地執行，不上傳資料。

## 線上使用

**主頁：** https://hurthuang.github.io/vi-tools/

## 工具

| 工具 | 連結 | 說明 |
|------|------|------|
| 文字轉點字 | [braille-translate.htm](https://hurthuang.github.io/vi-tools/braille-translate.htm) | 文字→點字即時轉換，支援 UEB G1／G2／自定／Comp8；可分批啟用 G2 縮寫規則；Nemeth 數學模式；自訂規則；雙視校對區點擊注音點字格可手動修正多音字讀音；修正紀錄自動本機存檔，可匯出含修正紀錄的 HTML 校對檔，重新開啟後繼續修編 |
| 點字轉文字 | [braille-to-text.html](https://hurthuang.github.io/vi-tools/braille-to-text.html) | UEB G2 與台灣注音點字混排自動辨識，還原為英文／中文；雙視校對區點字在上、國字在下，可點擊修正同音異字；修正紀錄自動本機存檔，可匯出含修正紀錄的 HTML 校對檔跨裝置繼續修編；McBopomofoWeb 引擎 |
| 數學點字 | [nemeth_converter.html](https://hurthuang.github.io/vi-tools/nemeth_converter.html) | LaTeX 數學式↔Nemeth 點字雙向轉換；MathJax 即時預覽；108 課綱符號對照；數學編輯器 |
| 文件整理 | [pdf-to-accessible.html](https://hurthuang.github.io/vi-tools/pdf-to-accessible.html) | 開啟 PDF／DOCX／TXT，自動整理版面雜訊（頁首頁尾、選項斷行、連字號等）；內建語音朗讀（TTS）試聽；高對比與黃底黑字主題 |
| UEB 查詢 | [UEB-g2-query.html](https://hurthuang.github.io/vi-tools/UEB-g2-query.html) | 輸入英文單字查 G2 點字，逐條列出所用縮寫規則並以色碼標示；支援點字反查英文；與 liblouis 結果並排比對 |

## 共同功能

- **六點鍵盤輸入**：文字轉點字、點字轉文字、數學點字均支援 Ctrl+B 開關浮動面板，以 SDFJ KL 六鍵組合直接輸入點字
- **開啟檔案**：文字轉點字、點字轉文字、數學點字、文件整理支援拖曳或點選開啟 TXT／DOCX／ODT／RTF／PDF；亦可開啟先前匯出的 HTML 校對檔繼續修編
- **校對存檔**：文字轉點字、點字轉文字的手動修正紀錄自動暫存於本機（localStorage），可匯出含 session 的 HTML 校對檔，在其他裝置重新開啟後繼續修編
- **面板比例調整**：文字轉點字、點字轉文字的輸入輸出區之間有可拖曳分隔線，自由調整寬度比例，比例存於瀏覽器本機
- **深色／淺色主題**：全部工具支援，設定存於瀏覽器本機

## 相關 NVDA 附加元件

以下為配合本工具集設計的 NVDA 螢幕閱讀器附加元件，需下載安裝於 Windows 桌面環境使用。

| 附加元件 | 說明 |
|----------|------|
| [六點輸入法 (6d-IME)](https://github.com/hurthuang/6d-IME) | 六點點字鍵盤多模式輸入，支援注音點字、comp8、UEB、Nemeth |
| [語音字典切換 (DictSwitcher)](https://github.com/hurthuang/NVDA-DictSwitcher) | 快速在一般修正、注音點字、數學點字字典間循環切換 |
| [國語字典查詢 (zhDict)](https://github.com/hurthuang/zhDict) | 選字查詢中文辭典（萌典）或英文字典，自動判斷語言 |
| [點字表切換 (brailleTableSwitcher)](https://github.com/hurthuang/NVDA-brailleTableSwitcher) | 快速切換注音點字、UEB G1／G2 輸出轉譯表 |
| [點字輸出匯出 (brailleExport)](https://github.com/hurthuang/NVDA-brailleExport) | 擷取點字顯示器畫面，匯出為 Unicode 點字或 BRF 檔案 |

## 技術說明

- 純前端實作，所有運算在瀏覽器本地執行，不傳送任何資料至伺服器
- 點字字型使用內附的 `SIMBRL.TTF`（SimBraille）
- 點字翻譯規則表採用 [liblouis](https://github.com/liblouis/liblouis) 格式，存放於 `table/` 目錄
- 注音點字轉換使用 [McBopomofoWeb](https://github.com/openvanilla/McBopomofoWeb) 引擎（MIT 授權）
- UEB G2 自訂縮寫引擎（`ueb-g2-rules.js`）與 liblouis 比對驗證，446 組測試全部通過

## 作者

黃偉豪 ／ [視覺障礙輔助科技筆記本](https://class.kh.edu.tw/19061) ／ [GitHub](https://github.com/hurthuang) ／ [Facebook 粉專](https://www.facebook.com/vi.tech.tw/)

## 授權

點字轉換規則表版權歸屬原始 liblouis 專案（LGPL）。
