import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { migrations } from './migrations';
import {
  Conversation,
  DocumentRecord,
  Flashcard,
  LlmModel,
  Message,
  PackRecord,
  QuizAttempt,
  QuizQuestionRecord,
  Setting,
  Subject,
  modelClasses,
} from './models';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'cobaev_ia',
  jsi: true,
  onSetUpError: error => {
    console.error('[DB] Error al inicializar la base de datos', error);
  },
});

export const database = new Database({ adapter, modelClasses });

export const collections = {
  conversations: database.get<Conversation>('conversations'),
  messages: database.get<Message>('messages'),
  models: database.get<LlmModel>('llm_models'),
  subjects: database.get<Subject>('subjects'),
  quizQuestions: database.get<QuizQuestionRecord>('quiz_questions'),
  quizAttempts: database.get<QuizAttempt>('quiz_attempts'),
  flashcards: database.get<Flashcard>('flashcards'),
  documents: database.get<DocumentRecord>('documents'),
  packs: database.get<PackRecord>('packs'),
  settings: database.get<Setting>('settings'),
};

export async function getSetting(key: string): Promise<string | null> {
  const rows = await collections.settings.query(Q.where('key', key)).fetch();
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const rows = await collections.settings.query(Q.where('key', key)).fetch();
  await database.write(async () => {
    if (rows[0]) {
      await rows[0].update(r => {
        r.value = value;
      });
    } else {
      await collections.settings.create(r => {
        r.key = key;
        r.value = value;
      });
    }
  });
}

/** Asigna un timestamp de solo lectura (created_at) al restaurar respaldos. */
export function setRawTimestamp(record: { _raw: object }, column: 'created_at', value: number): void {
  (record._raw as Record<string, unknown>)[column] = value;
}

export * from './models';
