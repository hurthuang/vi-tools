# 開啟 Word 考卷：注音、EQ 欄位、自動編號（2026-10-26）

國小考卷常整份加注音、選項用圈號、題號用自動編號。原本開啟 docx 只收 `w:t`，結果：
注音夾在國字前（`ㄗㄞˋ在`）、舊式注音欄位的國字不見（「會沉下去」→「會下去」）、
圈號欄位的 ① 不見、自動編號的題號不見（還跳提醒叫人改用複製貼上）。

## 開啟 docx（`shared.js` 的 `docxXmlToText`）
- `docxParagraphText`：逐節點走一段
  - `w:ruby` 只取 `w:rubyBase`，跳過 `w:rt`
  - 欄位（`w:fldChar` begin／separate／end + `w:instrText`、`w:fldSimple`）是 EQ 時換成 `evalWordEq` 的結果，丟掉舊的顯示結果；其他欄位（PAGE 等）照舊取顯示結果
  - `w:tab` → Tab、`w:br`／`w:cr` → 換行（勾選題、選項常用段落內換行分行）；表格儲存格內的換行改成空格，免得打斷 Tab 分隔的列
  - `mc:Fallback` 跳過（`mc:AlternateContent` 只取一份，原本會重複）
- `evalWordEq`：`\o` 疊字（有 `\s\up` 的是注音，丟掉取國字；`○` 疊 1～20 的數字換成 ①～⑳）、`\s` 上下標取內容、`\f(a,b)` → `a/b`、`\r` → `√`，其餘取內容；`\* ...` 格式開關先刪
- `makeDocxNumberer`：讀 `numbering.xml`、`styles.xml`（段落樣式帶的編號，沿 basedOn 找），照 `lvlText`、`numFmt` 算編號。計數以 abstractNum 為單位（不同 numId 指同一個 abstractNum 會接續編號，和 Word 一樣），`startOverride` 在該 numId 第一次出現時重設；`suff` 是 tab／space 時編號後加一個空格。項目符號（bullet）不輸出
- `w:sdt` 內容控制項會往裡讀（原本整個略過）

## 貼上的文字（`fixWordPlainText`，`cleanExamText` 第一步，也就是格式調整的「自動調整」）
- `○1`～`○20` → ①～⑳（Word 純文字的圈號欄位）
- `字(注音)` 出現 5 次以上才當成整份加注音並去掉括號注音；零星的可能是考題本身（例：看注音寫國字），不動

## 圈號選項換行（`cleanExamText`）
- ①～⑳ 和 (A)～(D) 一樣算選項（`OPT_START_RE`、`optKey`）：「選項換行」開著時每個選項一行，一組選項後空一行；關掉時同一組接在同一行
- 圈號前面是「～、和或至到」或後面接這些字時不拆（題幹裡的「①和③」「①～④」）
- 填填看的詞庫（①花瓣 ②花萼…）也會一個一行
- 開啟檔案時不排版，按格式調整的「自動調整」才會換行

## 驗證
用三份國小考卷（自然兩份 docx、國語 .doc 轉 docx）跑，和 Word「另存純文字」去掉注音後逐字比對：
內容相同，差別只有符號字型的 √（Word 純文字是私用區字元，這邊目前不輸出）、頁首頁尾的抬頭與頁碼（不讀，本來就不要）。
題號、①、EQ 注音的國字都對得上。

## 還沒做
- 符號字型（`w:sym`，Wingdings 的 √ 等）
- 圖片位置標記、.doc 提示
