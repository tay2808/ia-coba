/**
 * Humanizador de textos: perfiles de tono y construcción de prompts
 * para reescribir textos sin perder el sentido original ni sonar robótico.
 */

export type ToneId =
  | 'estudiante'
  | 'profesional'
  | 'casual'
  | 'academico'
  | 'amable'
  | 'conciso';

export interface ToneProfile {
  id: ToneId;
  label: string;
  description: string;
  /** Instrucciones de estilo que se inyectan en el prompt del sistema. */
  guidelines: string[];
  /** Temperatura sugerida: los tonos creativos toleran más variación. */
  temperature: number;
}

export const TONE_PROFILES: Record<ToneId, ToneProfile> = {
  estudiante: {
    id: 'estudiante',
    label: 'Estudiante COBAEV',
    description: 'Como lo escribiría un estudiante de bachillerato de 16 años.',
    guidelines: [
      'Escribe como un estudiante mexicano de bachillerato de 16 años que entrega una tarea.',
      'Usa vocabulario sencillo y frases de longitud variada; evita tecnicismos innecesarios.',
      'Puedes usar conectores naturales como "o sea", "por eso", "además", sin abusar de ellos.',
      'No uses groserías ni modismos exagerados; debe sonar natural y respetuoso.',
    ],
    temperature: 0.8,
  },
  profesional: {
    id: 'profesional',
    label: 'Profesional',
    description: 'Formal, claro y directo, adecuado para trabajo u oficios.',
    guidelines: [
      'Usa un registro formal y claro, con oraciones bien estructuradas.',
      'Evita coloquialismos y expresiones ambiguas.',
      'Prioriza la precisión y un orden lógico de las ideas.',
    ],
    temperature: 0.5,
  },
  casual: {
    id: 'casual',
    label: 'Casual',
    description: 'Relajado y cercano, como un mensaje a un amigo.',
    guidelines: [
      'Usa un tono relajado y cercano, como si hablaras con un amigo.',
      'Puedes usar contracciones y frases cortas.',
      'Mantén la ortografía correcta aunque el tono sea informal.',
    ],
    temperature: 0.85,
  },
  academico: {
    id: 'academico',
    label: 'Académico',
    description: 'Riguroso y objetivo, para ensayos y reportes.',
    guidelines: [
      'Usa un registro académico, impersonal y objetivo.',
      'Emplea conectores lógicos (por lo tanto, en consecuencia, no obstante).',
      'No inventes citas ni datos que no estén en el texto original.',
    ],
    temperature: 0.5,
  },
  amable: {
    id: 'amable',
    label: 'Amable',
    description: 'Cálido y empático.',
    guidelines: [
      'Usa un tono cálido, empático y respetuoso.',
      'Suaviza las afirmaciones tajantes sin cambiar su significado.',
    ],
    temperature: 0.7,
  },
  conciso: {
    id: 'conciso',
    label: 'Conciso',
    description: 'Lo mismo, con menos palabras.',
    guidelines: [
      'Reduce la longitud del texto al mínimo sin perder información importante.',
      'Elimina redundancias y relleno.',
    ],
    temperature: 0.4,
  },
};

/** Reglas comunes a todos los tonos para evitar un lenguaje robótico. */
const ANTI_ROBOTIC_RULES = [
  'Conserva exactamente el significado, los datos y las ideas del texto original.',
  'No agregues información nueva ni opiniones propias.',
  'Varía la longitud de las oraciones y evita estructuras repetitivas.',
  'Evita muletillas típicas de IA como "en conclusión", "cabe destacar", "es importante mencionar" o "en resumen" salvo que estén en el original.',
  'No uses listas si el original es un párrafo.',
  'Responde únicamente con el texto reescrito, sin explicaciones ni comillas.',
];

export interface HumanizeRequest {
  text: string;
  tone: ToneId;
  /** Instrucción adicional opcional del usuario (p. ej. "más corto"). */
  extraInstruction?: string;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  temperature: number;
}

export function buildHumanizerPrompt(req: HumanizeRequest): BuiltPrompt {
  const profile = TONE_PROFILES[req.tone];
  if (!profile) {
    throw new Error(`Tono desconocido: ${req.tone}`);
  }
  const text = req.text.trim();
  if (!text) {
    throw new Error('El texto a humanizar está vacío.');
  }
  const rules = [...profile.guidelines, ...ANTI_ROBOTIC_RULES];
  if (req.extraInstruction?.trim()) {
    rules.push(`Indicación adicional del usuario: ${req.extraInstruction.trim()}`);
  }
  const system =
    `Eres un editor experto en español que reescribe textos con el tono "${profile.label}".\n` +
    rules.map(r => `- ${r}`).join('\n');
  const user = `Reescribe el siguiente texto:\n\n${text}`;
  return { system, user, temperature: profile.temperature };
}

/** Prompt para corrección de redacción y ortografía. */
export function buildCorrectionPrompt(text: string): BuiltPrompt {
  const clean = text.trim();
  if (!clean) {
    throw new Error('El texto a corregir está vacío.');
  }
  return {
    system:
      'Eres un corrector de estilo de español. Corrige ortografía, acentuación, puntuación, ' +
      'concordancia y redacción. Conserva el tono y el significado del autor.\n' +
      'Responde con este formato exacto:\n' +
      'TEXTO CORREGIDO:\n<texto>\n\nCAMBIOS:\n- <cambio 1>\n- <cambio 2>',
    user: clean,
    temperature: 0.2,
  };
}

/** Limpia artefactos comunes en la salida del modelo (comillas envolventes, prefijos). */
export function cleanRewriteOutput(output: string): string {
  let out = output.trim();
  out = out.replace(/^(aquí (está|tienes)[^:]*:|texto reescrito:)\s*/i, '');
  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ['“', '”'],
    ['«', '»'],
  ];
  for (const [open, close] of quotePairs) {
    if (out.startsWith(open) && out.endsWith(close) && out.length > 1) {
      out = out.slice(open.length, out.length - close.length).trim();
    }
  }
  return out;
}
