# 點字樂譜轉換器

ABC 記譜與點字樂譜（BANA *Music Braille Code, 2015*）雙向轉換，並可預覽五線譜、MIDI 試聽、語音報讀。
對象是國中小階段的樂譜：單聲部旋律、鋼琴雙手、和弦。

## 使用

直接用瀏覽器開啟 `index.html` 即可，不需要安裝。
五線譜顯示與播放使用 CDN 上的 abcjs，播放音色也要從網路下載，所以這兩項功能需要連網；ABC 與點字的轉換可以離線使用。

- 左邊輸入 ABC，右邊自動產生點字；在右邊輸入或貼上點字（Unicode ⠿ 或 BRF 皆可），左邊自動產生 ABC。
- 點五線譜上的音符，或在任一編輯區移動游標，三邊會同步標示同一個音。
- 「六點輸入」：用 F D S J K L 同時按下輸入一方（需英文輸入法）。
- 可下載 `.abc`、`.brf`（ASCII 點字，可送點字印表機或點字顯示器）、`.musicxml`、`.mid`。
- 「開啟檔案」可讀入 ABC、點字（`.brf`）與 MusicXML（`.musicxml`、`.xml`、壓縮的 `.mxl`），例如 MuseScore、BME 匯出的檔案。
- 五線譜可匯出成 SVG 向量圖、PNG 圖片，或列印、存成 PDF。

## MusicXML

- 匯出：單聲部為一個 part、一行譜表；鋼琴為一個 part、兩行譜表（大譜表）。可用 MuseScore、BME、Finale、Sibelius 開啟。
- 匯入：預設轉換第一個聲部（part），檔案有多個聲部時工具列會出現「聲部」選單可切換（例如藝術歌曲的人聲或鋼琴伴奏）；有兩行譜表的聲部當作鋼琴右手、左手。只有休止符的聲部（MuseScore 常見）會自動忽略。
- 打譜軟體為了換行而拆開的小節（看不見的小節線＋不計小節數的後半）會合併回同一小節；多聲部小節中較短的聲部會補足休止符。
- 音高以 `<alter>` 為準（調號不影響它）；與調號、臨時記號推算的結果不同時，自動補上點字所需的臨時記號。
- 隱藏的休止符若在第一小節開頭或任一小節結尾，視為排版補位而略過；其餘隱藏的音保留時間，當作休止符。
- 跨譜表的和弦會分到各自的譜表；多組拍號（如 3/8+2/8）以合計的拍號表示。
- 不支援的內容（歌詞、和弦名稱、文字表情、第三行以後的譜表、微分音、倍全音符、巢狀連音、特殊比例的連音）會在「轉換訊息」列出。

## 點字格式

- 單聲部：single-line format（Par. 24.1），每段開頭有小節號，續行內縮兩方。
- 兩個聲部（ABC 的 `V:`）：視為鋼琴右手、左手，使用 bar-over-bar format（Par. 29.3），右手音程向下、左手音程向上。
- 預設每行 40 方，可在「轉換設定」調整。

## 支援範圍

支援：音符、休止符、附點、八度記號規則、臨時記號、調號、拍號、速度、小節線、反覆與房號、連結線、圓滑線、三連音與其他連音（含連續三連音 `⠆⠆`）、和弦（音程）、鋼琴雙手、in-accord（ABC 的 `&`）、力度、漸強／漸弱、斷奏、重音、持音、延長記號、音符分組（Par. 8.1）、大小時值記號（Par. 2.4）、整小節重複記號。

被反覆記號、複縱線或房號拆成兩半的小節（例如有弱起的曲子在反覆處）會辨識為同一小節，點字以音樂連字號連接（Par. 17.1），小節編號不重複計算。

另外支援：指法（含換指，Par. 15）、倚音（長、短，Par. 16.2）、顫音、上下漣音、迴音（Par. 16.3–16.5）、琶音、踏板（踩下、放開、換踏板，Par. 29.10）、Segno、Coda、Fine、D.C.、D.S.（Par. 20）。播放與 MIDI 會依反覆、房號、D.C.、D.S.、Fine、Coda 的實際演奏順序展開。

尚未支援：歌詞、和弦名稱、文字表情、點字的其他重複縮寫、分頁與頁碼、內含音符數與連音數不同的連音（例如三連音裡放四個不同時值的音）。

## 已知限制

