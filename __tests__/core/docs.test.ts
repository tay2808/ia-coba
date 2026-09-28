import { decodeXmlEntities, docxXmlToText } from '../../src/core/docx';
import { blocksToText, cleanOcrText, looksLikeMath, orderBlocks, suggestCropRect } from '../../src/core/ocrLayout';

describe('DOCX', () => {
  it('extrae párrafos, tabulaciones, saltos y listas', () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Tarea de </w:t></w:r><w:r><w:t xml:space="preserve">Física &amp; Química</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Nombre:</w:t><w:tab/><w:t>Ana</w:t><w:br/><w:t>Grupo 3</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Punto uno</w:t></w:r></w:p>' +
      '<w:p><w:r><w:instrText>PAGE</w:instrText><w:t>Fin</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    expect(docxXmlToText(xml)).toBe('Tarea de Física & Química\nNombre:\tAna\nGrupo 3\n• Punto uno\nFin');
  });

  it('decodifica entidades numéricas', () => {
    expect(decodeXmlEntities('&#241;&#xF1;&lt;&desconocida;')).toBe('ññ<&desconocida;');
  });
});

describe('OCR', () => {
  const blocks = [
    { text: 'Derecha', frame: { left: 300, top: 12, width: 100, height: 20 } },
    { text: 'Abajo', frame: { left: 10, top: 100, width: 100, height: 20 } },
    { text: 'Izquierda', frame: { left: 10, top: 10, width: 100, height: 20 } },
  ];

  it('ordena en orden de lectura', () => {
    expect(orderBlocks(blocks).map(b => b.text)).toEqual(['Izquierda', 'Derecha', 'Abajo']);
    expect(blocksToText(blocks)).toBe('Izquierda\n\nDerecha\n\nAbajo');
  });

  it('limpia texto OCR', () => {
    expect(cleanOcrText('¿ Qué   es , esto ?')).toBe('¿Qué es, esto?');
  });

  it('sugiere recorte alrededor del texto', () => {
    expect(suggestCropRect(blocks, 1000, 1000)).toEqual({ left: 0, top: 0, width: 440, height: 160 });
    expect(suggestCropRect([], 100, 100)).toBeNull();
    expect(suggestCropRect([{ text: 'x', frame: { left: 0, top: 0, width: 100, height: 100 } }], 100, 100)).toBeNull();
  });

  it('detecta ejercicios matemáticos', () => {
    expect(looksLikeMath('2x + 3 = 11, x = ?')).toBe(true);
    expect(looksLikeMath('La Revolución Mexicana inició en 1910.')).toBe(false);
  });
});
