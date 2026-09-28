#!/usr/bin/env bash
# Copia un modelo GGUF al "Model Pack" (Play Asset Delivery) y genera el AAB.
#
#   ./tools/package_model_pack.sh ~/modelos/Llama-3.2-1B-Instruct-Q4_K_M.gguf
#
# Resultado: android/app/build/outputs/bundle/release/app-release.aab
# con la app base y el asset pack "model_pack" separados.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 ruta/al/modelo.gguf [--no-build]" >&2
  exit 1
fi

MODEL="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/android/model_pack/src/main/assets/models"

if [[ ! -f "$MODEL" ]]; then
  echo "No existe: $MODEL" >&2
  exit 1
fi

# Valida la firma GGUF (los primeros 4 bytes deben ser "GGUF").
if [[ "$(head -c 4 "$MODEL")" != "GGUF" ]]; then
  echo "El archivo no es un modelo GGUF válido." >&2
  exit 1
fi

SIZE_MB=$(( $(stat -c%s "$MODEL" 2>/dev/null || stat -f%z "$MODEL") / 1024 / 1024 ))
# Google Play limita cada asset pack fast-follow a 1.5 GB (y 4 GB en total por app).
if (( SIZE_MB > 1536 )); then
  echo "El modelo pesa ${SIZE_MB} MB y supera el límite de 1.5 GB por asset pack." >&2
  exit 1
fi

find "$DEST" -name '*.gguf' -delete
cp "$MODEL" "$DEST/"
echo "Modelo copiado a $DEST ($SIZE_MB MB)"

if [[ "${2:-}" != "--no-build" ]]; then
  (cd "$ROOT/android" && ./gradlew bundleRelease)
  echo "AAB listo en android/app/build/outputs/bundle/release/"
fi
