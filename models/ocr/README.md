# 文字辨識模型（網頁版）

網頁裡辨識圖片上的文字（`ocr-web.js`、`ocr-worker.js`）用的模型，用到才下載，存在瀏覽器快取。沒有本機的 vi-tools 辨識套件時用。

## 來源與授權

- 模型：PaddleOCR 的 PP-OCRv6 small（文字偵測 `PP-OCRv6_small_det`、文字辨識 `PP-OCRv6_small_rec`），
  Copyright Baidu／PaddlePaddle Authors；ONNX 版由 RapidOCR 轉換（RapidOCR 3.10.0 附的 `PP-OCRv6_det_small.onnx`、`PP-OCRv6_rec_small.onnx`）。
- 授權：Apache License 2.0，全文在 `LICENSE-Apache-2.0.txt`（RapidOCR 附的那份）。
- 原始檔 SHA-256（RapidOCR 的 MODEL_LICENSES.md）：
  - `PP-OCRv6_det_small.onnx`：`090f04abcd9d9a7498bc4ebf677e4cb9bdce1fe4197ddb7e529f1ef44e1ff94f`
  - `PP-OCRv6_rec_small.onnx`：`6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884`

## 改過的地方（Apache-2.0 第 4 條要求註明）

這裡的檔案**不是原檔**，是 vi-tools 改過的：

- `det.onnx`、`rec.onnx`：int8 動態量化（onnxruntime 1.31.1 `quantize_dynamic`，QUInt8；det 量化 Conv，rec 量化 MatMul、Gemm、Conv），做法見 `tools/quantize-ocr.py`。det 9.5 MB → 2.6 MB、rec 20.3 MB → 5.3 MB。
  - `det.onnx` SHA-256：`d1de8192b9c8c0e68a4c341605604b76b7c18d15b0e6167624f49e1e484f7cdb`
  - `rec.onnx` SHA-256：`90cc15baad23ceabf06a4b92b7976ea7158c43d66aee9d38bb72b52f7ff2b0aa`
- `keys.txt`：從原版 rec 模型的 metadata（`character`）取出的字表，一行一個字，共 18,708 個；程式前面加 blank、後面加空白。
- `s2t.txt`（vi-tools 加的，不是 PaddleOCR／RapidOCR 的檔）：「只有簡體才有的字 → 繁體（台灣字形）」2,626 組，簡繁兩兩一組接成一行。`ocr-worker.js` 載入字表時把這些字換掉（模型偶爾把繁體認成簡體：则、温、会、内；試卷不會有簡體字）。由 `tools/build-ocr-s2t.py` 從 OpenCC（https://github.com/BYVoid/OpenCC ，Apache-2.0）的 STCharacters、TSCharacters、TWVariants 產生：繁體候選含它自己的字（里、台、后、干）和本身是繁體的字不換。

## 準確度（2026-11-08 試驗，E:\Project\agy-work\20261108-ocr-web）

19 份國中數學試卷第 1 頁（200 DPI），中文字跟 PDF 文字層比：

| | 中文召回 | 中文精確 | 英數召回 |
|---|---|---|---|
| RapidOCR 原版模型、不做方向分類（Python） | 99.1% | 98.9% | 97.5% |
| 網頁版、原版模型 | 98.9% | 98.9% | 97.2% |
| 網頁版、這裡的量化模型 | 98.5% | 98.8% | 95.7% |
| **網頁版、量化模型＋簡體換繁體（s2t.txt）** | **98.9%** | **99.2%** | **95.7%** |

網頁版跟 RapidOCR 不一樣的地方：文字框一律當成水平的長方形、不做方向分類（RapidOCR 的方向分類會把正常的行誤判成顛倒，關掉反而比較準）。單執行緒一頁約 13 秒。
