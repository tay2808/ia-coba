/**
 * Formato y validación de paquetes curriculares (.pack / .zip).
 *
 * Estructura del paquete (ver docs/FORMATO_PAQUETES.md):
 *   manifest.json     Metadatos del paquete
 *   subjects.json     Materias, unidades, temas, quizzes y flashcards
 *   chunks.jsonl      (opcional) Fragmentos de texto para RAG, uno por línea
 *   embeddings.f32    (opcional) Embeddings precalculados, float32 little-endian
 */

export const PACK_FORMAT = 'cobaev-pack';
export const PACK_FORMAT_VERSION = 1;

export interface PackManifest {
  format: typeof PACK_FORMAT;
  formatVersion: number;
  id: string;
  name: string;
  curriculumVersion: string;
  createdAt: string;
  description?: string;
  embedding?: { model: string; dim: number; count: number } | null;
  files: {
    subjects: string;
    chunks?: string;
    embeddings?: string;
  };
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
}

export interface FlashcardSeed {
  id: string;
  front: string;
  back: string;
}

export interface Topic {
  id: string;
  title: string;
  summary?: string;
  content?: string;
}

export interface Unit {
  id: string;
  title: string;
  topics: Topic[];
}

export interface Subject {
  id: string;
  name: string;
  semester: number;
  /** Área de conocimiento / recurso sociocognitivo del MCCEMS. */
  area: string;
  description?: string;
  units: Unit[];
  quizzes?: QuizQuestion[];
  flashcards?: FlashcardSeed[];
}

export interface PackChunk {
  id: string;
  subjectId?: string;
  topicId?: string;
  source: string;
  text: string;
}

export class PackValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Paquete inválido:\n- ${problems.join('\n- ')}`);
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const SAFE_PATH = /^[\w.-]+$/;

export function validateManifest(raw: unknown): PackManifest {
  const p: string[] = [];
  const m = raw as Partial<PackManifest> | null;
  if (!m || typeof m !== 'object') {
    throw new PackValidationError(['manifest.json no es un objeto JSON']);
  }
  if (m.format !== PACK_FORMAT) {
    p.push(`format debe ser "${PACK_FORMAT}"`);
  }
  if (typeof m.formatVersion !== 'number' || m.formatVersion > PACK_FORMAT_VERSION) {
    p.push(`formatVersion no soportada (máx. ${PACK_FORMAT_VERSION})`);
  }
  for (const key of ['id', 'name', 'curriculumVersion'] as const) {
    if (!isStr(m[key])) {
      p.push(`falta ${key}`);
    }
  }
  if (!m.files || !isStr(m.files.subjects)) {
    p.push('falta files.subjects');
  } else {
    // Evita rutas con "../" que escapen del directorio del paquete.
    for (const f of [m.files.subjects, m.files.chunks, m.files.embeddings]) {
      if (f !== undefined && !SAFE_PATH.test(f)) {
        p.push(`nombre de archivo no permitido: ${f}`);
      }
    }
    if (m.files.embeddings && !m.files.chunks) {
      p.push('files.embeddings requiere files.chunks');
    }
    if (m.files.embeddings && (!m.embedding || !m.embedding.dim || !m.embedding.model)) {
      p.push('files.embeddings requiere embedding.model y embedding.dim');
    }
  }
  if (p.length) {
    throw new PackValidationError(p);
  }
  return m as PackManifest;
}

export function validateSubjects(raw: unknown): Subject[] {
  const p: string[] = [];
  if (!Array.isArray(raw)) {
    throw new PackValidationError(['subjects.json debe ser un arreglo']);
  }
  const ids = new Set<string>();
  raw.forEach((s: Partial<Subject>, i) => {
    const where = `materia #${i + 1}`;
    if (!isStr(s?.id)) {
      p.push(`${where}: falta id`);
    } else if (ids.has(s.id)) {
      p.push(`${where}: id duplicado "${s.id}"`);
    } else {
      ids.add(s.id);
    }
    if (!isStr(s?.name)) {
      p.push(`${where}: falta name`);
    }
    if (typeof s?.semester !== 'number' || s.semester < 1 || s.semester > 6) {
      p.push(`${where}: semester debe ser 1-6`);
    }
    if (!Array.isArray(s?.units)) {
      p.push(`${where}: units debe ser un arreglo`);
    } else {
      s.units.forEach((u, j) => {
        if (!isStr(u?.id) || !isStr(u?.title) || !Array.isArray(u?.topics)) {
          p.push(`${where}, unidad #${j + 1}: requiere id, title y topics`);
        }
      });
    }
    (s?.quizzes ?? []).forEach((q, j) => {
      if (!isStr(q?.question) || !Array.isArray(q?.options) || q.options.length < 2) {
        p.push(`${where}, pregunta #${j + 1}: requiere question y al menos 2 options`);
      } else if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= q.options.length) {
        p.push(`${where}, pregunta #${j + 1}: answerIndex fuera de rango`);
      }
    });
    (s?.flashcards ?? []).forEach((f, j) => {
      if (!isStr(f?.front) || !isStr(f?.back)) {
        p.push(`${where}, flashcard #${j + 1}: requiere front y back`);
      }
    });
  });
  if (p.length) {
    throw new PackValidationError(p);
  }
  return raw as Subject[];
}

export function parseChunksJsonl(text: string): PackChunk[] {
  const out: PackChunk[] = [];
  const p: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) {
      return;
    }
    try {
      const c = JSON.parse(line) as PackChunk;
      if (!isStr(c.id) || !isStr(c.text)) {
        p.push(`línea ${i + 1}: requiere id y text`);
      } else {
        out.push({ ...c, source: c.source ?? 'Paquete curricular' });
      }
    } catch {
      p.push(`línea ${i + 1}: JSON inválido`);
    }
  });
  if (p.length) {
    throw new PackValidationError(p.slice(0, 20));
  }
  return out;
}

/** Compara versiones curriculares tipo "2026-B" > "2026-A" > "2025-B". */
export function compareCurriculumVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const m = /^(\d{4})-([AB])$/i.exec(v.trim());
    return m ? Number(m[1]) * 2 + (m[2].toUpperCase() === 'B' ? 1 : 0) : NaN;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (Number.isNaN(pa) || Number.isNaN(pb)) {
    return a.localeCompare(b);
  }
  return pa - pb;
}
