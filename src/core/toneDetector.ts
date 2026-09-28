/**
 * Detector de tono heurístico (sin LLM) para dar retroalimentación instantánea.
 * Para un análisis más profundo se puede usar `buildToneAnalysisPrompt` con el LLM local.
 */
import type { BuiltPrompt } from './humanizer';

export type DetectedTone = 'formal' | 'informal' | 'academico' | 'robotico' | 'neutral';

export interface ToneReport {
  tone: DetectedTone;
  scores: Record<DetectedTone, number>;
  stats: {
    words: number;
    sentences: number;
    avgSentenceLength: number;
    sentenceLengthStdDev: number;
  };
  hints: string[];
}

const INFORMAL_MARKERS = [
  'wey', 'güey', 'neta', 'chido', 'padre', 'o sea', 'nel', 'simón', 'bro', 'jaja',
  'xd', 'pues', 'onda', 'qué onda', 'va', 'porfa', 'ok', 'oki', 'bueno pues',
];
const FORMAL_MARKERS = [
  'usted', 'atentamente', 'estimado', 'estimada', 'por medio de la presente',
  'le solicito', 'agradezco', 'cordialmente', 'quedo a sus órdenes',
];
const ACADEMIC_MARKERS = [
  'por lo tanto', 'no obstante', 'en consecuencia', 'asimismo', 'cabe señalar',
  'según', 'de acuerdo con', 'se concluye', 'hipótesis', 'metodología', 'análisis',
];
const ROBOTIC_MARKERS = [
  'en conclusión', 'cabe destacar', 'es importante mencionar', 'en resumen',
  'en el mundo actual', 'en la actualidad', 'juega un papel crucial', 'desempeña un papel fundamental',
  'sin lugar a dudas', 'en definitiva', 'es fundamental', 'adentrarnos',
];

function countMarkers(text: string, markers: string[]): number {
  let count = 0;
  for (const m of markers) {
    const re = new RegExp(`(^|[^\\p{L}])${escapeRegExp(m)}(?=$|[^\\p{L}])`, 'giu');
    count += (text.match(re) ?? []).length;
  }
  return count;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?¡¿…])\s+|\n+/u)
    .map(s => s.trim())
    .filter(s => /\p{L}/u.test(s));
}

export function detectTone(text: string): ToneReport {
  const lower = text.toLowerCase();
  const words = lower.match(/\p{L}+/gu) ?? [];
  const sentences = splitSentences(text);
  const lengths = sentences.map(s => (s.match(/\p{L}+/gu) ?? []).length);
  const avg = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length
    ? lengths.reduce((acc, l) => acc + (l - avg) ** 2, 0) / lengths.length
    : 0;
  const stdDev = Math.sqrt(variance);

  const per100 = (n: number) => (words.length ? (n * 100) / words.length : 0);

  const informal = per100(countMarkers(lower, INFORMAL_MARKERS)) * 3
    + (/[!?]{2,}|😂|🤣|xd/iu.test(text) ? 2 : 0);
  const formal = per100(countMarkers(lower, FORMAL_MARKERS)) * 4;
  const academic = per100(countMarkers(lower, ACADEMIC_MARKERS)) * 3 + (avg > 22 ? 1.5 : 0);
  // Texto robótico: muletillas de IA y oraciones de longitud muy uniforme.
  const uniformity = sentences.length >= 4 && avg > 0 && stdDev / avg < 0.25 ? 2 : 0;
  const robotic = per100(countMarkers(lower, ROBOTIC_MARKERS)) * 4 + uniformity;

  const scores: Record<DetectedTone, number> = {
    informal: round(informal),
    formal: round(formal),
    academico: round(academic),
    robotico: round(robotic),
    neutral: 1,
  };

  let tone: DetectedTone = 'neutral';
  let best = scores.neutral;
  for (const key of ['robotico', 'informal', 'formal', 'academico'] as DetectedTone[]) {
    if (scores[key] > best) {
      best = scores[key];
      tone = key;
    }
  }

  const hints: string[] = [];
  if (scores.robotico > 1) {
    hints.push('Se detectaron frases típicas de texto generado por IA; usa el Humanizador para naturalizarlo.');
  }
  if (avg > 30) {
    hints.push('Las oraciones son muy largas; considera dividirlas.');
  }
  if (uniformity) {
    hints.push('Todas las oraciones tienen una longitud parecida; variar el ritmo hace el texto más natural.');
  }

  return {
    tone,
    scores,
    stats: {
      words: words.length,
      sentences: sentences.length,
      avgSentenceLength: round(avg),
      sentenceLengthStdDev: round(stdDev),
    },
    hints,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildToneAnalysisPrompt(text: string): BuiltPrompt {
  return {
    system:
      'Eres un analista de estilo en español. Identifica el tono del texto (formal, informal, ' +
      'académico, persuasivo, emocional, robótico, etc.), explica brevemente por qué con ejemplos ' +
      'del propio texto y da dos sugerencias concretas para mejorarlo. Responde en menos de 150 palabras.',
    user: text.trim(),
    temperature: 0.3,
  };
}
