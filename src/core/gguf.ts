/* eslint-disable no-bitwise -- lectura de formatos binarios */
/**
 * Lectura y validación de cabeceras GGUF (formato de modelos de llama.cpp)
 * y estimación del uso de RAM antes de cargar un modelo.
 */

export const GGUF_MAGIC = 0x46554747; // "GGUF" en little-endian

enum GgufType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

export type GgufValue = number | bigint | boolean | string | GgufArraySummary;

/** Los arreglos (vocabularios, merges) no se guardan completos, solo su resumen. */
export interface GgufArraySummary {
  type: 'array';
  itemType: number;
  length: number;
}

export interface GgufHeader {
  version: number;
  tensorCount: number;
  metadataCount: number;
  metadata: Record<string, GgufValue>;
  /** `false` si el buffer se agotó antes de leer todos los metadatos. */
  complete: boolean;
}

class OutOfData extends Error {}

/** Decodificador UTF-8 mínimo (Hermes no garantiza `TextDecoder`). */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    let cp: number;
    if (b0 < 0x80) {
      cp = b0;
    } else if (b0 >= 0xc0 && b0 < 0xe0 && i < bytes.length) {
      cp = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b0 >= 0xe0 && b0 < 0xf0 && i + 1 < bytes.length) {
      cp = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else if (b0 >= 0xf0 && i + 2 < bytes.length) {
      cp = ((b0 & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      cp = 0xfffd;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

class Reader {
  private offset = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private need(n: number) {
    if (this.offset + n > this.bytes.byteLength) {
      throw new OutOfData();
    }
  }

  u8() { this.need(1); return this.view.getUint8(this.offset++); }
  i8() { this.need(1); return this.view.getInt8(this.offset++); }
  u16() { this.need(2); const v = this.view.getUint16(this.offset, true); this.offset += 2; return v; }
  i16() { this.need(2); const v = this.view.getInt16(this.offset, true); this.offset += 2; return v; }
  u32() { this.need(4); const v = this.view.getUint32(this.offset, true); this.offset += 4; return v; }
  i32() { this.need(4); const v = this.view.getInt32(this.offset, true); this.offset += 4; return v; }
  f32() { this.need(4); const v = this.view.getFloat32(this.offset, true); this.offset += 4; return v; }
  f64() { this.need(8); const v = this.view.getFloat64(this.offset, true); this.offset += 8; return v; }
  u64() { this.need(8); const v = this.view.getBigUint64(this.offset, true); this.offset += 8; return v; }
  i64() { this.need(8); const v = this.view.getBigInt64(this.offset, true); this.offset += 8; return v; }

  skip(n: number) { this.need(n); this.offset += n; }

  str(): string {
    const len = Number(this.u64());
    this.need(len);
    const s = utf8Decode(this.bytes.subarray(this.offset, this.offset + len));
    this.offset += len;
    return s;
  }

  skipStr() {
    this.skip(Number(this.u64()));
  }
}

const FIXED_SIZES: Partial<Record<GgufType, number>> = {
  [GgufType.UINT8]: 1, [GgufType.INT8]: 1, [GgufType.BOOL]: 1,
  [GgufType.UINT16]: 2, [GgufType.INT16]: 2,
  [GgufType.UINT32]: 4, [GgufType.INT32]: 4, [GgufType.FLOAT32]: 4,
  [GgufType.UINT64]: 8, [GgufType.INT64]: 8, [GgufType.FLOAT64]: 8,
};

function readValue(r: Reader, type: GgufType): GgufValue {
  switch (type) {
    case GgufType.UINT8: return r.u8();
    case GgufType.INT8: return r.i8();
    case GgufType.UINT16: return r.u16();
    case GgufType.INT16: return r.i16();
    case GgufType.UINT32: return r.u32();
    case GgufType.INT32: return r.i32();
    case GgufType.FLOAT32: return r.f32();
    case GgufType.BOOL: return r.u8() !== 0;
    case GgufType.STRING: return r.str();
    case GgufType.UINT64: return r.u64();
    case GgufType.INT64: return r.i64();
    case GgufType.FLOAT64: return r.f64();
    case GgufType.ARRAY: {
      const itemType = r.u32() as GgufType;
      const length = Number(r.u64());
      const size = FIXED_SIZES[itemType];
      if (size !== undefined) {
        r.skip(size * length);
      } else if (itemType === GgufType.STRING) {
        for (let i = 0; i < length; i++) {
          r.skipStr();
        }
      } else {
        for (let i = 0; i < length; i++) {
          readValue(r, itemType);
        }
      }
      return { type: 'array', itemType, length };
    }
    default:
      throw new Error(`Tipo de valor GGUF desconocido: ${type}`);
  }
}

/** Devuelve verdadero si los primeros bytes corresponden a un archivo GGUF. */
export function hasGgufMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) {
    return false;
  }
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === GGUF_MAGIC;
}

/**
 * Analiza la cabecera GGUF. Acepta un buffer parcial (los primeros MB del
 * archivo): si se agota, devuelve los metadatos leídos con `complete: false`.
 */
export function parseGgufHeader(bytes: Uint8Array): GgufHeader {
  if (!hasGgufMagic(bytes)) {
    throw new Error('El archivo no es un modelo GGUF válido (firma incorrecta).');
  }
  const r = new Reader(bytes);
  r.u32();
  const version = r.u32();
  if (version < 2 || version > 3) {
    throw new Error(`Versión GGUF no soportada: ${version}`);
  }
  const tensorCount = Number(r.u64());
  const metadataCount = Number(r.u64());
  const metadata: Record<string, GgufValue> = {};
  let complete = true;
  try {
    for (let i = 0; i < metadataCount; i++) {
      const key = r.str();
      const type = r.u32() as GgufType;
      metadata[key] = readValue(r, type);
    }
  } catch (e) {
    if (e instanceof OutOfData) {
      complete = false;
    } else {
      throw e;
    }
  }
  return { version, tensorCount, metadataCount, metadata, complete };
}

const FILE_TYPES: Record<number, string> = {
  0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 7: 'Q8_0', 8: 'Q5_0', 9: 'Q5_1',
  10: 'Q2_K', 11: 'Q3_K_S', 12: 'Q3_K_M', 13: 'Q3_K_L', 14: 'Q4_K_S', 15: 'Q4_K_M',
  16: 'Q5_K_S', 17: 'Q5_K_M', 18: 'Q6_K', 19: 'IQ2_XXS', 20: 'IQ2_XS', 21: 'Q2_K_S',
  22: 'IQ3_XS', 23: 'IQ3_XXS', 24: 'IQ1_S', 25: 'IQ4_NL', 26: 'IQ3_S', 27: 'IQ3_M',
  28: 'IQ2_S', 29: 'IQ2_M', 30: 'IQ4_XS', 31: 'IQ1_M', 32: 'BF16',
};

export interface ModelInfo {
  name: string;
  architecture: string;
  quantization: string;
  contextLength?: number;
  blockCount?: number;
  embeddingLength?: number;
  headCount?: number;
  headCountKv?: number;
  hasChatTemplate: boolean;
  metadataComplete: boolean;
}

function num(v: GgufValue | undefined): number | undefined {
  if (typeof v === 'number') {
    return v;
  }
  if (typeof v === 'bigint') {
    return Number(v);
  }
  return undefined;
}

export function extractModelInfo(header: GgufHeader, fallbackName = 'Modelo sin nombre'): ModelInfo {
  const m = header.metadata;
  const arch = typeof m['general.architecture'] === 'string' ? (m['general.architecture'] as string) : 'desconocida';
  const fileType = num(m['general.file_type']);
  return {
    name: typeof m['general.name'] === 'string' ? (m['general.name'] as string) : fallbackName,
    architecture: arch,
    quantization: fileType !== undefined ? FILE_TYPES[fileType] ?? `tipo ${fileType}` : 'desconocida',
    contextLength: num(m[`${arch}.context_length`]),
    blockCount: num(m[`${arch}.block_count`]),
    embeddingLength: num(m[`${arch}.embedding_length`]),
    headCount: num(m[`${arch}.attention.head_count`]),
    headCountKv: num(m[`${arch}.attention.head_count_kv`]) ?? num(m[`${arch}.attention.head_count`]),
    hasChatTemplate: typeof m['tokenizer.chat_template'] === 'string',
    metadataComplete: header.complete,
  };
}

export interface RamEstimate {
  weightsMb: number;
  kvCacheMb: number;
  overheadMb: number;
  totalMb: number;
}

/**
 * Estima la RAM necesaria: pesos (mapeados) + caché KV en f16 + overhead de cómputo.
 */
export function estimateRam(fileSizeBytes: number, info: ModelInfo, contextSize: number): RamEstimate {
  const weightsMb = fileSizeBytes / (1024 * 1024);
  let kvCacheMb = 0;
  if (info.blockCount && info.embeddingLength && info.headCount) {
    const kvDim = (info.embeddingLength * (info.headCountKv ?? info.headCount)) / info.headCount;
    const bytes = 2 /* K y V */ * info.blockCount * contextSize * kvDim * 2 /* f16 */;
    kvCacheMb = bytes / (1024 * 1024);
  } else {
    // Sin metadatos: ~10% del tamaño del modelo por cada 2k de contexto.
    kvCacheMb = weightsMb * 0.1 * (contextSize / 2048);
  }
  const overheadMb = 150 + weightsMb * 0.05;
  const round = (n: number) => Math.round(n);
  return {
    weightsMb: round(weightsMb),
    kvCacheMb: round(kvCacheMb),
    overheadMb: round(overheadMb),
    totalMb: round(weightsMb + kvCacheMb + overheadMb),
  };
}

export type Fit = 'ok' | 'ajustado' | 'insuficiente';

/** Clasifica si el modelo cabe en la RAM disponible del dispositivo. */
export function ramFit(estimate: RamEstimate, availableMb: number): Fit {
  if (estimate.totalMb <= availableMb * 0.7) {
    return 'ok';
  }
  if (estimate.totalMb <= availableMb * 0.95) {
    return 'ajustado';
  }
  return 'insuficiente';
}

/** Convierte base64 a bytes sin depender de Buffer (no existe en Hermes). */
export function base64ToBytes(b64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < alphabet.length; i++) {
    lookup[alphabet.charCodeAt(i)] = i;
  }
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (p < len) { out[p++] = (triple >> 16) & 0xff; }
    if (p < len) { out[p++] = (triple >> 8) & 0xff; }
    if (p < len) { out[p++] = triple & 0xff; }
  }
  return out;
}
