/**
 * Post-procesamiento de resultados OCR (Google ML Kit): orden de lectura,
 * limpieza y sugerencia de recorte inteligente alrededor del texto.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrBlockLike {
  text: string;
  frame?: Rect;
}

/**
 * Ordena bloques en orden de lectura (arriba→abajo, izquierda→derecha),
 * agrupando en la misma "fila" los bloques cuya altura se solapa.
 */
export function orderBlocks<T extends OcrBlockLike>(blocks: T[]): T[] {
  const withFrame = blocks.filter(b => b.frame);
  const without = blocks.filter(b => !b.frame);
  const sorted = withFrame.slice().sort((a, b) => a.frame!.top - b.frame!.top);
  const rows: T[][] = [];
  for (const block of sorted) {
    const f = block.frame!;
    const row = rows.find(r => {
      const ref = r[0].frame!;
      const overlap = Math.min(ref.top + ref.height, f.top + f.height) - Math.max(ref.top, f.top);
      return overlap > Math.min(ref.height, f.height) * 0.5;
    });
    if (row) {
      row.push(block);
    } else {
      rows.push([block]);
    }
  }
  return [...rows.flatMap(r => r.sort((a, b) => a.frame!.left - b.frame!.left)), ...without];
}

/** Limpia errores frecuentes de OCR en texto escolar. */
export function cleanOcrText(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([¿¡])\s+/g, '$1')
    .replace(/[|]{2,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function blocksToText(blocks: OcrBlockLike[]): string {
  return cleanOcrText(orderBlocks(blocks).map(b => b.text).join('\n\n'));
}

/**
 * Calcula un rectángulo de recorte que contiene todo el texto detectado,
 * con un margen proporcional, limitado a las dimensiones de la imagen.
 * Devuelve `null` si no hay texto o si el recorte no reduce la imagen.
 */
export function suggestCropRect(blocks: OcrBlockLike[], imageWidth: number, imageHeight: number, marginRatio = 0.04): Rect | null {
  const frames = blocks.map(b => b.frame).filter((f): f is Rect => !!f);
  if (!frames.length) {
    return null;
  }
  const minX = Math.min(...frames.map(f => f.left));
  const minY = Math.min(...frames.map(f => f.top));
  const maxX = Math.max(...frames.map(f => f.left + f.width));
  const maxY = Math.max(...frames.map(f => f.top + f.height));
  const mx = imageWidth * marginRatio;
  const my = imageHeight * marginRatio;
  const left = Math.max(0, Math.floor(minX - mx));
  const top = Math.max(0, Math.floor(minY - my));
  const right = Math.min(imageWidth, Math.ceil(maxX + mx));
  const bottom = Math.min(imageHeight, Math.ceil(maxY + my));
  const rect = { left, top, width: right - left, height: bottom - top };
  if (rect.width * rect.height > imageWidth * imageHeight * 0.92) {
    return null;
  }
  return rect;
}

/** Heurística: ¿parece un ejercicio matemático? (para elegir el prompt adecuado). */
export function looksLikeMath(text: string): boolean {
  const symbols = (text.match(/[=+\-×÷*/^√∫∑π<>≤≥]/g) ?? []).length;
  const digits = (text.match(/\d/g) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length || 1;
  return symbols >= 2 && (symbols + digits) / letters > 0.25;
}
