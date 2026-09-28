/**
 * Base vectorial local: op-sqlite con la extensión sqlite-vec (`vec0`).
 * Si la extensión no está disponible, cae a búsqueda por fuerza bruta en JS
 * con los embeddings guardados como BLOB (válido para colecciones pequeñas).
 */
import { open, type DB } from '@op-engineering/op-sqlite';
import { RAG } from '../../config/constants';
import { topK } from '../../core/vectorMath';

export type OwnerType = 'pack' | 'document';

export interface StoredChunk {
  chunkId: string;
  ownerType: OwnerType;
  ownerId: string;
  subjectCode: string | null;
  source: string;
  text: string;
}

export interface SearchHit extends StoredChunk {
  score: number;
}

export interface SearchOptions {
  k?: number;
  subjectCode?: string | null;
  minScore?: number;
}

const toBlob = (v: Float32Array) => v.slice().buffer;

class VectorStoreImpl {
  private db: DB | null = null;
  private hasVec = false;

  private async getDb(): Promise<DB> {
    if (this.db) {
      return this.db;
    }
    const db = open({ name: 'vectors.db' });
    await db.execute(`CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chunk_id TEXT UNIQUE NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      subject_code TEXT,
      source TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB
    )`);
    await db.execute('CREATE INDEX IF NOT EXISTS idx_chunks_owner ON chunks(owner_type, owner_id)');
    try {
      await db.execute('SELECT vec_version() AS v');
      await db.execute(
        `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[${RAG.embeddingDim}] distance_metric=cosine)`,
      );
      this.hasVec = true;
    } catch (e) {
      console.warn('[VectorStore] sqlite-vec no disponible, usando búsqueda en JS', e);
      this.hasVec = false;
    }
    this.db = db;
    return db;
  }

  get usingSqliteVec(): boolean {
    return this.hasVec;
  }

  async insert(chunks: StoredChunk[], vectors: Float32Array[]): Promise<void> {
    if (chunks.length !== vectors.length) {
      throw new Error('La cantidad de fragmentos y embeddings no coincide.');
    }
    const db = await this.getDb();
    await db.transaction(async tx => {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const vec = vectors[i];
        if (vec.length !== RAG.embeddingDim) {
          throw new Error(`Embedding con dimensión ${vec.length}, se esperaba ${RAG.embeddingDim}.`);
        }
        const res = await tx.execute(
          `INSERT OR REPLACE INTO chunks (chunk_id, owner_type, owner_id, subject_code, source, text, embedding)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [c.chunkId, c.ownerType, c.ownerId, c.subjectCode, c.source, c.text, this.hasVec ? null : toBlob(vec)],
        );
        if (this.hasVec) {
          // vec0 no admite UPSERT; los fragmentos previos del mismo dueño se borran antes de insertar.
          await tx.execute('INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)', [
            res.insertId!,
            toBlob(vec),
          ]);
        }
      }
    });
  }

  async deleteOwner(ownerType: OwnerType, ownerId: string): Promise<void> {
    const db = await this.getDb();
    await db.transaction(async tx => {
      if (this.hasVec) {
        await tx.execute(
          'DELETE FROM vec_chunks WHERE rowid IN (SELECT id FROM chunks WHERE owner_type = ? AND owner_id = ?)',
          [ownerType, ownerId],
        );
      }
      await tx.execute('DELETE FROM chunks WHERE owner_type = ? AND owner_id = ?', [ownerType, ownerId]);
    });
  }

  async search(query: Float32Array, opts: SearchOptions = {}): Promise<SearchHit[]> {
    const db = await this.getDb();
    const k = opts.k ?? RAG.topK;
    const minScore = opts.minScore ?? RAG.minScore;
    const matchSubject = (s: StoredChunk) =>
      !opts.subjectCode || s.subjectCode === opts.subjectCode || s.ownerType === 'document';

    if (this.hasVec) {
      // Se piden más candidatos para poder filtrar por materia después del KNN.
      const candidates = opts.subjectCode ? k * 6 : k;
      const res = await db.execute(
        `SELECT c.chunk_id, c.owner_type, c.owner_id, c.subject_code, c.source, c.text, v.distance
         FROM vec_chunks v JOIN chunks c ON c.id = v.rowid
         WHERE v.embedding MATCH ? AND k = ?
         ORDER BY v.distance`,
        [toBlob(query), candidates],
      );
      return res.rows
        .map(r => ({ ...rowToChunk(r), score: 1 - Number(r.distance) }))
        .filter(h => h.score >= minScore && matchSubject(h))
        .slice(0, k);
    }

    const res = await db.execute(
      'SELECT chunk_id, owner_type, owner_id, subject_code, source, text, embedding FROM chunks WHERE embedding IS NOT NULL',
    );
    const items = res.rows
      .map(r => ({ item: rowToChunk(r), vector: new Float32Array(r.embedding as ArrayBuffer) }))
      .filter(x => matchSubject(x.item));
    return topK(query, items, k, minScore).map(({ item, score }) => ({ ...item, score }));
  }

  async count(): Promise<number> {
    const db = await this.getDb();
    const res = await db.execute('SELECT COUNT(*) AS n FROM chunks');
    return Number(res.rows[0]?.n ?? 0);
  }
}

function rowToChunk(r: Record<string, unknown>): StoredChunk {
  return {
    chunkId: String(r.chunk_id),
    ownerType: r.owner_type as OwnerType,
    ownerId: String(r.owner_id),
    subjectCode: (r.subject_code as string | null) ?? null,
    source: String(r.source),
    text: String(r.text),
  };
}

export const VectorStore = new VectorStoreImpl();