- 點字單行格式不記載譜號；讀入單聲部點字時，和弦音程方向預設向下（高音譜），低音譜的樂曲請在「轉換設定」選「向上」。
- 點字不含曲名等文字（文字點字屬於另一套規則）；從點字轉回 ABC 時會沿用目前的曲名。

## 程式結構

| 檔案 | 內容 |
|---|---|
| `js/brf.js` | BRF 與 Unicode 點字互轉、點位工具 |
| `js/model.js` | 內部音樂模型與共用工具 |
| `js/durations.js` | 點字時值判讀（同一符號代表兩種時值、音符分組） |
| `js/abc-parse.js` / `js/abc-write.js` | ABC ⇄ 模型 |
| `js/braille-write.js` / `js/braille-parse.js` | 模型 ⇄ 點字 |
| `js/xml.js` / `js/musicxml.js` | XML 解析、MusicXML ⇄ 模型、.mxl 解壓 |
| `js/describe.js` | 語音報讀的中文描述 |
| `js/app.js` | 網頁介面 |

## 測試

```
node tests/run.js                 # 單元測試
node tests/batch.js <資料夾>       # 批次測試資料夾內所有 .abc / MusicXML（含子資料夾）
```

批次測試會逐一讀入、轉點字再讀回、轉 MusicXML 再讀回、轉 ABC 再讀回，並比對音樂內容是否一致。
MusicXML 有多個聲部時，可加 `--part piano`（第一個有兩行譜表的聲部）或 `--part N`。

開發時用過的真實樂譜抽樣（皆可公開取得）：OpenScore 藝術歌曲（CC0，經 When-in-Rome 專案的 MusicXML 版本）、弦樂四重奏、The Session 愛爾蘭民謠 ABC。`tests/fixtures/openscore-lied.mxl` 為其中一首（舒伯特〈磨坊少年與小溪〉，CC0）。

### 與 music21 標準答案比對

music21 的點字測試收錄了《Introduction to Braille Music Transcription》的 153 組例題與標準答案，可用來檢驗點字是否正確（而不只是來回一致）：

```
python -m venv m21env
m21env/Scripts/python -m pip install music21
m21env/Scripts/python tests/m21_export.py <輸出資料夾>   # 匯出各題 MusicXML 與答案
node tests/m21-compare.js <輸出資料夾> --show 20          # 比對並列出差異
```

### 檢驗 MusicXML 匯入

以 music21 讀取同一份 MusicXML 作為參考，逐小節比對每個音的起始時間、音高與時值（適合搭配 LilyPond 的 MusicXML 測試套件，MIT 授權）：

```
m21env/Scripts/python tests/mx_reference.py <MusicXML 資料夾> ref.json
node tests/mx-compare.js <MusicXML 資料夾> ref.json --show
```

注意：該教材依據較舊的規則版本，少數題目（如音符分組、圓滑線交會）與 2015 版規則不同；部分題目使用 music21 的非預設選項（如顯示譜號、長圓滑線不用括號）。

測試資料包含規範 PDF 中的點字範例（逐字比對與來回轉換），以及各個內建範例。

### 與 MuseScore、BME 的點字輸出比對

把要比對的曲子放在同一個資料夾，用主檔名對應：

| 檔案 | 說明 |
| --- | --- |
| `曲名.musicxml`（或 `.xml`、`.mxl`、`.abc`） | 原始樂譜（必要） |
| `曲名.musescore.brf` | MuseScore 匯出的點字；沒有時，若電腦裝了 MuseScore 4，會自動用命令列產生 |
| `曲名.bme.brf` | BME 匯出的點字（選用，請在 BME 開啟同一份 MusicXML 後匯出 BRF） |

```
node tests/compare3.js <資料夾> [--part piano|N] [--show]
```

程式會先去掉排版差異（標題、小節號、手號或譜號、換行位置），再逐小節比較，並在資料夾內產生「比對報告.html」：

- 紅色：音高或時值不同，請優先檢查。
- 黃色：只差八度記號（不在行首）。
- 藍色：指法、表情、踏板、漸強漸弱位置、同時進行聲部（in-accord）的先後順序等寫法不同。
- 無底色：只因換行位置不同而多（少）一個八度記號，屬正常。

已知 MuseScore 的寫法差異：不輸出踏板記號；漸弱結束記號（⠜⠲）的位置有時與原譜不符；in-accord 聲部的先後順序與本工具不同。
