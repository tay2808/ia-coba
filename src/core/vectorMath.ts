/**
 * Utilidades vectoriales para embeddings (pooling, normalización, similitud).
 */

export type Vector = Float32Array | number[];

export function dot(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(`Dimensiones distintas: ${a.length} vs ${b.length}`);
  }
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] * b[i];
  }
  return s;
}

export function norm(a: Vector): number {
  return Math.sqrt(dot(a, a));
}

export function l2Normalize(a: Vector): Float32Array {
  const n = norm(a) || 1;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] / n;
  }
  return out;
}

export function cosineSimilarity(a: Vector, b: Vector): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) {
    return 0;
  }
  return dot(a, b) / (na * nb);
}

/**
 * Mean pooling sobre la salida `last_hidden_state` de un modelo tipo BERT
 * (forma [1, seqLen, dim] aplanada), ponderado por la máscara de atención.
 */
export function meanPool(hidden: Float32Array, attentionMask: ArrayLike<number | bigint>, seqLen: number, dim: number): Float32Array {
  if (hidden.length !== seqLen * dim) {
    throw new Error(`Tamaño de tensor inesperado: ${hidden.length} != ${seqLen}*${dim}`);
  }
  const out = new Float32Array(dim);
  let count = 0;
  for (let t = 0; t < seqLen; t++) {
    if (Number(attentionMask[t]) === 0) {
      continue;
    }
    count++;
    const offset = t * dim;
    for (let d = 0; d < dim; d++) {
      out[d] += hidden[offset + d];
    }
  }
  if (count > 0) {
    for (let d = 0; d < dim; d++) {
      out[d] /= count;
    }
  }
  return out;
}

export interface ScoredItem<T> {
  item: T;
  score: number;
}

/** Búsqueda por fuerza bruta (fallback cuando sqlite-vec no está disponible). */
export function topK<T>(query: Vector, items: Array<{ vector: Vector; item: T }>, k: number, minScore = -1): ScoredItem<T>[] {
  const scored: ScoredItem<T>[] = [];
  for (const { vector, item } of items) {
    const score = cosineSimilarity(query, vector);
    if (score >= minScore) {
      scored.push({ item, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** Convierte un buffer little-endian float32 en vectores de dimensión `dim`. */
export function splitFloat32Buffer(buffer: ArrayBuffer, dim: number): Float32Array[] {
  const all = new Float32Array(buffer);
  if (all.length % dim !== 0) {
    throw new Error(`El archivo de embeddings no es múltiplo de la dimensión ${dim}.`);
  }
  const out: Float32Array[] = [];
  for (let i = 0; i < all.length; i += dim) {
    out.push(all.subarray(i, i + dim));
  }
  return out;
}
