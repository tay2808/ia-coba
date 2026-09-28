/**
 * Respaldo local (.zip) de chats y progreso de estudio. El usuario elige
 * dónde guardarlo con el diálogo del sistema; nunca se envía a internet.
 */
import { saveDocuments } from '@react-native-documents/picker';
import { unzip, zip } from 'react-native-zip-archive';
import { APP_NAME } from '../../config/constants';
import {
  collections,
  database,
  type Conversation,
  type Flashcard,
  type Message,
  type QuizAttempt,
  type QuizQuestionRecord,
  type Setting,
  setRawTimestamp,
} from '../../db';
import { Q } from '@nozbe/watermelondb';
import { RNFS, appPath, pickAndCopy, removeIfExists } from '../fileSystem';

export const BACKUP_VERSION = 1;

interface BackupData {
  app: string;
  version: number;
  createdAt: string;
  conversations: Array<{ id: string; title: string; subjectId: string | null; mode: string; createdAt: number; updatedAt: number }>;
  messages: Array<{ conversationId: string; role: string; content: string; createdAt: number }>;
  flashcards: Array<{ subjectCode: string; front: string; back: string; interval: number; ease: number; repetitions: number; dueAt: number; origin: string }>;
  quizAttempts: Array<{ subjectCode: string; total: number; correct: number; createdAt: number }>;
  generatedQuestions: Array<{ code: string; subjectCode: string; question: string; options: string[]; answerIndex: number; explanation: string | null }>;
  settings: Array<{ key: string; value: string }>;
}

