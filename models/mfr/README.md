# 算式辨識模型（網頁版）

網頁裡「框一個算式 → LaTeX」用的模型（`mfr-web.js`、`mfr-worker.js`），用到才下載，存在瀏覽器快取。

- 來源：Pix2Text MFR 1.5（https://huggingface.co/breezedeus/pix2text-mfr-1.5 ，onnx 版），TrOCR 架構。
- 授權：MIT License，Copyright (c) 2022 BreezeDeus（全文在下面）。
- 這裡的兩個 onnx 是 int8 動態量化版（onnxruntime 1.31 `quantize_dynamic`，MatMul／Gemm，QUInt8），做法見 `tools/quantize-mfr.py`。
  - encoder 83 MB → 23 MB、decoder 30 MB → 10 MB。
  - 19 份國中數學試卷 2,976 個算式：跟原版一字不差 92%，拿人工打字的答案判斷，原版對、量化錯 31 個，量化對、原版錯 23 個（2026-11-08 試驗，E:\Project\agy-work\20261108-mfr-web）。
- `tokenizer.json`：原版的 tokenizer（ByteLevel BPE），網頁只用來把 token 轉回字。
- 沒有附算式偵測模型（MFD）：網頁版只辨識使用者框好的一個算式。

```
MIT License

Copyright (c) 2022 BreezeDeus

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
