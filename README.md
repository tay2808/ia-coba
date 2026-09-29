# COBAEV IA

Asistente educativo para estudiantes del **Colegio de Bachilleres del Estado de Veracruz** que funciona **100 % sin internet**. La inferencia del LLM, el OCR, la búsqueda semántica (RAG) y la base de datos se ejecutan dentro del teléfono Android.

> Especificación original: [`docs/ESPECIFICACIONES.txt`](docs/ESPECIFICACIONES.txt) · Arquitectura detallada: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)

## Funciones del MVP

| Módulo | Descripción | Tecnología |
|---|---|---|
| Chat educativo | Historial persistente, streaming de tokens, preservación y truncamiento automático de contexto, citas de fuentes | llama.cpp (`llama.rn`), WatermelonDB |
| Gestor de modelos | Importa `.gguf`, valida la cabecera, estima RAM (pesos + caché KV) y la compara con la RAM libre | Parser GGUF propio + módulo Kotlin `DeviceStats` |
| RAG local | Indexa documentos y temarios; recupera fragmentos por similitud coseno | ONNX Runtime + all-MiniLM-L6-v2 + tokenizador WordPiece en TS + `sqlite-vec` |
| Documentos | TXT, DOCX (XML nativo) y PDF (render de páginas + OCR, sirve para escaneados) | `react-native-pdf-thumbnail`, ML Kit |
| Visión / OCR | Foto de tarea → recorte inteligente alrededor del texto → contexto para el LLM | Google ML Kit Text Recognition v2 (modelo empaquetado) |
| Humanizador | Perfiles de tono: Estudiante COBAEV (16 años), Profesional, Casual, Académico, Amable, Conciso, con reglas anti-"texto robótico" | Prompts del sistema |
| Herramientas de estudio | Quizzes (banco + generados por IA), flashcards con repetición espaciada SM-2, explicador paso a paso, detector de tono, corrección de redacción | TS puro + LLM local |
| Currículo | Currículo base 2026-B (1.º, 3.º y 5.º semestre) incluido + importador de paquetes `.pack` con embeddings precalculados | JSON/ZIP |
| Privacidad | Sin permiso `INTERNET` en producción, sin telemetría, sin respaldo en la nube, temporales borrados tras el análisis, respaldo local `.zip` | Manifest + `BackupService` |
| Rendimiento | Ajuste de contexto/hilos según RAM libre y estado térmico, pausas de enfriamiento | `performance.ts` |

## Estructura

```
App.tsx                      Arranque: carpetas, limpieza de temporales, currículo base, modelo activo
src/
  config/constants.ts        Parámetros del LLM, RAG y rendimiento
  core/                      Lógica pura en TypeScript (probada con Jest, sin dependencias nativas)
    prompt.ts                Construcción de conversaciones y truncamiento de contexto
    humanizer.ts             Perfiles de tono y prompts de reescritura/corrección
    toneDetector.ts          Detector de tono heurístico
    chunking.ts              División de textos para RAG
    vectorMath.ts            Mean pooling, normalización, coseno, top-k
    wordpiece.ts             Tokenizador WordPiece (BERT/MiniLM)
    gguf.ts                  Lectura de cabeceras GGUF y estimación de RAM
    curriculumPack.ts        Formato y validación de paquetes curriculares
    docx.ts                  Extracción de texto DOCX
    ocrLayout.ts             Orden de lectura OCR y recorte inteligente
    study.ts                 Quizzes, SM-2, prompts de estudio
  db/                        WatermelonDB: esquema, modelos, migraciones
  services/                  Integraciones nativas (llama.rn, ONNX, op-sqlite, ML Kit, FS)
  screens/                   Inicio, Chat, Materias, Herramientas, Gestor de modelos, Documentos, Ajustes
android/
  app/.../DeviceStatsModule.kt   RAM disponible, estado térmico, temperatura de batería
  app/.../ModelPackModule.kt     Localiza el modelo entregado por Play Asset Delivery
  model_pack/                    Asset pack con el GGUF (separado de la app base en el AAB)
assets/curriculum/           Currículo base COBAEV 2026-B (1.º, 3.º y 5.º semestre)
tools/                       Scripts de PC: exportar embeddings, construir paquetes, empaquetar modelo, auditoría offline
docs/                        Arquitectura, formato de paquetes, compilación, pruebas en modo avión
```

