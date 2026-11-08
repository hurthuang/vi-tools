r"""把 Pix2Text MFR 1.5 的 onnx 做 int8 動態量化，放到 models\mfr\（網頁版算式辨識用）。

用法：python tools\quantize-mfr.py <原版 MFR 資料夾（有 encoder_model.onnx、decoder_model.onnx、tokenizer.json）>
要 onnxruntime（含 onnxruntime.quantization）與 onnx。量化工具會在原版旁邊寫暫存檔，所以先複製一份到暫存資料夾再做。
"""
import shutil
import sys
import tempfile
from pathlib import Path

from onnxruntime.quantization import QuantType, quantize_dynamic

src = Path(sys.argv[1])
dst = Path(__file__).resolve().parent.parent / 'models' / 'mfr'
dst.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    for name in ('encoder_model', 'decoder_model'):
        t = Path(tmp) / (name + '.onnx')
        shutil.copy2(src / (name + '.onnx'), t)
        out = dst / (name + '_int8.onnx')
        quantize_dynamic(str(t), str(out), weight_type=QuantType.QUInt8, op_types_to_quantize=['MatMul', 'Gemm'])
        print(name, t.stat().st_size // 2**20, 'MB →', out.stat().st_size // 2**20, 'MB')
shutil.copy2(src / 'tokenizer.json', dst / 'tokenizer.json')
