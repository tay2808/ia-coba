#!/usr/bin/env python3
"""
Construye un paquete curricular (.pack) para COBAEV IA en la PC.

Entrada: una carpeta con
    pack.json          metadatos: {"id", "name", "curriculumVersion", "description"}
    subjects.json      materias (mismo formato que assets/curriculum/cobaev-2026b-base.json)
    docs/<materia>/*.txt|*.md|*.pdf   (opcional) guías y apuntes para el RAG;
                       el nombre de la subcarpeta es el id de la materia.

Salida: un archivo .pack (ZIP) con manifest.json, subjects.json, chunks.jsonl y
embeddings.f32 precalculados con all-MiniLM-L6-v2 (los mismos que usa la app),
para que el teléfono no tenga que generarlos.

    pip install -r tools/requirements.txt
    python tools/build_curriculum_pack.py tools/examples/pack-ejemplo -o quimica-2026b.pack

Un paquete puede traer solo documentos para el RAG: con "subjects.json" vacío ([])
y "linkedSubjects" en pack.json (ruta, relativa a la carpeta, a un subjects.json ya
instalado, p. ej. el currículo base) las carpetas docs/<materia> se comprueban
contra esas materias y la app no duplica materias al importarlo.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

FORMAT = "cobaev-pack"
FORMAT_VERSION = 1
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
# Deben coincidir con src/config/constants.ts (RAG.chunkSize / RAG.chunkOverlap).
CHUNK_SIZE = 700
CHUNK_OVERLAP = 120


def normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("­", "")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def split_units(text: str, max_len: int) -> list[str]:
    units: list[str] = []
    for para in re.split(r"\n{2,}", text):
        para = para.strip()
        if not para:
            continue
        if len(para) <= max_len:
            units.append(para)
            continue
        for sentence in re.split(r"(?<=[.!?…;:])\s+", para):
            if len(sentence) <= max_len:
                units.append(sentence)
                continue
            buf = ""
            for word in sentence.split():
                if buf and len(buf) + len(word) + 1 > max_len:
                    units.append(buf)
                    buf = word
                else:
                    buf = f"{buf} {word}" if buf else word
            if buf:
                units.append(buf)
    return units


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Misma estrategia que src/core/chunking.ts: párrafos → oraciones → palabras, con solapamiento."""
    chunks: list[str] = []
    current: list[str] = []
    length = 0
    for unit in split_units(normalize(text), size):
        if current and length + len(unit) + 1 > size:
            chunks.append("\n".join(current))
            tail: list[str] = []
            tail_len = 0
            for u in reversed(current):
                if tail_len + len(u) > overlap:
                    break
                tail.insert(0, u)
                tail_len += len(u) + 1
            current, length = (tail, tail_len) if tail_len + len(unit) + 1 <= size and len(tail) < len(current) else ([], 0)
        current.append(unit)
        length += len(unit) + 1
    if current:
        last = "\n".join(current)
        if not chunks or not chunks[-1].endswith(last):
            chunks.append(last)
    return chunks


def read_document(path: Path) -> str:
    if path.suffix.lower() in {".txt", ".md"}:
        return path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".pdf":
        from pypdf import PdfReader

        return "\n\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
    raise ValueError(f"Formato no soportado: {path.name}")


def semesters_for_version(version: str) -> set[int] | None:
    """Igual que semestersForCurriculumVersion (src/core/curriculumPack.ts): ciclo B → impares, A → pares."""
    m = re.fullmatch(r"\d{4}-([AB])", version.strip(), re.IGNORECASE)
    if not m:
        return None
    return {1, 3, 5} if m.group(1).upper() == "B" else {2, 4, 6}


