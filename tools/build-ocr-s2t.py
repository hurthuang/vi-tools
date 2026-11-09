r"""產生 models/ocr/s2t.txt：網頁版文字辨識的「只有簡體才有的字 → 繁體（台灣字形）」對照。

文字辨識模型（PP-OCRv6）偶爾把繁體字認成簡體（则、温、会、内），試卷裡不會有簡體字，
ocr-worker.js 載入字表時直接把這些字換成繁體（辨識時不用多花時間）。

規則（OpenCC 的字表，Apache-2.0）：
  - STCharacters 有、對應的繁體候選裡不含它自己（含自己的像 里、台、后、干 是繁體也在用的字，不換）；
  - 不是 TSCharacters 的繁體字；
  - 在 OCR 的字表 keys.txt 裡；
  - 換成第一個候選，再照 TWVariants 換成台灣字形。
s2t.txt 格式：簡繁兩兩一組接成一行（「则則温溫…」），UTF-8。

用法：python tools/build-ocr-s2t.py <OpenCC 的 data/dictionary 資料夾>
  （STCharacters.txt、TSCharacters.txt、TWVariants.txt，取自 https://github.com/BYVoid/OpenCC）
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OCR = ROOT / 'models' / 'ocr'


def load(d, name):
    m = {}
    for ln in (d / (name + '.txt')).read_text(encoding='utf-8').splitlines():
        if ln and not ln.startswith('#'):
            a, b = ln.split('\t')
            m[a] = b.split(' ')
    return m


def main():
    d = Path(sys.argv[1])
    st, ts, tw = load(d, 'STCharacters'), load(d, 'TSCharacters'), load(d, 'TWVariants')
    keys = set((OCR / 'keys.txt').read_bytes().decode('utf-8').split('\n'))
    out = {}
    for c, cand in st.items():
        if len(c) != 1 or c in cand or c in ts or c not in keys:
            continue
        t = tw.get(cand[0], [cand[0]])[0]
        if t != c:
            out[c] = t
    (OCR / 's2t.txt').write_bytes(''.join(a + b for a, b in sorted(out.items())).encode('utf-8'))
    print(len(out), '組')


if __name__ == '__main__':
    main()