## Inicio rápido (desarrollo)

Requisitos: Node ≥ 22.11, JDK 17, Android SDK/NDK (ver `android/build.gradle`), Python 3.10+ para los scripts de PC.

```bash
npm install
python tools/export_embedding_model.py      # una vez: genera assets/embeddings/model.onnx + vocab.txt
npm start                                   # Metro
npm run android                             # compila e instala en el dispositivo/emulador
```

Después, en la app: **Herramientas → Gestor de modelos → Importar modelo GGUF** y elige, por ejemplo, `Llama-3.2-1B-Instruct-Q4_K_M.gguf` o `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` copiado al teléfono.

## Verificación

```bash
npm test               # pruebas unitarias de src/core (Jest)
npm run typecheck      # TypeScript estricto
npm run lint           # ESLint
npm run check:offline  # auditoría estática: sin APIs de red ni permiso INTERNET en producción
```

Las pruebas en dispositivo real (modo avión estricto) se describen en [`docs/PRUEBAS_MODO_AVION.md`](docs/PRUEBAS_MODO_AVION.md).

## Compilación y distribución

- **APK** (instalación directa por USB/SD en escuelas): `cd android && ./gradlew assembleRelease -PsplitApks=true` → un APK por arquitectura + uno universal. El modelo se importa desde el Gestor de modelos.
- **AAB** (Google Play) con **Model Pack separado**: `./tools/package_model_pack.sh ruta/modelo.gguf` → la app base y el asset pack `model_pack` (fast-follow) viajan por separado; la app lo detecta y lo usa sin copiarlo.

Detalles, firma y tamaños en [`docs/COMPILACION.md`](docs/COMPILACION.md).

## Paquetes curriculares

```bash
pip install -r tools/requirements.txt
python tools/build_curriculum_pack.py tools/examples/pack-ejemplo -o ejemplo.pack
```

Copia el `.pack` al teléfono y usa **Materias → Importar paquete curricular**. Formato en [`docs/FORMATO_PAQUETES.md`](docs/FORMATO_PAQUETES.md).

El currículo base incluido (`assets/curriculum/cobaev-2026b-base.json`) contiene solo las UAC que se cursan en el semestre **2026-B**: 1.º (generación 2026-2029), 3.º (2025-2028) y 5.º (2024-2027). Los nombres vienen del Campus Virtual COBAEV 2026-B. Las unidades y temas vienen de los resúmenes oficiales de cada curso, y las horas de 5.º semestre, de la estructura curricular DGB publicada por COBAEV. Las UAC sin contenido público solo traen su nombre. Las fuentes, los documentos descartados y lo pendiente están en [`docs/FUENTES_CURRICULO_2026B.md`](docs/FUENTES_CURRICULO_2026B.md). Los textos fuente de los paquetes RAG por semestre están en `tools/sources/2026b/`.

## Limitaciones conocidas

- El modelo de embeddings por defecto (all-MiniLM-L6-v2) fue entrenado principalmente en inglés; funciona aceptablemente en español para temas escolares, pero un modelo multilingüe con tokenizador WordPiece mejora la recuperación (ver `docs/ARQUITECTURA.md`).
- El OCR de ML Kit reconoce texto latino; las fórmulas matemáticas complejas (fracciones apiladas, integrales) pueden requerir corrección manual antes de pedir la explicación.
- Los modelos de 1–1.5 B parámetros pueden cometer errores; la app lo indica y fomenta que el estudiante verifique.
