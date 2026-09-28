/**
 * Tokenizador WordPiece (compatible con BERT / all-MiniLM-L6-v2) implementado
 * en TypeScript puro para generar las entradas del modelo ONNX de embeddings
 * sin depender de ninguna librería nativa adicional.
 */

export interface WordPieceOptions {
  lowercase?: boolean;
  stripAccents?: boolean;
  maxInputCharsPerWord?: number;
  unkToken?: string;
  clsToken?: string;
  sepToken?: string;
  padToken?: string;
}

export interface EncodedInput {
  inputIds: number[];
  attentionMask: number[];
  tokenTypeIds: number[];
  tokens: string[];
}

function isPunctuation(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) {
    return true;
  }
  return /\p{P}/u.test(ch);
}

function isCjk(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x2f800 && cp <= 0x2fa1f)
  );
}

export class WordPieceTokenizer {
  private readonly vocab: Map<string, number>;
  private readonly opts: Required<WordPieceOptions>;

  constructor(vocab: Map<string, number> | string[], options: WordPieceOptions = {}) {
    this.vocab = Array.isArray(vocab) ? new Map(vocab.map((t, i) => [t, i])) : vocab;
    this.opts = {
      lowercase: options.lowercase ?? true,
      stripAccents: options.stripAccents ?? options.lowercase ?? true,
      maxInputCharsPerWord: options.maxInputCharsPerWord ?? 100,
      unkToken: options.unkToken ?? '[UNK]',
      clsToken: options.clsToken ?? '[CLS]',
      sepToken: options.sepToken ?? '[SEP]',
      padToken: options.padToken ?? '[PAD]',
    };
    for (const t of [this.opts.unkToken, this.opts.clsToken, this.opts.sepToken, this.opts.padToken]) {
      if (!this.vocab.has(t)) {
        throw new Error(`El vocabulario no contiene el token especial ${t}`);
      }
    }
  }

  /** Crea el tokenizador a partir del contenido de un `vocab.txt` (un token por línea). */
  static fromVocabText(text: string, options?: WordPieceOptions): WordPieceTokenizer {
    const lines = text.split(/\r?\n/);
    if (lines.length && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return new WordPieceTokenizer(lines, options);
  }

  get vocabSize(): number {
    return this.vocab.size;
  }

  /** Tokenización básica: limpieza, minúsculas, acentos y separación de puntuación. */
  basicTokenize(text: string): string[] {
    let clean = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp === 0 || cp === 0xfffd || /\p{Cc}/u.test(ch) && !/\s/.test(ch)) {
        continue;
      }
      clean += isCjk(cp) ? ` ${ch} ` : /\s/.test(ch) ? ' ' : ch;
    }
    const out: string[] = [];
    for (let word of clean.trim().split(/\s+/)) {
      if (!word) {
        continue;
      }
      if (this.opts.lowercase) {
        word = word.toLowerCase();
      }
      if (this.opts.stripAccents) {
        word = word.normalize('NFD').replace(/\p{Mn}/gu, '');
      }
      let buf = '';
      for (const ch of word) {
        if (isPunctuation(ch)) {
          if (buf) {
            out.push(buf);
            buf = '';
          }
          out.push(ch);
        } else {
          buf += ch;
        }
      }
      if (buf) {
        out.push(buf);
      }
    }
    return out;
  }

  /** Algoritmo greedy longest-match-first de WordPiece. */
  wordPiece(word: string): string[] {
    const chars = Array.from(word);
    if (chars.length > this.opts.maxInputCharsPerWord) {
      return [this.opts.unkToken];
    }
    const pieces: string[] = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let found: string | null = null;
      while (start < end) {
        let sub = chars.slice(start, end).join('');
        if (start > 0) {
          sub = `##${sub}`;
        }
        if (this.vocab.has(sub)) {
          found = sub;
          break;
        }
        end--;
      }
      if (found === null) {
        return [this.opts.unkToken];
      }
      pieces.push(found);
      start = end;
    }
    return pieces;
  }

  tokenize(text: string): string[] {
    return this.basicTokenize(text).flatMap(w => this.wordPiece(w));
  }

  /**
   * Codifica un texto con [CLS] ... [SEP], truncando a `maxLength`.
   * Si `padToMax` es verdadero, rellena con [PAD] hasta `maxLength`.
   */
  encode(text: string, maxLength: number, padToMax = false): EncodedInput {
    if (maxLength < 2) {
      throw new Error('maxLength debe ser al menos 2');
    }
    const body = this.tokenize(text).slice(0, maxLength - 2);
    const tokens = [this.opts.clsToken, ...body, this.opts.sepToken];
    const inputIds = tokens.map(t => this.vocab.get(t)!);
    const attentionMask = inputIds.map(() => 1);
    if (padToMax) {
      const padId = this.vocab.get(this.opts.padToken)!;
      while (inputIds.length < maxLength) {
        inputIds.push(padId);
        attentionMask.push(0);
        tokens.push(this.opts.padToken);
      }
    }
    return { inputIds, attentionMask, tokenTypeIds: inputIds.map(() => 0), tokens };
  }
}
