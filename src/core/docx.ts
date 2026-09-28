/**
 * Extracción de texto de documentos DOCX (Office Open XML).
 * El archivo .docx se descomprime en el dispositivo y aquí se procesa
 * `word/document.xml` sin dependencias externas.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, ent: string) => {
    if (ent[0] === '#') {
      const cp = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    return ENTITIES[ent.toLowerCase()] ?? match;
  });
}

/** Convierte el XML de `word/document.xml` en texto plano con párrafos. */
export function docxXmlToText(xml: string): string {
  const body = xml.replace(/<w:(instrText|delText)[^>]*>[\s\S]*?<\/w:\1>/g, '');
  const paragraphs: string[] = [];
  const paraRe = /<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g;
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(body))) {
    const p = m[0];
    let text = '';
    const tokenRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>|<w:cr\/>/g;
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(p))) {
      if (t[1] !== undefined) {
        text += decodeXmlEntities(t[1]);
      } else if (t[0].startsWith('<w:tab')) {
        text += '\t';
      } else {
        text += '\n';
      }
    }
    // Las viñetas/numeración no están en el texto; marcamos elementos de lista.
    if (/<w:numPr>/.test(p) && text.trim()) {
      text = `• ${text}`;
    }
    paragraphs.push(text);
  }
  return paragraphs
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