export async function exportBackup(): Promise<string | null> {
  const [conversations, messages, flashcards, attempts, generated, settings] = await Promise.all([
    collections.conversations.query().fetch() as Promise<Conversation[]>,
    collections.messages.query().fetch() as Promise<Message[]>,
    collections.flashcards.query().fetch() as Promise<Flashcard[]>,
    collections.quizAttempts.query().fetch() as Promise<QuizAttempt[]>,
    collections.quizQuestions.query(Q.where('origin', 'generated')).fetch() as Promise<QuizQuestionRecord[]>,
    collections.settings.query().fetch() as Promise<Setting[]>,
  ]);
  const data: BackupData = {
    app: APP_NAME,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    conversations: conversations.map(c => ({
      id: c.id, title: c.title, subjectId: c.subjectId, mode: c.mode,
      createdAt: c.createdAt.getTime(), updatedAt: c.updatedAt.getTime(),
    })),
    messages: messages.map(m => ({ conversationId: m.conversationId, role: m.role, content: m.content, createdAt: m.createdAt.getTime() })),
    flashcards: flashcards.map(f => ({
      subjectCode: f.subjectCode, front: f.front, back: f.back, interval: f.interval,
      ease: f.ease, repetitions: f.repetitions, dueAt: f.dueAt, origin: f.origin,
    })),
    quizAttempts: attempts.map(a => ({ subjectCode: a.subjectCode, total: a.total, correct: a.correct, createdAt: a.createdAt.getTime() })),
    generatedQuestions: generated.map(q => ({
      code: q.code, subjectCode: q.subjectCode, question: q.question, options: q.options,
      answerIndex: q.answerIndex, explanation: q.explanation,
    })),
    settings: settings.map(s => ({ key: s.key, value: s.value })),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const workDir = appPath('backups', `respaldo-${Date.now()}`);
  const zipPath = appPath('backups', `cobaev-ia-respaldo-${stamp}.zip`);
  try {
    await RNFS.mkdir(workDir);
    await RNFS.writeFile(`${workDir}/backup.json`, JSON.stringify(data), 'utf8');
    await removeIfExists(zipPath);
    await zip(workDir, zipPath);
    const [saved] = await saveDocuments({
      sourceUris: [`file://${zipPath}`],
      fileName: `cobaev-ia-respaldo-${stamp}.zip`,
      mimeType: 'application/zip',
    });
    if (saved.error) {
      throw new Error(saved.error);
    }
    return saved.name ?? saved.uri;
  } catch (e) {
    if ((e as { code?: string }).code === 'OPERATION_CANCELED') {
      return null;
    }
    throw e;
  } finally {
    await removeIfExists(workDir);
    await removeIfExists(zipPath);
  }
}

/** Restaura un respaldo reemplazando chats y progreso actuales. */
export async function restoreBackup(): Promise<{ conversations: number; flashcards: number } | null> {
  const picked = await pickAndCopy('backup', appPath('tmp'));
  if (!picked) {
    return null;
  }
  const dir = appPath('tmp', `restore-${Date.now()}`);
  try {
    await unzip(picked.path, dir);
    const data = JSON.parse(await RNFS.readFile(`${dir}/backup.json`, 'utf8')) as BackupData;
    if (data.app !== APP_NAME || typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
      throw new Error('El archivo no es un respaldo válido de COBAEV IA.');
    }
    const [oldConv, oldMsg, oldCards, oldAttempts, oldGen, oldSettings] = await Promise.all([
      collections.conversations.query().fetch(),
      collections.messages.query().fetch(),
      collections.flashcards.query().fetch(),
      collections.quizAttempts.query().fetch(),
      collections.quizQuestions.query(Q.where('origin', 'generated')).fetch(),
      collections.settings.query().fetch(),
    ]);
    await database.write(async () => {
      const ops = [...oldConv, ...oldMsg, ...oldCards, ...oldAttempts, ...oldGen, ...oldSettings].map(r =>
        r.prepareDestroyPermanently(),
      );
      const idMap = new Map<string, string>();
      for (const c of data.conversations) {
        const rec = collections.conversations.prepareCreate((r: Conversation) => {
          r.title = c.title;
          r.subjectId = c.subjectId;
          r.mode = c.mode;
          setRawTimestamp(r, 'created_at', c.createdAt);
          r.updatedAt = new Date(c.updatedAt);
        });
        idMap.set(c.id, rec.id);
        ops.push(rec);
      }
      for (const m of data.messages) {
        const conversationId = idMap.get(m.conversationId);
        if (!conversationId) {
          continue;
        }
        ops.push(collections.messages.prepareCreate((r: Message) => {
          r.conversationId = conversationId;
          r.role = m.role as Message['role'];
          r.content = m.content;
          setRawTimestamp(r, 'created_at', m.createdAt);
        }));
      }
      for (const f of data.flashcards) {
        ops.push(collections.flashcards.prepareCreate((r: Flashcard) => {
          Object.assign(r, { subjectCode: f.subjectCode, front: f.front, back: f.back, interval: f.interval, ease: f.ease, repetitions: f.repetitions, dueAt: f.dueAt, origin: f.origin });
        }));
      }
      for (const a of data.quizAttempts) {
        ops.push(collections.quizAttempts.prepareCreate((r: QuizAttempt) => {
          r.subjectCode = a.subjectCode;
          r.total = a.total;
          r.correct = a.correct;
          setRawTimestamp(r, 'created_at', a.createdAt);
        }));
      }
      for (const q of data.generatedQuestions ?? []) {
        ops.push(collections.quizQuestions.prepareCreate((r: QuizQuestionRecord) => {
          Object.assign(r, { code: q.code, subjectCode: q.subjectCode, question: q.question, options: q.options, answerIndex: q.answerIndex, explanation: q.explanation, origin: 'generated' });
        }));
      }
      for (const s of data.settings) {
        ops.push(collections.settings.prepareCreate((r: Setting) => {
          r.key = s.key;
          r.value = s.value;
        }));
      }
      await database.batch(...ops);
    });
    return { conversations: data.conversations.length, flashcards: data.flashcards.length };
  } finally {
    await removeIfExists(dir);
    await removeIfExists(picked.path);
  }
}
