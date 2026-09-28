#!/usr/bin/env python3
"""
Exporta el modelo de embeddings all-MiniLM-L6-v2 a ONNX (cuantizado INT8)
y copia su vocabulario WordPiece a los assets de Android.

Se ejecuta UNA VEZ en la PC de desarrollo (requiere internet solo en la PC):

    pip install -r tools/requirements.txt
    python tools/export_embedding_model.py

Salida:
    android/app/src/main/assets/embeddings/model.onnx
    android/app/src/main/assets/embeddings/vocab.txt
"""
from __future__ import annotations

import argparse
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "android" / "app" / "src" / "main" / "assets" / "embeddings"
MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=MODEL_ID, help="Modelo de Hugging Face (tokenizador WordPiece)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--no-quantize", action="store_true", help="Conservar pesos FP32 (≈90 MB)")
    args = parser.parse_args()

    from optimum.onnxruntime import ORTModelForFeatureExtraction, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig
    from transformers import AutoTokenizer

    args.out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        print(f"Exportando {args.model} a ONNX…")
        model = ORTModelForFeatureExtraction.from_pretrained(args.model, export=True)
        model.save_pretrained(tmp_path)
        tokenizer = AutoTokenizer.from_pretrained(args.model)
        tokenizer.save_pretrained(tmp_path)

        onnx_path = tmp_path / "model.onnx"
        if not args.no_quantize:
            print("Cuantizando a INT8 (ARM64)…")
            quantizer = ORTQuantizer.from_pretrained(tmp_path)
            qconfig = AutoQuantizationConfig.arm64(is_static=False, per_channel=False)
            quant_dir = tmp_path / "quantized"
            quantizer.quantize(save_dir=quant_dir, quantization_config=qconfig)
            onnx_path = next(quant_dir.glob("*.onnx"))

        vocab = tmp_path / "vocab.txt"
        if not vocab.exists():
            raise SystemExit("El modelo no usa un vocabulario WordPiece (vocab.txt); elige un modelo tipo BERT.")

        shutil.copy(onnx_path, args.out / "model.onnx")
        shutil.copy(vocab, args.out / "vocab.txt")

    size_mb = (args.out / "model.onnx").stat().st_size / 1e6
    print(f"Listo: {args.out} (model.onnx {size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
