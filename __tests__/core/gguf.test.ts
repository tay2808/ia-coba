/* eslint-disable no-bitwise -- lectura de formatos binarios */
/// <reference types="node" />
import {
  base64ToBytes,
  estimateRam,
  extractModelInfo,
  hasGgufMagic,
  parseGgufHeader,
  ramFit,
  utf8Decode,
} from '../../src/core/gguf';

/** Construye un archivo GGUF v3 sintético con metadatos. */
function buildGguf(entries: Array<[string, 'u32' | 'str' | 'strarr', number | string | string[]]>): Uint8Array {
  const parts: number[] = [];
  const u32 = (v: number) => parts.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const u64 = (v: number) => {
    u32(v);
    u32(0);
  };
  const str = (s: string) => {
    const bytes = Array.from(Buffer.from(s, 'utf8'));
    u64(bytes.length);
    parts.push(...bytes);
  };
  u32(0x46554747);
  u32(3);
  u64(201);
  u64(entries.length);
  for (const [key, type, value] of entries) {
    str(key);
    if (type === 'u32') { u32(4); u32(value as number); }
    if (type === 'str') { u32(8); str(value as string); }
    if (type === 'strarr') {
      u32(9); u32(8); u64((value as string[]).length);
      (value as string[]).forEach(str);
    }
  }
  return new Uint8Array(parts);
}

const sample = buildGguf([
  ['general.architecture', 'str', 'llama'],
  ['general.name', 'str', 'Llama 3.2 1B Instruct'],
  ['general.file_type', 'u32', 15],
  ['tokenizer.ggml.tokens', 'strarr', ['a', 'b', 'ñ']],
  ['llama.context_length', 'u32', 131072],
  ['llama.block_count', 'u32', 16],
  ['llama.embedding_length', 'u32', 2048],
  ['llama.attention.head_count', 'u32', 32],
  ['llama.attention.head_count_kv', 'u32', 8],
  ['tokenizer.chat_template', 'str', '{% for m in messages %}{{ m.content }}{% endfor %}'],
]);

describe('GGUF', () => {
  it('detecta la firma', () => {
    expect(hasGgufMagic(sample)).toBe(true);
    expect(hasGgufMagic(new Uint8Array([1, 2, 3, 4]))).toBe(false);
    expect(() => parseGgufHeader(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]))).toThrow(/GGUF/);
  });

  it('lee metadatos y resume arreglos', () => {
    const h = parseGgufHeader(sample);
    expect(h.version).toBe(3);
    expect(h.tensorCount).toBe(201);
    expect(h.complete).toBe(true);
    expect(h.metadata['tokenizer.ggml.tokens']).toEqual({ type: 'array', itemType: 8, length: 3 });
    const info = extractModelInfo(h);
    expect(info).toMatchObject({
      name: 'Llama 3.2 1B Instruct',
      architecture: 'llama',
      quantization: 'Q4_K_M',
      contextLength: 131072,
      blockCount: 16,
      headCountKv: 8,
      hasChatTemplate: true,
    });
  });

  it('tolera buffers parciales', () => {
    const h = parseGgufHeader(sample.subarray(0, 120));
    expect(h.complete).toBe(false);
    expect(h.metadata['general.architecture']).toBe('llama');
  });

  it('estima RAM y clasifica el ajuste', () => {
    const info = extractModelInfo(parseGgufHeader(sample));
    const est = estimateRam(800 * 1024 * 1024, info, 2048);
    // Total ≈ 800 + 64 + 190 = 1054 MB. KV: 2 * 16 capas * 2048 ctx * 512 dim * 2 bytes = 64 MB
    expect(est.kvCacheMb).toBe(64);
    expect(est.weightsMb).toBe(800);
    expect(ramFit(est, 4000)).toBe('ok');
    expect(ramFit(est, 1150)).toBe('ajustado');
    expect(ramFit(est, 800)).toBe('insuficiente');
  });

  it('decodifica base64 y UTF-8 sin Buffer', () => {
    const b64 = Buffer.from(sample.subarray(0, 64)).toString('base64');
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(sample.subarray(0, 64)));
    expect(utf8Decode(new Uint8Array(Buffer.from('Añoñó 😀', 'utf8')))).toBe('Añoñó 😀');
  });
});
