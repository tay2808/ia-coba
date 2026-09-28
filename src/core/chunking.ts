/**
 * División de documentos en fragmentos (chunks) para indexación RAG.
 * Respeta párrafos y oraciones siempre que sea posible, con solapamiento
 * para no perder contexto entre fragmentos.
 */

export interface Chunk {
  index: number;
  text: string;
  /** Posición (en caracteres) dentro del texto normalizado. */
  start: number;
}

export interface ChunkOptions {
  chunkSize: number;
  overlap: number;
}

/** Normaliza espacios, guiones de corte de línea y saltos excesivos. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/­/g, '') // guion suave
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2') // palabras cortadas al final de línea
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoUnits(text: string, maxLen: number): string[] {
  const units: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) {
      continue;
    }
    if (p.length <= maxLen) {
      units.push(p);
      continue;
    }
    // Párrafo largo: dividir por oraciones.
    const sentences = p.split(/(?<=[.!?…;:])\s+/u);
    for (const s of sentences) {
      if (s.length <= maxLen) {
        units.push(s);
      } else {
        // Oración gigante (p. ej. tabla OCR): dividir por palabras.
        let buf = '';
        for (const w of s.split(/\s+/)) {
          if (buf && buf.length + w.length + 1 > maxLen) {
            units.push(buf);
            buf = w;
          } else {
            buf = buf ? `${buf} ${w}` : w;
          }
        }
        if (buf) {
          units.push(buf);
        }
      }
    }
  }
  return units;
}

export function chunkText(raw: string, { chunkSize, overlap }: ChunkOptions): Chunk[] {
  if (overlap >= chunkSize) {
    throw new Error('El solapamiento debe ser menor que el tamaño del fragmento.');
  }
  const text = normalizeText(raw);
  if (!text) {
    return [];
  }
  const units = splitIntoUnits(text, chunkSize);
  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentLen = 0;
  let cursor = 0;

  const flush = () => {
    if (!current.length) {
      return;
    }
    const chunkStr = current.join('\n');
    const start = Math.max(0, text.indexOf(current[0], cursor));
    chunks.push({ index: chunks.length, text: chunkStr, start });
    cursor = start;
    // Construir solapamiento con las últimas unidades.
    const tail: string[] = [];
    let tailLen = 0;
    for (let i = current.length - 1; i >= 0; i--) {
      if (tailLen + current[i].length > overlap) {
        break;
      }
      tail.unshift(current[i]);
      tailLen += current[i].length + 1;
    }
    current = tail;
    currentLen = tailLen;
  };

  for (const unit of units) {
    if (currentLen + unit.length + 1 > chunkSize && current.length) {
      const before = current.length;
      flush();
      // Si el solapamiento no deja espacio para la nueva unidad, descartarlo.
      if (currentLen + unit.length + 1 > chunkSize || current.length === before) {
        current = [];
        currentLen = 0;
      }
    }
    current.push(unit);
    currentLen += unit.length + 1;
  }
  if (current.length) {
    const last = chunks[chunks.length - 1];
    const chunkStr = current.join('\n');
    // No emitir un último fragmento que sea solo solapamiento ya incluido.
    if (!last || !last.text.endsWith(chunkStr)) {
      chunks.push({ index: chunks.length, text: chunkStr, start: Math.max(0, text.indexOf(current[0], cursor)) });
    }
  }
  return chunks;
}
