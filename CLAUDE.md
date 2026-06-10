# 專案說明（Claude Code 自動載入）

## 專案性質
視障輔助工具集，以視覺障礙教學為核心目的。
GitHub：https://github.com/hurthuang/vi-tools
網址：https://hurthuang.github.io/vi-tools/

## UEB G2 規則整合（已完成，2026-06-10）

### 背景
- `braille-translate.htm`（bt）有按規則類別分組的勾選面板，讓初學者分批啟用 UEB G2 縮寫規則，資料表是自編的
- `UEB-g2-query.html`（query）有自寫 JS 引擎，逐條說明套用了哪條縮寫規則，教學用途
- 兩者與「直接丟 liblouis」的模式不同，以規則可見性為設計核心
- 目標：把兩個工具的規則資料整合為共用 JS，並與 liblouis 比對驗證正確率 ✓

### 相關檔案
- `ueb-g2-rules.js`：共用規則模組（G2_ALWAYS/WORD/…、blocking predicates、buildFilteredTables）
- `braille-translate.htm`：bt，已移除 inline G2_* 表，改用 ueb-g2-rules.js
- `UEB-g2-query.html`：query，GA/GN/GB/GME/GL/GW 已遷移至共用常數；Regression tab 已移除
- `reg-bt.html`：BT engine regression（428 liblouis ground truth，全部通過）
- `reg-test.html`：reg-bt.html 的 iframe 包裝（後台頁面，不在主導覽列）

### blocking predicates（ueb-g2-rules.js）
con/dis begword、ea groupsign、of/gh/here/there/those/ever/mother/one/under/had/st always、
th/wh/sh 跨複合詞邊界、跨前綴邊界、dis+c 細分（disco/discern 可縮；disc 字尾不縮）
