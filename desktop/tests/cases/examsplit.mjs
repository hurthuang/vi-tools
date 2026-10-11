// exam-split.js：試卷分段規則（不需要啟動 app）。範例取自會考 NVDA 試題本 docx 與會考 PDF 經文件整理抽出的文字格式
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default {
  name: '試卷分段規則',
  needsApp: false,
  async run({ check }) {
    const S = createRequire(import.meta.url)(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'exam-split.js'));
    const labels = (t, o) => S.split(t, o).map(s => s.label);
    const whole = (t, o) => S.split(t, o).map(s => t.slice(s.start, s.end)).join('') === t;
    const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `得到 ${JSON.stringify(got)}，預期 ${JSON.stringify(want)}`);

    // NVDA 試題本：第N題、全形選項、題組提示行、大標題併入下一段、本題視障生不作答
    const docx = `115年國中教育會考 國文科 NVDA試題本
一、單題：（1至2題）
第1題 下列文句中的「即」字，何者為「靠近」之意？
(Ａ)立即
(Ｂ)若即若離
第2題 本題視障生不作答
二、題組：（3至4題）
請閱讀以下短文，並回答3及4題：
從前有一座山。
第3題 根據本文，下列何者正確？
(Ａ)甲
(Ｂ)乙
第4題 承上題，何者錯誤？
(Ａ)丙
(Ｂ)丁
第5及6題 本題組視障生不作答
`;
    same('NVDA 試題本：說明、題目、選項、題組', labels(docx),
      ['說明', '第1題_題目', '第1題_選項', '第2題', '第3至4題_題組', '第3題_題目', '第3題_選項', '第4題_題目', '第4題_選項', '第5至6題_題組']);
    check('NVDA 試題本：所有段接起來等於原文', whole(docx));
    const segs = S.split(docx);
    check('大標題「一、單題」併入第1題', docx.slice(segs[1].start, segs[1].end).startsWith('一、單題'));
    check('大標題「二、題組」併入題組文章', docx.slice(segs[4].start, segs[4].end).startsWith('二、題組'));

    // PDF：1. 題號；開頭注意事項的 1. 2.、文章裡的編號清單、題目裡的編號都不是題目；選項是圖片抽不出來時照題號順序認
    const pdf = `注意事項：
1.所有試題均為選擇題。
2.題組是指共用問題情境的數道試題。
1.下列何者正確？
(A)甲(B)乙(C)丙(D)丁
2.圖中哪一個是三角形？
3.閱讀下列條件：
1.條件一
2.條件二
哪些成立？
(A)1(B)2
(20-21)
1. Boil a pot of water.
2. Put the teabags in.
20.What should we do first?
(A)Boil(B)Cut
21.Which is correct?
(A)Yes(B)No
`;
    same('PDF：注意事項、文章與題目裡的編號清單不算題目；選項抽不出來的題目照順序認', labels(pdf),
      ['說明', '第1題_題目', '第1題_選項', '第2題', '第3題_題目', '第3題_選項', '第20至21題_題組', '第20題_題目', '第20題_選項', '第21題_題目', '第21題_選項']);
    check('PDF：所有段接起來等於原文', whole(pdf));

    // 其他題組寫法
    same('題組提示行：回答第 44 至 45 題、回答42～43題', labels(`閱讀下列選文，回答第 44 至 45 題：
文章
第44題 問？
(Ａ)a
第45題 問？
(Ａ)b
閱讀下列敘述後，回答46～47題
文章
第46題 問？
(Ａ)c
第47題 問？
(Ａ)d
`), ['第44至45題_題組', '第44題_題目', '第44題_選項', '第45題_題目', '第45題_選項', '第46至47題_題組', '第46題_題目', '第46題_選項', '第47題_題目', '第47題_選項']);

    // 非選擇題：大標題之後題號從 1 重新開始，沒有選項的題目只叫「第N題」
    same('非選擇題：大標題後題號從 1 開始', labels(`1.選擇？
(A)甲(B)乙
2.選擇？
(A)甲(B)乙
第二部分：非選擇題
1.請寫出算式。
2.請說明理由。
`), ['第1題_題目', '第1題_選項', '第2題_題目', '第2題_選項', '第1題', '第2題']);

    // 手動分割記號
    const mk = `期中考
=== 第一大題
1 請問甲是什麼
A 甲 B 乙
===
2 下列何者
`;
    const m = S.split(mk, { auto: false });
    same('只用記號切：記號後的名稱當檔名，沒有名稱叫「分段」', m.map(s => s.label), ['說明', '第一大題', '分段']);
    same('只用記號切：記號那行不念', m.map(s => mk.slice(s.speakStart, s.end)), ['期中考\n', '1 請問甲是什麼\nA 甲 B 乙\n', '2 下列何者\n']);
    check('只用記號切：所有段接起來等於原文', whole(mk, { auto: false }));
    same('自動判斷也認記號', labels(`第1題 問？
(Ａ)a
=== 補充說明
這是補充。
第2題 問？
(Ａ)b
`), ['第1題_題目', '第1題_選項', '補充說明', '第2題_題目', '第2題_選項']);
    check('isMarker', S.isMarker('===') && S.isMarker('  ＝＝＝ 名稱') && !S.isMarker('==') && !S.isMarker('a === b'));
    same('沒有題號的一般文章：整篇是「說明」', labels('這是一篇文章。\n第二段。\n'), ['說明']);
    same('空白文字', labels(''), ['說明']);
  },
};
