import { chunkText, normalizeText } from '../../src/core/chunking';
import {
  cosineSimilarity,
  l2Normalize,
  meanPool,
  splitFloat32Buffer,
  topK,
} from '../../src/core/vectorMath';
import { WordPieceTokenizer } from '../../src/core/wordpiece';

describe('chunking', () => {
  it('normaliza texto de PDF/OCR', () => {
    expect(normalizeText('foto-\nsíntesis   es\r\n\n\n\nvida')).toBe('fotosíntesis es\n\nvida');
  });

  it('respeta el tamaño máximo y mantiene solapamiento', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Párrafo ${i}. ` + 'Texto de ejemplo con contenido. '.repeat(5));
    const chunks = chunkText(paragraphs.join('\n\n'), { chunkSize: 400, overlap: 180 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(400);
    }
    // Solapamiento: el último párrafo de un chunk inicia el siguiente.
    const lastOfFirst = chunks[0].text.split('\n').pop()!;
    expect(chunks[1].text.startsWith(lastOfFirst)).toBe(true);
    // Todo el contenido está cubierto.
    const joined = chunks.map(c => c.text).join('\n');
    expect(joined).toContain('Párrafo 29.');
  });

  it('divide oraciones y palabras gigantes', () => {
    const long = 'palabra '.repeat(400);
    const chunks = chunkText(long, { chunkSize: 200, overlap: 20 });
    expect(chunks.every(c => c.text.length <= 200)).toBe(true);
  });

  it('devuelve vacío para texto vacío y valida parámetros', () => {
    expect(chunkText('   ', { chunkSize: 100, overlap: 10 })).toEqual([]);
    expect(() => chunkText('x', { chunkSize: 100, overlap: 100 })).toThrow();
  });
});

describe('vectorMath', () => {
  it('cosine y normalización', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    const n = l2Normalize([3, 4]);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
  });

  it('meanPool ignora posiciones con máscara 0', () => {
    const hidden = new Float32Array([1, 2, 3, 4, 100, 100]);
    const pooled = meanPool(hidden, [1, 1, 0], 3, 2);
    expect(Array.from(pooled)).toEqual([2, 3]);
    expect(() => meanPool(hidden, [1], 2, 2)).toThrow();
  });

  it('topK ordena por similitud y filtra', () => {
    const items = [
      { vector: [1, 0], item: 'a' },
      { vector: [0.9, 0.1], item: 'b' },
      { vector: [0, 1], item: 'c' },
    ];
    const r = topK([1, 0], items, 2, 0.5);
    expect(r.map(x => x.item)).toEqual(['a', 'b']);
  });

  it('splitFloat32Buffer', () => {
    const buf = new Float32Array([1, 2, 3, 4, 5, 6]).buffer;
    expect(splitFloat32Buffer(buf, 3).map(v => Array.from(v))).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(() => splitFloat32Buffer(buf, 4)).toThrow();
  });
});

describe('WordPieceTokenizer', () => {
  const vocab = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', 'la', 'foto', '##sin', '##tesis', 'es', 'vida', '.', ',', 'celula'];
  const tok = new WordPieceTokenizer(vocab);

  it('tokeniza con subpalabras, minúsculas y sin acentos', () => {
    expect(tok.tokenize('La Fotosíntesis es vida.')).toEqual(['la', 'foto', '##sin', '##tesis', 'es', 'vida', '.']);
    expect(tok.tokenize('Célula, xyz')).toEqual(['celula', ',', '[UNK]']);
  });

  it('codifica con tokens especiales, trunca y rellena', () => {
    const e = tok.encode('la vida', 6, true);
    expect(e.tokens).toEqual(['[CLS]', 'la', 'vida', '[SEP]', '[PAD]', '[PAD]']);
    expect(e.inputIds).toEqual([2, 4, 9, 3, 0, 0]);
    expect(e.attentionMask).toEqual([1, 1, 1, 1, 0, 0]);
    const t = tok.encode('la vida es vida', 4);
    expect(t.tokens).toEqual(['[CLS]', 'la', 'vida', '[SEP]']);
  });

  it('se construye desde vocab.txt y valida tokens especiales', () => {
    const fromText = WordPieceTokenizer.fromVocabText(vocab.join('\n') + '\n');
    expect(fromText.vocabSize).toBe(vocab.length);
    expect(() => new WordPieceTokenizer(['a', 'b'])).toThrow();
  });
});
