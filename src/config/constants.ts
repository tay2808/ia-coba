/**
 * Constantes globales de COBAEV IA.
 * Todo funciona 100% offline: no hay endpoints remotos definidos en ningún lugar.
 */

export const APP_NAME = 'COBAEV IA';
export const CURRICULUM_VERSION = '2026-B';

/** Parámetros por defecto del motor llama.cpp (ajustables desde el Model Manager). */
export const LLM_DEFAULTS = {
  contextSize: 2048,
  maxNewTokens: 512,
  temperature: 0.7,
  topP: 0.9,
  threads: 4,
  gpuLayers: 0,
} as const;

/** Presupuesto de tokens reservado dentro de la ventana de contexto. */
export const CONTEXT_BUDGET = {
  /** Tokens reservados para la respuesta del modelo. */
  responseReserve: 512,
  /** Máximo de tokens dedicados a fragmentos RAG. */
  ragMax: 600,
} as const;

/** Configuración del sistema RAG local. */
export const RAG = {
  embeddingDim: 384, // all-MiniLM-L6-v2
  maxSequenceLength: 256,
  chunkSize: 700, // caracteres
  chunkOverlap: 120,
  topK: 4,
  minScore: 0.25,
} as const;

/** Umbrales de rendimiento para control térmico y de memoria. */
export const PERFORMANCE = {
  /** Si la RAM libre estimada cae por debajo de este valor (MB) se reduce el contexto. */
  lowMemoryMb: 600,
  /** Pausa entre generaciones largas para enfriar el dispositivo (ms). */
  thermalCooldownMs: 1500,
  /** Tokens por segundo mínimos antes de sugerir un modelo más pequeño. */
  minTokensPerSecond: 2,
} as const;

/** Nombres de carpetas dentro del sandbox de la app. */
export const DIRS = {
  models: 'models',
  embeddings: 'embeddings',
  packs: 'packs',
  documents: 'documents',
  backups: 'backups',
  tmp: 'tmp',
} as const;
