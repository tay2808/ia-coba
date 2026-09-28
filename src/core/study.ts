/**
 * Herramientas de estudio offline: quizzes, flashcards con repetición
 * espaciada (SM-2) y prompts para explicación paso a paso.
 */
import type { BuiltPrompt } from './humanizer';
import type { QuizQuestion } from './curriculumPack';

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

export interface QuizAnswer {
  questionId: string;
  selectedIndex: number;
}

export interface QuizResult {
  total: number;
  correct: number;
  percentage: number;
  /** Calificación en escala 0-10 usada en bachillerato. */
  grade: number;
  details: Array<{ question: QuizQuestion; selectedIndex: number; isCorrect: boolean }>;
}

/** PRNG determinista (mulberry32) para barajar de forma reproducible en pruebas. */
/* eslint-disable no-bitwise */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise */

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Baraja las opciones de una pregunta manteniendo el índice correcto. */
export function shuffleOptions(q: QuizQuestion, random: () => number = Math.random): QuizQuestion {
  const order = shuffle(q.options.map((_, i) => i), random);
  return {
    ...q,
    options: order.map(i => q.options[i]),
    answerIndex: order.indexOf(q.answerIndex),
  };
}

export function buildQuiz(pool: QuizQuestion[], count: number, random: () => number = Math.random): QuizQuestion[] {
  return shuffle(pool, random)
    .slice(0, Math.min(count, pool.length))
    .map(q => shuffleOptions(q, random));
}

export function gradeQuiz(questions: QuizQuestion[], answers: QuizAnswer[]): QuizResult {
  const byId = new Map(answers.map(a => [a.questionId, a.selectedIndex]));
  const details = questions.map(question => {
    const selectedIndex = byId.get(question.id) ?? -1;
    return { question, selectedIndex, isCorrect: selectedIndex === question.answerIndex };
  });
  const correct = details.filter(d => d.isCorrect).length;
  const total = questions.length;
  const percentage = total ? Math.round((correct / total) * 100) : 0;
  return { total, correct, percentage, grade: Math.round((percentage / 10) * 10) / 10, details };
}

export function buildQuizGenerationPrompt(topic: string, material: string, count = 5): BuiltPrompt {
  return {
    system:
      'Eres un profesor de bachillerato que crea exámenes de opción múltiple en español. ' +
      'Genera preguntas claras, con 4 opciones y solo una correcta, basadas únicamente en el material dado. ' +
      'Responde SOLO con un arreglo JSON válido, sin texto adicional, con este formato:\n' +
      '[{"question":"...","options":["a","b","c","d"],"answerIndex":0,"explanation":"..."}]',
    user: `Tema: ${topic}\nNúmero de preguntas: ${count}\n\nMaterial:\n${material}`,
    temperature: 0.4,
  };
}

/** Extrae el primer arreglo JSON de la salida del modelo (tolerante a texto extra). */
export function extractJsonArray(output: string): unknown[] | null {
  const fenced = output.replace(/```(?:json)?/gi, '');
  const start = fenced.indexOf('[');
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < fenced.length; i++) {
    const ch = fenced[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(fenced.slice(start, i + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function parseGeneratedQuiz(output: string, idPrefix = 'gen'): QuizQuestion[] {
  const arr = extractJsonArray(output) ?? [];
  const out: QuizQuestion[] = [];
  arr.forEach((raw, i) => {
    const q = raw as Partial<QuizQuestion>;
    if (
      typeof q?.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      q.options.every(o => typeof o === 'string') &&
      Number.isInteger(q.answerIndex) &&
      q.answerIndex! >= 0 &&
      q.answerIndex! < q.options.length
    ) {
      out.push({
        id: `${idPrefix}-${i}`,
        question: q.question,
        options: q.options,
        answerIndex: q.answerIndex!,
        explanation: typeof q.explanation === 'string' ? q.explanation : undefined,
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Flashcards (algoritmo SM-2 simplificado)
// ---------------------------------------------------------------------------

export interface ReviewState {
  /** Días hasta el siguiente repaso. */
  interval: number;
  /** Factor de facilidad (mínimo 1.3). */
  ease: number;
  repetitions: number;
  /** Timestamp (ms) del próximo repaso. */
  dueAt: number;
}

/** Calificación del recuerdo: 0 = no lo sabía, 3 = difícil, 4 = bien, 5 = fácil. */
export type RecallQuality = 0 | 1 | 2 | 3 | 4 | 5;

export const NEW_CARD_STATE = (now: number): ReviewState => ({
  interval: 0,
  ease: 2.5,
  repetitions: 0,
  dueAt: now,
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function reviewCard(state: ReviewState, quality: RecallQuality, now: number): ReviewState {
  let { interval, ease, repetitions } = state;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  ease = Math.round(ease * 100) / 100;
  // Tarjetas falladas se vuelven a mostrar en 10 minutos dentro de la misma sesión.
  const dueAt = quality < 3 ? now + 10 * 60 * 1000 : now + interval * DAY_MS;
  return { interval, ease, repetitions, dueAt };
}

export function dueCards<T extends { review: ReviewState }>(cards: T[], now: number): T[] {
  return cards.filter(c => c.review.dueAt <= now).sort((a, b) => a.review.dueAt - b.review.dueAt);
}

export function buildFlashcardGenerationPrompt(topic: string, material: string, count = 8): BuiltPrompt {
  return {
    system:
      'Eres un tutor que crea tarjetas de estudio (flashcards) en español para bachillerato. ' +
      'Cada tarjeta tiene un frente breve (pregunta o concepto) y un reverso claro (respuesta en 1-2 oraciones). ' +
      'Responde SOLO con un arreglo JSON: [{"front":"...","back":"..."}]',
    user: `Tema: ${topic}\nNúmero de tarjetas: ${count}\n\nMaterial:\n${material}`,
    temperature: 0.4,
  };
}

export function parseGeneratedFlashcards(output: string): Array<{ front: string; back: string }> {
  return (extractJsonArray(output) ?? [])
    .filter((c): c is { front: string; back: string } => {
      const card = c as { front?: unknown; back?: unknown };
      return typeof card?.front === 'string' && typeof card?.back === 'string';
    })
    .map(c => ({ front: c.front.trim(), back: c.back.trim() }));
}

// ---------------------------------------------------------------------------
// Explicador paso a paso
// ---------------------------------------------------------------------------

export function buildStepByStepPrompt(problem: string, subject?: string): BuiltPrompt {
  return {
    system:
      'Eres un tutor paciente de bachillerato. Explica la solución PASO A PASO, numerando cada paso. ' +
      'En cada paso indica qué se hace y por qué. Al final escribe "Resultado:" con la respuesta ' +
      'y una sección "Para practicar:" con un ejercicio similar sin resolver. ' +
      'Si el enunciado está incompleto o es ambiguo (por ejemplo por un error de OCR), menciónalo.' +
      (subject ? ` Materia: ${subject}.` : ''),
    user: problem.trim(),
    temperature: 0.3,
  };
}
