# 樂理及基礎和聲（音樂班術科）

2026-11-03 開始（分支 `music-theory`）。需求：用 vi-tools 製作「樂理及基礎和聲」試題（高級中等學校音樂班特色招生聯合術科測驗，
樣本是 `E:\Project\materials\music\音樂班` 的 115 學年度試題與解答）。使用者不是音樂科班，規則照 BANA《Music Braille Code 2015》
與一般和聲學教本，樂理運算以 music21 核對。

試題的四大題：常識（文字選擇題）、樂理（看譜例：方框、箭頭、括號）、和聲（寫調性與級數含轉位、照數字低音寫四部和聲）、欣賞（聽音樂）。
文字題與欣賞題原本的工具就做得到；這個分支補的是看譜與和聲的部分。

## 樂理練習（music/theory.html，`#music-theory`）
- `js/theory.js`（`MB.theory`）：音程、和弦（性質、轉位、級數、副屬和弦）、音階、調號、移調樂器、等音。用語照臺灣課本：完全／大／小／增／減，
  原位／第一轉位…，級數大寫＝大三、增三，小寫＝小三、減三，° 減、ø 半減、+ 增；小調依和聲小音階（自然、旋律小音階的音也算調內）
- `js/theory-quiz.js`（`MB.theoryQuiz`）：九種題型四選一，每題附解說與 ABC 譜例；`seed()` 可固定亂數
- `js/theory-page.js`：數字鍵 1–4 作答、N 下一題、P 播放；譜例轉成點字樂譜時拿掉拍號與小節號（題目只有音），調號題只留調號；
  級數選項的 aria-label 用 `speakRoman`（「五級大寫 六五」），報讀軟體不會把 V65 念成六十五
- 測試：`node music/tests/theory-test.js`（每種題型兩種難度各 300 題）；music21 核對：
  `node music/tests/theory-cases.js > cases.json` 再 `python music/tests/theory_m21.py cases.json`（music21 只裝在暫存 venv，不進 repo）。
  2026-11-03：和弦 400、級數 400 全部一致；音程 600 題只差三增、三減這種不命名的
- music21 的級數寫法和臺灣課本不同（小調的 VI 寫 bVI、V7 寫 V75#3），所以級數只比「級數＋轉位」

## 四部和聲檢查（music/harmony.html）
- `js/harmony-check.js`（`MB.harmony`）：一行一個和弦「S A T B」，可加 `[6/4]` 數字低音和自己標的級數
- 錯誤：平行／反向五八度（含同度）、聲部交錯、S–A、A–T 超過八度、不是三和弦或七和弦、七音重複、屬和弦導音重複、
  外聲部導音沒解決（V/vii° → I/vi）、七音沒有下行級進（保留也可以）、增音程進行、跳超過八度、數字低音不合、級數標錯
- 注意：隱伏五八度（外聲部同向、高音部跳進）、減五到完全五（含低音部）、聲部超越、七度跳進、內聲部導音沒上行、音域、省略五音、四六和弦沒重複低音
- 級數寫法都認得：V6/5、V⁶₅、Ⅴ65、V2（= V42）、viio、V/V
- 點字：`toAbc` 轉成四個聲部（每 4 個和弦一小節，最後不滿的小節改拍號，不補休止符），用轉換器的合唱格式（Sec. 37）
- 測試：`node music/tests/harmony-test.js`；平行／反向以 music21 `VoiceLeadingQuartet` 核對：
  `node music/tests/harmony-test.js --cases > hcases.json` 再 `python music/tests/harmony_m21.py hcases.json`（18000 對聲部全部一致）。
  music21 的 parallelOctave 把八度→十五度的反向進行也算進去，所以比「連續完全音程」與「其中反向的」兩項

## 點字樂譜轉換器：數字低音、級數分析、譜例方框
ABC 寫法（`abc-parse.js` 的 `specialAnnotation`，abcjs 五線譜照常顯示文字）：
- 數字低音 `"_6"`、`"_6/4"`（上下疊由上往下寫）、`"_#"`、`"_7 #"`（同一個音兩組）→ `ev.figures = [[{num, acc}]]`（每組由上到下）
- 級數分析 `"_V65"`、`"_vii°7"`、`"_V7/V"`、`"_Ab:I"`（開頭加調）→ `ev.analysis`
- 譜例方框 `"^[A"`…`"^A]"`、`"^[A]"` → `ev.markStart`／`ev.markEnd`

