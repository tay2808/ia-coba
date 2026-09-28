import {
  NEW_CARD_STATE,
  buildQuiz,
  dueCards,
  extractJsonArray,
  gradeQuiz,
  parseGeneratedFlashcards,
  parseGeneratedQuiz,
  reviewCard,
  seededRandom,
  shuffleOptions,
} from '../../src/core/study';
import type { QuizQuestion } from '../../src/core/curriculumPack';

const pool: QuizQuestion[] = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i}`,
  question: `Pregunta ${i}`,
  options: ['A', 'B', 'C', 'D'],
  answerIndex: i % 4,
}));

describe('quizzes', () => {
  it('baraja opciones conservando la respuesta correcta', () => {
    const q = pool[2];
    const s = shuffleOptions(q, seededRandom(42));
    expect(s.options[s.answerIndex]).toBe(q.options[q.answerIndex]);
    expect([...s.options].sort()).toEqual([...q.options].sort());
  });

  it('construye y califica un quiz', () => {
    const quiz = buildQuiz(pool, 4, seededRandom(1));
    expect(quiz).toHaveLength(4);
    const answers = quiz.map((q, i) => ({ questionId: q.id, selectedIndex: i < 3 ? q.answerIndex : (q.answerIndex + 1) % 4 }));
    const r = gradeQuiz(quiz, answers);
    expect(r).toMatchObject({ total: 4, correct: 3, percentage: 75, grade: 7.5 });
    expect(gradeQuiz(quiz, []).correct).toBe(0);
  });

  it('parsea preguntas generadas por el LLM con texto extra', () => {
    const out =
      'Claro, aquí tienes:\n```json\n[{"question":"¿2+2?","options":["3","4"],"answerIndex":1,"explanation":"suma [básica]"},' +
      '{"question":"mala","options":["x"],"answerIndex":0}]\n```';
    const qs = parseGeneratedQuiz(out);
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ id: 'gen-0', answerIndex: 1, explanation: 'suma [básica]' });
    expect(extractJsonArray('sin json')).toBeNull();
    expect(extractJsonArray('[incompleto')).toBeNull();
  });

  it('parsea flashcards generadas', () => {
    expect(parseGeneratedFlashcards('[{"front":" Átomo ","back":"Unidad de materia"},{"front":1}]')).toEqual([
      { front: 'Átomo', back: 'Unidad de materia' },
    ]);
  });
});

describe('repetición espaciada (SM-2)', () => {
  const DAY = 86400000;
  it('aumenta el intervalo con respuestas correctas', () => {
    let s = NEW_CARD_STATE(0);
    s = reviewCard(s, 4, 0);
    expect(s).toMatchObject({ interval: 1, repetitions: 1 });
    s = reviewCard(s, 4, DAY);
    expect(s.interval).toBe(6);
    s = reviewCard(s, 5, 7 * DAY);
    expect(s.interval).toBeGreaterThan(6);
    expect(s.dueAt).toBe(7 * DAY + s.interval * DAY);
  });

  it('reinicia al fallar y nunca baja la facilidad de 1.3', () => {
    let s = NEW_CARD_STATE(0);
    for (let i = 0; i < 10; i++) {
      s = reviewCard(s, 0, 0);
    }
    expect(s.repetitions).toBe(0);
    expect(s.ease).toBe(1.3);
    expect(s.dueAt).toBe(10 * 60 * 1000);
  });

  it('filtra tarjetas pendientes', () => {
    const cards = [
      { id: 'a', review: { ...NEW_CARD_STATE(0), dueAt: 50 } },
      { id: 'b', review: { ...NEW_CARD_STATE(0), dueAt: 10 } },
      { id: 'c', review: { ...NEW_CARD_STATE(0), dueAt: 500 } },
    ];
    expect(dueCards(cards, 100).map(c => c.id)).toEqual(['b', 'a']);
  });
});
