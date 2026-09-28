/**
 * Motor de importación de paquetes curriculares (.pack / .zip).
 * Valida el paquete, reemplaza de forma atómica las materias, quizzes y
 * flashcards del mismo paquete e indexa sus fragmentos en la base vectorial
 * (usando los embeddings precalculados o generándolos en el dispositivo).
 */
import { Q } from '@nozbe/watermelondb';
import { unzip } from 'react-native-zip-archive';
import { RAG } from '../../config/constants';
import {
  compareCurriculumVersions,
  parseChunksJsonl,
  validateManifest,
  validateSubjects,
  type PackManifest,
  type Subject as SubjectData,
} from '../../core/curriculumPack';
import { splitFloat32Buffer } from '../../core/vectorMath';
import { NEW_CARD_STATE } from '../../core/study';
import {
  collections,
  database,
  type Flashcard,
  type PackRecord,
  type QuizQuestionRecord,
  type Subject,
} from '../../db';
import { RNFS, appPath, pickAndCopy, readFloat32, removeIfExists } from '../fileSystem';
import { EMBEDDING_MODEL_ID, EmbeddingService } from '../rag/EmbeddingService';
import { VectorStore } from '../rag/VectorStore';
import baseCurriculum from '../../../assets/curriculum/cobaev-2026b-base.json';

export const BASE_PACK_ID = 'cobaev-base';

export interface ImportSummary {
  manifest: PackManifest;
  subjects: number;
  quizzes: number;
  flashcards: number;
  chunks: number;
  reembedded: boolean;
  replacedVersion?: string;
}

export type ImportProgress = (message: string, fraction?: number) => void;

/** Escribe materias, quizzes y flashcards reemplazando los del mismo paquete. */
async function writeSubjects(packId: string, subjects: SubjectData[]): Promise<{ quizzes: number; flashcards: number }> {
  const codes = subjects.map(s => s.id);
  const [oldSubjects, oldQuizzes, oldCards] = await Promise.all([
    collections.subjects.query(Q.where('pack_id', packId)).fetch(),
    collections.quizQuestions.query(Q.where('subject_code', Q.oneOf(codes)), Q.where('origin', 'pack')).fetch(),
    collections.flashcards.query(Q.where('subject_code', Q.oneOf(codes)), Q.where('origin', 'pack')).fetch(),
  ]);
  // Conserva el progreso de repaso de las flashcards que siguen existiendo.
  const progress = new Map((oldCards as Flashcard[]).map(c => [`${c.subjectCode}|${c.front}`, c.review]));
  const now = Date.now();
  let quizzes = 0;
  let flashcards = 0;

  await database.write(async () => {
    const ops = [
      ...oldSubjects.map(r => r.prepareDestroyPermanently()),
      ...oldQuizzes.map(r => r.prepareDestroyPermanently()),
      ...oldCards.map(r => r.prepareDestroyPermanently()),
    ];
    for (const s of subjects) {
      ops.push(
        collections.subjects.prepareCreate((r: Subject) => {
          r.code = s.id;
          r.name = s.name;
          r.semester = s.semester;
          r.area = s.area ?? '';
          r.description = s.description ?? null;
          r.units = s.units;
          r.packId = packId;
        }),
      );
      for (const q of s.quizzes ?? []) {
        quizzes++;
        ops.push(
          collections.quizQuestions.prepareCreate((r: QuizQuestionRecord) => {
            r.code = q.id;
            r.subjectCode = s.id;
            r.question = q.question;
            r.options = q.options;
            r.answerIndex = q.answerIndex;
            r.explanation = q.explanation || null;
            r.origin = 'pack';
          }),
        );
      }
      for (const f of s.flashcards ?? []) {
        flashcards++;
        const review = progress.get(`${s.id}|${f.front}`) ?? NEW_CARD_STATE(now);
        ops.push(
          collections.flashcards.prepareCreate((r: Flashcard) => {
            r.subjectCode = s.id;
            r.front = f.front;
            r.back = f.back;
            r.interval = review.interval;
            r.ease = review.ease;
            r.repetitions = review.repetitions;
            r.dueAt = review.dueAt;
            r.origin = 'pack';
          }),
        );
      }
    }
    await database.batch(...ops);
  });
  return { quizzes, flashcards };
}

async function upsertPackRecord(manifest: PackManifest, subjectCount: number, chunkCount: number): Promise<string | undefined> {
  const [existing] = (await collections.packs.query(Q.where('pack_id', manifest.id)).fetch()) as PackRecord[];
  const previous = existing?.curriculumVersion;
  await database.write(async () => {
    if (existing) {
      await existing.update(r => {
        r.name = manifest.name;
        r.curriculumVersion = manifest.curriculumVersion;
        r.subjectCount = subjectCount;
        r.chunkCount = chunkCount;
        r.installedAt = new Date();
      });
    } else {
      await collections.packs.create((r: PackRecord) => {
        r.packId = manifest.id;
        r.name = manifest.name;
        r.curriculumVersion = manifest.curriculumVersion;
        r.subjectCount = subjectCount;
        r.chunkCount = chunkCount;
        r.installedAt = new Date();
      });
    }
  });
  return previous;
}