點字（`braille-write.js`）：
- 數字低音：水平式（Par. 30.2），單聲部開頭寫一次 ⠰⠜、鋼琴左手以 ⠰⠜ 取代左手記號；每組前面 ⠼、下位點、由最低的寫起；
  升降在數字前面，單獨的升降後面加 ⠅；數字後面接斷奏等記號時加 ⠤（30.2.5）。垂直式（30.3）沒做
- 級數分析（Par. 30.4）：只做單聲部（多聲部會提醒）。音樂下面一行，羅馬數字第一個字母在音名那一方正下方（`renderEvent` 記下 `ctx.noteAt`），
  大寫記號只寫一個、小寫每個都寫 ⠰；調在邊界；小節之間用特殊小節線 ⠇（Par. 1.10.2），分析比音樂長時音樂行補空格、七格以上加引導點；
  段落之間空一行。排法對照 Example 30.4-1（`tests/exam-test.js`）
- 譜例方框：BANA 沒有「試題方框」的規定，用 Par. 1.13.1 的譜表上方方括號 ⠰⠂…⠐⠆ 標範圍，名稱比照排練記號（Par. 24.2）寫在文字記號之間、保留大寫：
  ⠜⠠⠁⠜⠰⠂…⠐⠆；重疊的第二層用 ⠰⠰⠂…⠐⠆⠆。試卷要在轉譯者說明交代這個記號
- `exam-marks.js`：每個方框的文字說明（「方框 A：第 1 小節第 1 拍到第 4 拍，4 個音：C5、D5、E5、升 F5」），轉換器的「譜例方框」區列出，可複製
- 讀回：braille-parse 認得 ⠰⠜ 與數字低音、方框、級數分析行（音樂行裡 ⠇ 是小節分隔，其他空格讀成同一小節）；abc-write 寫回 ABC；
  MusicXML 匯入 `<figured-bass>`、`<harmony><numeral>`、`<function>`、譜表下方的羅馬數字文字，匯出 `<figured-bass>` 與譜表下方文字

## 文字轉點字：樂譜區塊（braille-translate.htm）
- 「🎼 樂譜區塊」插入 `【樂譜】`…`【/樂譜】`，中間寫 ABC（可省略 X:），輸出換成點字樂譜，每行方數照「每行方數」
- 做法：`_extractMusicBlocks` 把整個區塊換成等長的一行私用區佔位字元（U+E0A0 + 區塊編號 U+E0B0+k + U+E0A1…），原文位置不變；
  render 產生 token 時遇到佔位行，換成點字樂譜的各行（`isMusic`、`isCustom`）。轉換器的 js 第一次用到才載入（`music/js/`）
- 中文點字裡夾點字樂譜要不要加樂譜開始／結束記號，台灣沒有找到規定；目前樂譜區塊自成幾行，不加

## 讀 PDF：Wingdings 2 圈號（shared.js `vitoolsFixPdfSymbols`）
試題的選項 ①②③④ 是 Word 用 Wingdings 2 插入的，pdf.js 抽出 U+F075–U+F078（字型名稱 `…+Wingdings2`），文件整理原本會把它們吃掉，選項黏在一起。
`getOperatorList()` 之後用 `page.commonObjs.get(fontName).name` 查字型，換成 ①–④（對照解答確認），U+F079–F07E 照順序當 ⑤–⑩（沒有實例驗證）。
文件整理與共用的「開啟檔案」都會做。

## 還沒做
- 多聲部（鋼琴、合唱）的級數分析行；數字低音垂直式（Par. 30.3）
- 樂理術語題（速度、表情、力度術語）：題庫要另外核對（可交給 agy 交叉比對）
- 115 學年試題的譜例要從 PDF 重打成 ABC 或 MusicXML（譜例是圖片）