def validate_subjects(subjects: list[dict], version: str | None = None) -> None:
    allowed = semesters_for_version(version) if version else None
    ids = set()
    for i, s in enumerate(subjects, 1):
        for key in ("id", "name", "semester", "units"):
            if key not in s:
                raise SystemExit(f"subjects.json: la materia #{i} no tiene '{key}'")
        if s["id"] in ids:
            raise SystemExit(f"subjects.json: id duplicado '{s['id']}'")
        ids.add(s["id"])
        if not 1 <= int(s["semester"]) <= 6:
            raise SystemExit(f"subjects.json: '{s['id']}' tiene semestre fuera de 1-6")
        if allowed and int(s["semester"]) not in allowed:
            raise SystemExit(f"subjects.json: '{s['id']}' es de {s['semester']}.º semestre, que no se cursa en {version}")
        for q in s.get("quizzes", []):
            if not 0 <= q["answerIndex"] < len(q["options"]):
                raise SystemExit(f"subjects.json: pregunta '{q.get('id')}' con answerIndex inválido")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument("--no-embeddings", action="store_true", help="No precalcular (el teléfono los generará)")
    args = parser.parse_args()

    meta = json.loads((args.source / "pack.json").read_text(encoding="utf-8"))
    subjects = json.loads((args.source / "subjects.json").read_text(encoding="utf-8"))
    validate_subjects(subjects, meta["curriculumVersion"])
    subject_ids = {s["id"] for s in subjects}
    if meta.get("linkedSubjects"):
        linked = json.loads((args.source / meta["linkedSubjects"]).read_text(encoding="utf-8"))
        validate_subjects(linked, meta["curriculumVersion"])
        subject_ids |= {s["id"] for s in linked}

    chunks: list[dict] = []
    docs_dir = args.source / "docs"
    if docs_dir.exists():
        for doc in sorted(p for p in docs_dir.rglob("*") if p.is_file()):
            subject_id = doc.parent.name if doc.parent != docs_dir else None
            if subject_id and subject_id not in subject_ids:
                print(f"Aviso: la carpeta '{subject_id}' no coincide con ninguna materia", file=sys.stderr)
            for i, text in enumerate(chunk_text(read_document(doc))):
                chunks.append({
                    "id": f"{doc.stem}-{i}",
                    "subjectId": subject_id,
                    "source": doc.stem.replace("_", " "),
                    "text": text,
                })

    manifest = {
        "format": FORMAT,
        "formatVersion": FORMAT_VERSION,
        "id": meta["id"],
        "name": meta["name"],
        "curriculumVersion": meta["curriculumVersion"],
        "description": meta.get("description", ""),
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "embedding": None,
        "files": {"subjects": "subjects.json"},
    }

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "subjects.json").write_text(json.dumps(subjects, ensure_ascii=False), encoding="utf-8")
        if chunks:
            manifest["files"]["chunks"] = "chunks.jsonl"
            with open(tmp_path / "chunks.jsonl", "w", encoding="utf-8") as fh:
                for c in chunks:
                    fh.write(json.dumps(c, ensure_ascii=False) + "\n")
            if not args.no_embeddings:
                import numpy as np
                from sentence_transformers import SentenceTransformer

                print(f"Calculando {len(chunks)} embeddings con {EMBEDDING_MODEL}…")
                model = SentenceTransformer(f"sentence-transformers/{EMBEDDING_MODEL}")
                vectors = model.encode([c["text"] for c in chunks], normalize_embeddings=True, show_progress_bar=True)
                vectors = np.asarray(vectors, dtype="<f4")
                assert vectors.shape[1] == EMBEDDING_DIM
                vectors.tofile(tmp_path / "embeddings.f32")
                manifest["files"]["embeddings"] = "embeddings.f32"
                manifest["embedding"] = {"model": EMBEDDING_MODEL, "dim": EMBEDDING_DIM, "count": len(chunks)}
        (tmp_path / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

        args.output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in sorted(tmp_path.iterdir()):
                # Los embeddings binarios se guardan sin comprimir.
                zf.write(f, f.name, compress_type=zipfile.ZIP_STORED if f.suffix == ".f32" else zipfile.ZIP_DEFLATED)

    print(f"Paquete creado: {args.output} ({len(subjects)} materias, {len(chunks)} fragmentos)")


if __name__ == "__main__":
    main()
