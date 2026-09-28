# Arquitectura de COBAEV IA

## Principios

1. **Offline estricto.** Ningún módulo usa red. El manifest de producción elimina `INTERNET` y `ACCESS_NETWORK_STATE` (`tools:node="remove"`), `allowBackup=false` y `data_extraction_rules.xml` impiden copias en la nube. `tools/check_offline.js` lo audita en CI.
2. **Núcleo puro y probado.** Toda la lógica que no requiere hardware (`src/core/`) es TypeScript puro con pruebas Jest. Los servicios (`src/services/`) son adaptadores finos sobre librerías nativas.
3. **Un solo modelo en memoria.** `LlamaService` mantiene un único `LlamaContext`; cambiar de modelo libera el anterior.

## Capas

```
┌──────────────────────────── UI (React Native) ────────────────────────────┐
│ Inicio · Chat · Materias · Herramientas · Gestor de modelos · Documentos │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ hooks (useLlmStatus, useStreamingTool, useFocusData)
┌───────────────▼──────────────── Servicios ────────────────────────────────┐
│ ChatService      → prompt.ts + RagService + LlamaService + WatermelonDB   │
│ StudyService     → study.ts + LlamaService                                 │
│ ModelManager     → gguf.ts + DeviceStats (Kotlin) + ModelPack (Kotlin)    │
│ RagService       → chunking.ts + EmbeddingService (ONNX) + VectorStore    │
│ DocumentProcessor→ docx.ts / PDF→imagen→OcrService / TXT                  │
│ OcrService       → ML Kit + ocrLayout.ts + recorte (image-editor)         │
│ CurriculumImporter → curriculumPack.ts + unzip + VectorStore              │
│ BackupService    → zip + saveDocuments (diálogo del sistema)              │
└───────────────┬───────────────────────────────────────────────────────────┘
┌───────────────▼──────────────── Nativo ───────────────────────────────────┐
│ llama.rn (llama.cpp, C++) · onnxruntime-react-native · op-sqlite+sqlite-vec│
│ WatermelonDB (SQLite, JSI) · ML Kit Text Recognition v2 (bundled)          │
│ DeviceStatsModule.kt · ModelPackModule.kt                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

## Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Inferencia | `llama.rn` (llama.cpp) con `use_mmap`, sin `mlock`, `n_gpu_layers=0` por defecto | Estándar en móviles; mmap permite modelos cercanos a la RAM libre; la GPU móvil es inconsistente entre gamas |
| Plantilla de chat | Se envían `messages` y llama.rn aplica la plantilla Jinja embebida en el GGUF | Soporta Llama 3.2 y Qwen 2.5 sin código específico |
| Contexto | 2048 tokens por defecto; 1024 con memoria baja; 512 reservados a la respuesta, ≤600 al RAG | Equilibrio entre calidad y velocidad en gama media |
| Truncamiento | Se conserva sistema + RAG + mensaje actual; el historial se agrega del más reciente al más antiguo hasta llenar el presupuesto; nunca inicia con una respuesta huérfana | `core/prompt.ts` |
| Embeddings | all-MiniLM-L6-v2 INT8 (≈23 MB) en ONNX Runtime; tokenizador WordPiece propio | Sin dependencias nativas extra; 384 dimensiones = índice pequeño |
| Base vectorial | `op-sqlite` con `sqlite-vec` (`vec0`, distancia coseno); fallback a fuerza bruta en JS | WatermelonDB no permite cargar extensiones; se usa una segunda BD SQLite solo para vectores |
| Filtro por materia | KNN con sobre-muestreo (k×6) y filtro posterior; los documentos del usuario siempre participan | Compatible con cualquier versión de sqlite-vec |
| PDF | Renderizar páginas a imagen y aplicar OCR (máx. 80 páginas) | Una sola ruta para PDFs digitales y escaneados, sin motor PDF en JS |
| DOCX | Descomprimir y leer `word/document.xml` | Formato abierto; sin librerías pesadas |
| OCR | ML Kit v2 empaquetado (`com.google.mlkit:text-recognition`) | No depende de Google Play Services para descargar el modelo |
| Recorte inteligente | Rectángulo que envuelve los bloques detectados (+4 % de margen); segundo pase si el primero halló poco texto | Mejora legibilidad de la vista previa y el OCR de texto pequeño |
| Base de datos | WatermelonDB (SQLite + JSI) | Offline-first, perezosa, rápida con historiales largos |
| Flashcards | SM-2 simplificado; falladas se repiten en la misma sesión | Probado y fácil de explicar |
| Distribución | AAB con asset pack `model_pack` (fast-follow) + APK por ABI para sideload | Cumple "split de Model Pack y App base" y permite instalar sin tienda |

## Flujo de una pregunta en el chat

1. `ChatScreen` → `ChatService.sendMessage` guarda el mensaje del usuario.
2. `RagService.retrieve` genera el embedding de la pregunta (+ texto OCR) y busca top-4 en `sqlite-vec`.
3. `buildConversation` arma `[system+RAG, …historial recortado…, user]` dentro del presupuesto.
4. `LlamaService.chat` consulta `currentTuning()` (RAM/temperatura), genera en streaming y aplica pausa térmica.
5. Se guarda la respuesta con fuentes citadas y tokens/s.

## Mejorar el RAG en español

`EmbeddingService` acepta cualquier modelo BERT con vocabulario WordPiece y salida `last_hidden_state` (o ya agrupada). Para cambiarlo:

```bash
python tools/export_embedding_model.py --model sentence-transformers/distiluse-base-multilingual-cased-v2
```

Ajusta `RAG.embeddingDim` y `EMBEDDING_MODEL_ID`, y usa el mismo modelo en `tools/build_curriculum_pack.py`. Los modelos con tokenizador SentencePiece (p. ej. XLM-R) requerirían un tokenizador adicional.

## Seguridad y privacidad

- Documentos: el archivo original se borra tras extraer el texto; solo quedan los fragmentos indexados en el sandbox privado de la app.
- Fotos: las imágenes de cámara/recorte se eliminan tras el OCR (`ImagePicker.clean`, `removeIfExists`); la carpeta `tmp/` se vacía en cada arranque.
- Sin telemetría: no hay SDKs de analítica; `check_offline.js` falla si se agregan.
- Cifrado adicional: `op-sqlite` admite SQLCipher (`"op-sqlite": { "sqlcipher": true }`) si se requiere cifrar la base vectorial con una clave del Android Keystore.
- Respaldo: exportación manual a `.zip` mediante el diálogo del sistema; restauración con validación del formato.
