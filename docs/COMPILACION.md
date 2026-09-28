# Compilación y empaquetado

## Requisitos

- Node ≥ 22.11 y `npm install`
- JDK 17, Android SDK (compileSdk 37) y NDK 27 (ver `android/build.gradle`)
- Modelo de embeddings en assets: `python tools/export_embedding_model.py`

## Firma de producción

Genera una llave y define en `~/.gradle/gradle.properties` (nunca en el repositorio):

```properties
COBAEV_UPLOAD_STORE_FILE=/ruta/cobaev-upload.keystore
COBAEV_UPLOAD_STORE_PASSWORD=…
COBAEV_UPLOAD_KEY_ALIAS=cobaev
COBAEV_UPLOAD_KEY_PASSWORD=…
```

Sin estas propiedades el release se firma con la llave de debug (solo para pruebas).

## APK (instalación directa)

```bash
cd android
./gradlew assembleRelease -PsplitApks=true
# android/app/build/outputs/apk/release/app-arm64-v8a-release.apk
# android/app/build/outputs/apk/release/app-universal-release.apk
```

La APK no incluye el modelo LLM: se copia al teléfono (USB/SD) y se importa desde el Gestor de modelos. Así una escuela puede instalar la app en muchos equipos y distribuir el modelo por separado.

## AAB con Model Pack separado (Google Play)

```bash
./tools/package_model_pack.sh ~/modelos/Llama-3.2-1B-Instruct-Q4_K_M.gguf
# android/app/build/outputs/bundle/release/app-release.aab
```

- `android/model_pack` es un *asset pack* **fast-follow**: Google Play lo instala junto con la app, separado de la app base.
- `ModelPackModule.kt` obtiene la ruta del pack y `registerBundledModels()` registra el GGUF sin copiarlo (se mapea directamente).
- Límites de Play: 1.5 GB por asset pack fast-follow. Un Q4_K_M de 1–1.5 B parámetros ocupa ~0.8–1.1 GB.

Para probar el AAB localmente con `bundletool`:

```bash
bundletool build-apks --bundle=app-release.aab --output=cobaev.apks --local-testing
bundletool install-apks --apks=cobaev.apks
```

## Tamaños de referencia

| Componente | Tamaño aprox. |
|---|---|
| App base (arm64, JS + libs nativas + ML Kit + ONNX + embeddings INT8) | 70–90 MB |
| Llama-3.2-1B-Instruct Q4_K_M | ~0.8 GB |
| Qwen2.5-1.5B-Instruct Q4_K_M | ~1.1 GB |

## Comprobaciones antes de publicar

```bash
npm test && npm run typecheck && npm run lint && npm run check:offline
```

y la lista de [pruebas en modo avión](PRUEBAS_MODO_AVION.md) en al menos un equipo de gama baja (3–4 GB de RAM).
