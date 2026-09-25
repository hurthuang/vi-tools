// findMath()：算式位置判斷（單個 $ 的 Pandoc 規則、數學點字頁自己的 MATH_RE），不需要啟動 app
// 網頁的 math-speech.js（數學點字、文件整理共用）
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
function extract(file) {
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('  function findMath(');
  const end = src.indexOf('  const hasMath =');
  if (start < 0 || end < start) return null;
  return new Function(src.slice(start, end) + '\nreturn findMath;')();
}

const cases = [
  // [輸入, 是否認單個 $, 預期找到的 tex]
  [String.raw`若 $x^2=16$，則 x=4`, true, ['x^2=16']],
  [String.raw`若 $x^2=16$，則 x=4`, false, []],
  ['售價 $100 和 $200 元', true, []],
  ['售價 $100 和 $200 以及 $x$', true, ['x']],
  [String.raw`花了 \$5 買 $a+b$`, true, ['a+b']],
  [String.raw`獨立 $$\frac{1}{2}$$ 算式`, true, [String.raw`\frac{1}{2}`]],
  [String.raw`獨立 $$\frac{1}{2}$$ 算式`, false, [String.raw`\frac{1}{2}`]],
  [String.raw`混合 \(a\)、\[b\]、$c$、$$d$$`, true, ['a', 'b', 'c', 'd']],
  ['$ x$ 開頭空白不算', true, []],
  ['$x $ 結尾空白不算', true, []],
  ['$x$5 後面接數字不算', true, []],
  ['跨行 $x\n+y$ 不算', true, []],
  ['n 階乘 $n!=120$。', true, ['n!=120']],
  [String.raw`算式內有跳脫 $\$x$`, true, [String.raw`\$x`]],
  ['空的 $$$$ 不算', true, []],
];

export default {
  name: 'findMath 算式判斷規則',
  needsApp: false,
  async run({ check }) {
    const web = extract(join(here, '..', '..', '..', 'math-speech.js'));
    check('math-speech.js 裡找得到 findMath', !!web);
    for (const [text, dollar, want] of cases) {
      const label = `${JSON.stringify(text)}${dollar ? '（認 $）' : ''}`;
      if (web) {
        const got = web(text, { dollar }).map(m => m.tex);
        check(label, JSON.stringify(got) === JSON.stringify(want), `得到 ${JSON.stringify(got)}，預期 ${JSON.stringify(want)}`);
      }
    }
    // 數學點字頁用自己的 MATH_RE（和轉點字一致）：\( \) 與單個 $（它的 $ 規則沒有金額判斷）
    if (web) {
      const nc = readFileSync(join(here, '..', '..', '..', 'nemeth_converter.html'), 'utf8').match(/var MATH_RE=(\/.*\/g);/);
      if (check('nemeth_converter.html 裡找得到 MATH_RE', !!nc)) {
        const MATH_RE = eval(nc[1]);
        const got = web(String.raw`設 \(x^2\) 與 $y+1$。`, { pattern: MATH_RE }).map(m => m.tex);
        check('網頁：用頁面的 MATH_RE 找算式', JSON.stringify(got) === JSON.stringify(['x^2', 'y+1']), JSON.stringify(got));
        check('網頁：用頁面的 MATH_RE 時 pattern 不會被改動（lastIndex 仍為 0）', MATH_RE.lastIndex === 0);
      }
    }
  },
};
