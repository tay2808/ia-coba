/**
 * Persistencia de herramientas de estudio: quizzes, intentos y flashcards.
 */
import { Q } from '@nozbe/watermelondb';
import type { QuizQuestion } from '../../core/curriculumPack';
import {
  NEW_CARD_STATE,
  buildFlashcardGenerationPrompt,
  buildQuizGenerationPrompt,
  parseGeneratedFlashcards,
  parseGeneratedQuiz,
  reviewCard,
  type QuizResult,
  type RecallQuality,
} from '../../core/study';
import { collections, database, type Flashcard, type QuizAttempt, type QuizQuestionRecord, type Subject } from '../../db';
import { runToolPrompt } from '../chat/ChatService';
import { hitsToSnippets, retrieve } from '../rag/RagService';
import { formatSnippets } from '../../core/prompt';

export async function getQuestionPool(subjectCode: string): Promise<QuizQuestion[]> {
  const rows = (await collections.quizQuestions.query(Q.where('subject_code', subjectCode)).fetch()) as QuizQuestionRecord[];
  return rows.map(r => ({
    id: r.id,
    question: r.question,
    options: r.options,
    answerIndex: r.answerIndex,
    explanation: r.explanation ?? undefined,
  }));
}

export async function saveAttempt(subjectCode: string, result: QuizResult): Promise<void> {
  await database.write(() =>
    collections.quizAttempts.create((a: QuizAttempt) => {
      a.subjectCode = subjectCode;
      a.total = result.total;
      a.correct = result.correct;
    }),
  );
}

export async function getAttempts(subjectCode?: string): Promise<QuizAttempt[]> {
  const clauses = subjectCode ? [Q.where('subject_code', subjectCode)] : [];
  return (await collections.quizAttempts.query(...clauses, Q.sortBy('created_at', Q.desc)).fetch()) as QuizAttempt[];
}

/** Material de apoyo para generar preguntas: temas de la materia + fragmentos RAG. */
async function materialFor(subject: Subject, topic: string): Promise<string> {
  const topics = subject.units.flatMap(u => [u.title, ...u.topics.map(t => `- ${t.title}${t.summary ? `: ${t.summary}` : ''}`)]);
  const hits = await retrieve(`${subject.name} ${topic}`, subject.code, 3).catch(() => []);
  return [`Materia: ${subject.name}`, ...topics, hits.length ? formatSnippets(hitsToSnippets(hits)) : '']
    .join('\n')
    .slice(0, 3500);
}

export async function generateQuestions(subject: Subject, topic: string, count = 5): Promise<QuizQuestion[]> {
  const res = await runToolPrompt(buildQuizGenerationPrompt(topic, await materialFor(subject, topic), count), { maxNewTokens: 900 });
  const questions = parseGeneratedQuiz(res.text, `gen-${Date.now()}`);
  if (!questions.length) {
    throw new Error('El modelo no generó preguntas válidas. Intenta de nuevo o con un tema más específico.');
  }
  await database.write(async () => {
    await database.batch(
      ...questions.map(q =>
        collections.quizQuestions.prepareCreate((r: QuizQuestionRecord) => {
          r.code = q.id;
          r.subjectCode = subject.code;
          r.question = q.question;
          r.options = q.options;
          r.answerIndex = q.answerIndex;
          r.explanation = q.explanation ?? null;
          r.origin = 'generated';
        }),
      ),
    );
  });
  return questions;
}

export async function getFlashcards(subjectCode?: string): Promise<Flashcard[]> {
  const clauses = subjectCode ? [Q.where('subject_code', subjectCode)] : [];
  return (await collections.flashcards.query(...clauses, Q.sortBy('due_at', Q.asc)).fetch()) as Flashcard[];
}

export async function gradeFlashcard(card: Flashcard, quality: RecallQuality): Promise<void> {
  const next = reviewCard(card.review, quality, Date.now());
  await database.write(() =>
    card.update(c => {
      c.interval = next.interval;
      c.ease = next.ease;
      c.repetitions = next.repetitions;
      c.dueAt = next.dueAt;
    }),
  );
}

export async function addFlashcards(subjectCode: string, cards: Array<{ front: string; back: string }>, origin: 'generated' | 'user'): Promise<void> {
  const now = Date.now();
  await database.write(async () => {
    await database.batch(
      ...cards.map(card =>
        collections.flashcards.prepareCreate((r: Flashcard) => {
          const s = NEW_CARD_STATE(now);
          r.subjectCode = subjectCode;
          r.front = card.front;
          r.back = card.back;
          r.interval = s.interval;
          r.ease = s.ease;
          r.repetitions = s.repetitions;
          r.dueAt = s.dueAt;
          r.origin = origin;
        }),
      ),
    );
  });
}

export async function generateFlashcards(subject: Subject, topic: string, count = 8): Promise<number> {
  const res = await runToolPrompt(buildFlashcardGenerationPrompt(topic, await materialFor(subject, topic), count), { maxNewTokens: 800 });
  const cards = parseGeneratedFlashcards(res.text);
  if (!cards.length) {
    throw new Error('El modelo no generó tarjetas válidas.');
  }
  await addFlashcards(subject.code, cards, 'generated');
  return cards.length;
}
