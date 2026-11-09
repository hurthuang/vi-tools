r"""把 RapidOCR 附的 PP-OCRv6 small（偵測＋辨識）做 int8 動態量化，放到 models\ocr\（網頁版文字辨識用）。

用法：python tools\quantize-ocr.py <RapidOCR 的 models 資料夾（有 PP-OCRv6_det_small.onnx、PP-OCRv6_rec_small.onnx）>
要 onnxruntime（含 onnxruntime.quantization）與 onnx。量化工具會在原檔旁邊寫暫存檔，所以先複製到暫存資料夾再做。
字表（keys.txt）從原版 rec 模型的 metadata 取出。
"""
import shutil
import sys
import tempfile
from pathlib import Path

import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic

src = Path(sys.argv[1])
dst = Path(__file__).resolve().parent.parent / 'models' / 'ocr'
dst.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    for name, out, ops in (('PP-OCRv6_det_small.onnx', 'det.onnx', ['Conv']),
                           ('PP-OCRv6_rec_small.onnx', 'rec.onnx', ['MatMul', 'Gemm', 'Conv'])):
        t = Path(tmp) / name
        shutil.copy2(src / name, t)
        quantize_dynamic(str(t), str(dst / out), weight_type=QuantType.QUInt8, op_types_to_quantize=ops)
        print(name, round(t.stat().st_size / 2**20, 1), 'MB →', round((dst / out).stat().st_size / 2**20, 1), 'MB')
ch = ort.InferenceSession(str(src / 'PP-OCRv6_rec_small.onnx')).get_modelmeta().custom_metadata_map['character'].split('\n')
(dst / 'keys.txt').write_text('\n'.join(ch), encoding='utf-8', newline='\n')
print('keys', len(ch))
