# Formato de paquetes curriculares (`.pack`)

Un paquete es un archivo ZIP (extensión `.pack` o `.zip`) con esta estructura plana:

```
manifest.json      obligatorio
subjects.json      obligatorio
chunks.jsonl       opcional – fragmentos de texto para el RAG
embeddings.f32     opcional – embeddings precalculados (requiere chunks.jsonl)
```

## manifest.json

```json
{
  "format": "cobaev-pack",
  "formatVersion": 1,
  "id": "quimica-1",
  "name": "Química I – Guías oficiales",
  "curriculumVersion": "2026-B",
  "createdAt": "2026-08-01T00:00:00Z",
  "description": "…",
  "embedding": { "model": "all-MiniLM-L6-v2", "dim": 384, "count": 1250 },
  "files": { "subjects": "subjects.json", "chunks": "chunks.jsonl", "embeddings": "embeddings.f32" }
}
```

- `id` identifica el paquete: importar otro con el mismo `id` **reemplaza** sus materias, preguntas, flashcards y fragmentos (se conserva el progreso de repaso de las flashcards que no cambiaron).
- No se permite instalar una `curriculumVersion` anterior a la ya instalada (`2026-B` > `2026-A` > `2025-B`).
- Cada materia debe ser de un semestre que se curse en ese ciclo: en los ciclos `B` (agosto–enero) solo 1.º, 3.º y 5.º, y en los `A` (febrero–julio) solo 2.º, 4.º y 6.º.
- Los nombres de archivo solo pueden contener letras, números, `.`, `_` y `-` (sin rutas).

## subjects.json

Arreglo de materias. Puede ir vacío (`[]`) en un paquete que solo aporta documentos para el RAG: sus fragmentos se asocian por `subjectId` a materias ya instaladas, como las del currículo base. Formato (ver `src/core/curriculumPack.ts` y `assets/curriculum/cobaev-2026b-base.json`):

```json
[{
  "id": "cn-1", "name": "La materia y sus interacciones", "semester": 1,
  "area": "Ciencias Naturales, Experimentales y Tecnología",
  "description": "…",
  "units": [{ "id": "cn-1-u1", "title": "La materia", "topics": [{ "id": "cn-1-u1-t1", "title": "Estados de agregación", "summary": "…" }] }],
  "quizzes": [{ "id": "q1", "question": "…", "options": ["a", "b", "c", "d"], "answerIndex": 1, "explanation": "…" }],
  "flashcards": [{ "id": "f1", "front": "…", "back": "…" }]
}]
```

## chunks.jsonl

Un objeto JSON por línea: `{"id": "guia-0", "subjectId": "cn-1", "source": "Guía de Química I", "text": "…"}`. `subjectId` permite filtrar la búsqueda cuando el estudiante chatea desde una materia.

## embeddings.f32

Float32 little-endian, `count × dim` valores en el mismo orden que `chunks.jsonl`, normalizados L2. Solo se usan si `embedding.model` y `embedding.dim` coinciden con los de la app; si no, la app los regenera en el dispositivo (más lento).

## Construcción

`tools/build_curriculum_pack.py` genera todo lo anterior desde una carpeta con `pack.json`, `subjects.json` y `docs/<id-materia>/*.txt|md|pdf`, usando la misma estrategia de fragmentación que la app. Si el paquete solo trae documentos, pon en `pack.json` `"linkedSubjects": "<ruta a subjects.json del currículo base>"`: así los nombres de `docs/<id-materia>` se validan contra esas materias. Ejemplo: `tools/sources/2026b/`.