/** Instala el currículo base incluido en la app (solo la primera vez). */
export async function installBaseCurriculumIfNeeded(): Promise<boolean> {
  const count = await collections.packs.query(Q.where('pack_id', BASE_PACK_ID)).fetchCount();
  if (count > 0) {
    return false;
  }
  const subjects = validateSubjects(baseCurriculum);
  await writeSubjects(BASE_PACK_ID, subjects);
  await upsertPackRecord(
    {
      format: 'cobaev-pack',
      formatVersion: 1,
      id: BASE_PACK_ID,
      name: 'Currículo base COBAEV',
      curriculumVersion: '2026-B',
      createdAt: new Date().toISOString(),
      files: { subjects: 'subjects.json' },
    },
    subjects.length,
    0,
  );
  return true;
}

export async function importPackFromFile(zipPath: string, onProgress?: ImportProgress): Promise<ImportSummary> {
  const dir = appPath('tmp', `pack-${Date.now()}`);
  try {
    onProgress?.('Descomprimiendo paquete…', 0.05);
    await RNFS.mkdir(dir);
    await unzip(zipPath, dir);

    const manifestPath = `${dir}/manifest.json`;
    if (!(await RNFS.exists(manifestPath))) {
      throw new Error('El paquete no contiene manifest.json');
    }
    const manifest = validateManifest(JSON.parse(await RNFS.readFile(manifestPath, 'utf8')));
    onProgress?.(`Validando "${manifest.name}" (${manifest.curriculumVersion})…`, 0.1);
    const subjects = validateSubjects(JSON.parse(await RNFS.readFile(`${dir}/${manifest.files.subjects}`, 'utf8')));

    const [installed] = (await collections.packs.query(Q.where('pack_id', manifest.id)).fetch()) as PackRecord[];
    if (installed && compareCurriculumVersions(manifest.curriculumVersion, installed.curriculumVersion) < 0) {
      throw new Error(
        `Ya tienes instalada una versión más reciente (${installed.curriculumVersion}) de este paquete.`,
      );
    }

    // Fragmentos y embeddings para RAG.
    let chunkCount = 0;
    let reembedded = false;
    if (manifest.files.chunks) {
      const chunks = parseChunksJsonl(await RNFS.readFile(`${dir}/${manifest.files.chunks}`, 'utf8'));
      let vectors: Float32Array[] | null = null;
      const compatible =
        manifest.files.embeddings &&
        manifest.embedding?.model === EMBEDDING_MODEL_ID &&
        manifest.embedding?.dim === RAG.embeddingDim;
      if (compatible) {
        onProgress?.('Cargando embeddings precalculados…', 0.3);
        const floats = await readFloat32(`${dir}/${manifest.files.embeddings}`);
        vectors = splitFloat32Buffer((floats.buffer as ArrayBuffer).slice(0, floats.length * 4), RAG.embeddingDim);
        if (vectors.length !== chunks.length) {
          throw new Error(`embeddings.f32 tiene ${vectors.length} vectores pero hay ${chunks.length} fragmentos.`);
        }
      } else if (await EmbeddingService.isAvailable()) {
        reembedded = true;
        vectors = await EmbeddingService.embedMany(
          chunks.map(c => c.text),
          (done, total) => onProgress?.(`Generando embeddings ${done}/${total}…`, 0.3 + 0.5 * (done / total)),
        );
      }
      await VectorStore.deleteOwner('pack', manifest.id);
      if (vectors) {
        onProgress?.('Guardando en la base vectorial…', 0.85);
        await VectorStore.insert(
          chunks.map(c => ({
            chunkId: `pack:${manifest.id}:${c.id}`,
            ownerType: 'pack' as const,
            ownerId: manifest.id,
            subjectCode: c.subjectId ?? null,
            source: c.source,
            text: c.text,
          })),
          vectors,
        );
        chunkCount = chunks.length;
      }
    }

    onProgress?.('Actualizando materias…', 0.92);
    const { quizzes, flashcards } = await writeSubjects(manifest.id, subjects);
    const replacedVersion = await upsertPackRecord(manifest, subjects.length, chunkCount);
    onProgress?.('¡Paquete instalado!', 1);
    return { manifest, subjects: subjects.length, quizzes, flashcards, chunks: chunkCount, reembedded, replacedVersion };
  } finally {
    await removeIfExists(dir);
  }
}

export async function pickAndImportPack(onProgress?: ImportProgress): Promise<ImportSummary | null> {
  const picked = await pickAndCopy('pack', appPath('tmp'));
  if (!picked) {
    return null;
  }
  try {
    return await importPackFromFile(picked.path, onProgress);
  } finally {
    await removeIfExists(picked.path);
  }
}

export async function uninstallPack(pack: PackRecord): Promise<void> {
  const subjects = (await collections.subjects.query(Q.where('pack_id', pack.packId)).fetch()) as Subject[];
  const codes = subjects.map(s => s.code);
  const [quizzes, cards] = await Promise.all([
    collections.quizQuestions.query(Q.where('subject_code', Q.oneOf(codes)), Q.where('origin', 'pack')).fetch(),
    collections.flashcards.query(Q.where('subject_code', Q.oneOf(codes)), Q.where('origin', 'pack')).fetch(),
  ]);
  await VectorStore.deleteOwner('pack', pack.packId);
  await database.write(async () => {
    await database.batch(
      ...[...subjects, ...quizzes, ...cards, pack].map(r => r.prepareDestroyPermanently()),
    );
  });
}
