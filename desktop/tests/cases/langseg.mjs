// lang-segments.js：中英切段規則（不需要啟動 app）
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default {
  name: '中英切段規則',
  needsApp: false,
  async run({ check }) {
    const L = createRequire(import.meta.url)(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'lang-segments.js'));
    const en = (t, n) => L.split(t, { minWords: n }).filter(s => s.lang === 'en').map(s => s.text);
    const cases = [
      // [文字, 切換條件, 預期的英文段]
      ['請開啟 Microsoft Word 檔案', 2, ['Microsoft Word']],
      ['我們用 NVDA 讀 PDF 檔', 2, []],                         // 單獨的縮寫留給中文語音
      ['我們用 NVDA 讀 PDF 檔', 1, ['NVDA', 'PDF']],
      ['支援 Windows 10 Pro。', 2, ['Windows 10 Pro']],          // 夾數字
      ['Hello everyone, 大家好', 2, ['Hello everyone,']],        // 後面緊接的標點跟著英文段
      ["It's a test.", 2, ["It's a test."]],                     // 撇號
      ['沒有英文', 2, []],
      ['2024 年', 1, []],                                        // 單獨的數字不算英文
    ];
    for (const [text, n, want] of cases) {
      const got = en(text, n);
      check(`「${text}」（${n === 1 ? '每個英文字' : '兩個以上英文單字'}）`, JSON.stringify(got) === JSON.stringify(want), `得到 ${JSON.stringify(got)}，預期 ${JSON.stringify(want)}`);
    }
    const all = L.split('中 Hello world 文', { minWords: 2 });
    check('切出來的段接回去等於原文、相鄰不同語言', all.map(s => s.text).join('') === '中 Hello world 文' && all.every((s, i) => i === 0 || s.lang !== all[i - 1].lang), JSON.stringify(all));
  },
};
