/**
 * Procesamiento de documentos (TXT, PDF, DOCX) para el RAG local.
 * - TXT: lectura directa.
 * - DOCX: descompresión y extracción de word/document.xml.
 * - PDF: cada página se renderiza a imagen y se procesa con OCR (ML Kit),
 *   lo que funciona también con PDFs escaneados.
 * Los archivos temporales se eliminan al terminar.
 */
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { unzip } from 'react-native-zip-archive';
import { docxXmlToText } from '../../core/docx';
import { normalizeText } from '../../core/chunking';
import { collections, database, type DocumentRecord } from '../../db';
import { RNFS, appPath, pickAndCopy, removeIfExists, toFilePath } from '../fileSystem';
import { recognize } from '../ocr/OcrService';
import { indexText } from '../rag/RagService';
import { VectorStore } from '../rag/VectorStore';

export type DocKind = 'txt' | 'pdf' | 'docx';

export const MAX_PDF_PAGES = 80;

export interface ProcessProgress {
  stage: 'extrayendo' | 'indexando';
  done: number;
  total: number;
}

export function detectKind(name: string): DocKind | null {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'txt' || ext === 'md') {
    return 'txt';
  }
  if (ext === 'pdf' || ext === 'docx') {
    return ext;
  }
  return null;
}

export async function extractText(path: string, kind: DocKind, onProgress?: (p: ProcessProgress) => void): Promise<string> {
  switch (kind) {
    case 'txt':
      return RNFS.readFile(path, 'utf8');
    case 'docx': {
      const dir = appPath('tmp', `docx-${Date.now()}`);
      try {
        await unzip(path, dir);
        const xml = await RNFS.readFile(`${dir}/word/document.xml`, 'utf8');
        return docxXmlToText(xml);
      } finally {
        await removeIfExists(dir);
      }
    }
    case 'pdf': {
      const pages = await PdfThumbnail.generateAllPages(path, 90);
      const texts: string[] = [];
      const total = Math.min(pages.length, MAX_PDF_PAGES);
      try {
        for (let i = 0; i < total; i++) {
          const { text } = await recognize(pages[i].uri);
          texts.push(text);
          onProgress?.({ stage: 'extrayendo', done: i + 1, total });
        }
      } finally {
        for (const page of pages) {
          await removeIfExists(toFilePath(page.uri));
        }
      }
      return texts.join('\n\n');
    }
  }
}

export async function importDocument(
  subjectCode: string | null,
  onProgress?: (p: ProcessProgress) => void,
): Promise<DocumentRecord | null> {
  const picked = await pickAndCopy('document', appPath('tmp'));
  if (!picked) {
    return null;
  }
  try {
    const kind = detectKind(picked.name);
    if (!kind) {
      throw new Error('Formato no soportado. Usa TXT, PDF o DOCX.');
    }
    const text = normalizeText(await extractText(picked.path, kind, onProgress));
    if (text.length < 20) {
      throw new Error('No se encontró texto legible en el documento.');
    }
    const record = (await database.write(() =>
      collections.documents.create((d: DocumentRecord) => {
        d.name = picked.name;
        d.kind = kind;
        d.subjectCode = subjectCode;
        d.charCount = text.length;
        d.chunkCount = 0;
      }),
    )) as DocumentRecord;
    try {
      const chunkCount = await indexText({
        ownerType: 'document',
        ownerId: record.id,
        source: picked.name,
        subjectCode,
        text,
        onProgress: (done, total) => onProgress?.({ stage: 'indexando', done, total }),
      });
      await database.write(() => record.update(d => {
        d.chunkCount = chunkCount;
      }));
    } catch (e) {
      await database.write(() => record.destroyPermanently());
      throw e;
    }
    return record;
  } finally {
    // Privacidad: el archivo original se elimina; solo se conservan los fragmentos indexados.
    await removeIfExists(picked.path);
  }
}

export async function deleteDocument(doc: DocumentRecord): Promise<void> {
  await VectorStore.deleteOwner('document', doc.id);
  await database.write(() => doc.destroyPermanently());
}
