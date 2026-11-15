# 文字轉點字、點字轉文字：輸入與輸出對照（兩區連動）

2026-11-15 使用者要求：文字轉點字（t2b）、點字轉文字（b2t）的輸入框和輸出，要像版面整理一樣，點一下或游標移動時另一區跳到對應處。

共用的游標跟隨、底色層、Ctrl+J 在 `io-sync.js`（`vitoolsIoSync({ inId, outId, getMap })`，回傳 `find／mark／clear／select／refresh`）；各頁只負責算對應表 `[{ o0, o1, s0, s1 }]`。

## 行為

- 輸入框或點字輸出有焦點、游標移動（按鍵、點一下、選取）時，另一區捲到對應處，用橘色底標出對應的那段。
- **Ctrl+J**：焦點跳到另一區，選取對應的那段（報讀軟體會念出選到的內容）；原本那區用橘色底標出原位置。
- 輸出重排（打字、改每行方數、切換模式）、視窗大小或字級改變時，照目前游標重新對一次。

## 文字轉點字的對應表（braille-translate.htm）

- `render()` 排好版後呼叫 `_btSyncBuild(renderTokens, resultUnicode)`：照 renderTokens 逐段跟輸出字串核對，記下 `_btSyncMap = [{ o0, o1, s0, s1 }]`（輸出位置 ↔ 原文位置）。
  - 不採用 `_hiddenTrailingSpace`：自動換行拿掉行尾空方時，render() 找「最後一個空格 token」做標記，算式點字自己結尾帶空方時會標錯（例：`\(\angle ABC = 70°,\)` 剛好排到行尾）。改成直接比對輸出字串：token 的點字完全符合就照長度，少一個結尾空方就減一，都不符就算 0。
  - 低年級模式：srcStart 是前處理後的位置，經 `_lgCurrentRawMap` 換回原文（-1 是加出來的空格、空行，略過）。
  - 點字直接輸入（Ctrl+B）時 `syncBrailleDirectOutput` 把 `_btSyncMap` 設成 null：一字對一字。
  - 輸出 ASCII 顯示時一方一個字元，位置不變。
- `_btSyncFind(fromIn, a, b)`：找跟 [a, b) 重疊的段落，取聯集；游標在換行、空格這類沒有點字的地方，取同一行前一段（行首取後一段）。
- 底色（io-sync.js）：文字框沒有焦點時看不到選取範圍，所以在文字框上疊一層 `div.io-sync-ov`（同字型、同內距、文字透明、`pointer-events: none`、`aria-hidden`），只有 `<mark>` 有底色，捲動跟著文字框。

## 測過

- 112 鳳山 2b1、2b2 辨識文字（含算式），關閉、空行、空行空方三種低年級模式：輸出位置全部跟輸出字串核對相符；每 3 個字取一個原文位置 → 點字 → 原文，都回到原位置。
- 底色層與文字框的 scrollHeight 相同（Unicode、ASCII、字級 24px）。
- 在 index.html 裡（iframe）實際按 Ctrl+J 來回跳。

## 無法轉成點字的字元：按一下跳過去

- 輸出區下方 `#output-warn` 的每種字元是一個按鈕（`_showOutputWarning`，字元種類沒變就不重畫，免得 role=status 一直重念）。
- 按一下 `_btWarnJump`：在 `window._btOutUnicode`（render 的 Unicode 輸出，ASCII 顯示時位置相同）找第幾個，經 `_btSyncFind` 對回原文；同一段點字裡有好幾個時選原文裡對應的那一個。焦點移到輸入框、選取那個字，點字輸出標橘色底；`#output-warn-pos`（aria-live）顯示「第 n／N 個」。再按跳下一個，最後一個之後回到第一個。

## 同時修的（2026-11-15）

- **U+00A0 不斷行空格**當空格（shared.js `WIDE_SPACE_RE`），原本留在輸出裡被警告。
- **電腦八點模式的手打 ASCII 點字**（中文夾 Nemeth，以前手打的點字試卷）：用空格或中文隔開、全是 ASCII、有點字專用符號（`" ~ { } | ` ^ @ _` 或 `#數字`）的一段，整段一字對一方（`_isAsciiBrlChunk`、`_asciiBrlToUnicode`，`BR_TO_ASCII` 反查，大寫字母同小寫）。原本 `"` 被當成引號（中文行 ⠦⠦／⠴⠴），`#42` 變成 ⠼ ⠼⠙⠃（多一個數符、上位數字），應該是 ⠐、⠼⠲⠆。中文句子裡的數字（每題 4 分）、題號、`(A)` 這類沒有點字專用符號的照舊；其他英文點字模式不受影響。

## 點字轉文字的對應表（braille-to-text.html）

- `doConvert` 每行的 token 經 `_b2tAlignLine` 複製一份（`_convertLine` 的 token 是快取共用的），照順序在這一行找自己的點字記下 `s0／s1`；中文標點的點字是反推的，可能跟原文不同，往後最多找 6 格，對不上的補成前後兩段之間的點字。
- `_buildOutputFromTokens` 組輸出時記 `o0／o1`，存 `_b2tSyncMap`、`_b2tOutBuilt`（雙視區改字也會重算）。
- UEB 段點字詞數跟 liblouis 反向翻譯的字數不同（`grpBad`）：整段一筆。
- 輸出被格式調整改過（`output-text` 跟 `_b2tOutBuilt` 不同）：行數相同時一行對一行，不同就不標。
- 測過：說明頁 80 段中文（文字轉點字轉出 12,764 方）貼進點字轉文字，3,664 段全部對得到；每 5 字取一個輸出位置往返都回原位置、行號都對；Unicode／ASCII 顯示、Ctrl+J 來回。

## 還沒做

- 格式調整區、題號排版不連動。
