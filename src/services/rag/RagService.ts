/**
 * Orquestación RAG: indexar textos (chunking + embeddings + sqlite-vec)
 * y recuperar los fragmentos más relevantes para una pregunta.
 */
import { RAG } from '../../config/constants';
import { chunkText } from '../../core/chunking';
import type { ContextSnippet } from '../../core/prompt';
import { EmbeddingService } from './EmbeddingService';
import { VectorStore, type OwnerType, type SearchHit } from './VectorStore';

export interface IndexParams {
  ownerType: OwnerType;
  ownerId: string;
  source: string;
  subjectCode?: string | null;
  text: string;
  onProgress?: (done: number, total: number) => void;
}

export async function indexText(p: IndexParams): Promise<number> {
  const chunks = chunkText(p.text, { chunkSize: RAG.chunkSize, overlap: RAG.chunkOverlap });
  if (!chunks.length) {
    return 0;
  }
  const vectors = await EmbeddingService.embedMany(chunks.map(c => c.text), p.onProgress);
  await VectorStore.deleteOwner(p.ownerType, p.ownerId);
  await VectorStore.insert(
    chunks.map(c => ({
      chunkId: `${p.ownerType}:${p.ownerId}:${c.index}`,
      ownerType: p.ownerType,
      ownerId: p.ownerId,
      subjectCode: p.subjectCode ?? null,
      source: p.source,
      text: c.text,
    })),
    vectors,
  );
  return chunks.length;
}

export async function retrieve(question: string, subjectCode?: string | null, k: number = RAG.topK): Promise<SearchHit[]> {
  if (!(await EmbeddingService.isAvailable()) || (await VectorStore.count()) === 0) {
    return [];
  }
  const query = await EmbeddingService.embed(question);
  return VectorStore.search(query, { k, subjectCode });
}

export function hitsToSnippets(hits: SearchHit[]): ContextSnippet[] {
  return hits.map(h => ({ source: h.source, text: h.text }));
}
