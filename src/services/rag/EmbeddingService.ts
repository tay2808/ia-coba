/**
 * Generación de embeddings locales con ONNX Runtime Mobile
 * (modelo all-MiniLM-L6-v2 exportado a ONNX + tokenizador WordPiece en TS).
 *
 * Los archivos se empaquetan en `android/app/src/main/assets/embeddings/`
 * (ver tools/export_embedding_model.py) y se copian al sandbox en el primer uso.
 */
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { RAG } from '../../config/constants';
import { l2Normalize, meanPool } from '../../core/vectorMath';
import { WordPieceTokenizer } from '../../core/wordpiece';
import { RNFS, appPath } from '../fileSystem';

export const EMBEDDING_MODEL_ID = 'all-MiniLM-L6-v2';

const ASSET_DIR = 'embeddings';
const FILES = { model: 'model.onnx', vocab: 'vocab.txt' } as const;

class EmbeddingServiceImpl {
  private session: InferenceSession | null = null;
  private tokenizer: WordPieceTokenizer | null = null;
  private loading: Promise<void> | null = null;

  /** ¿Están disponibles los archivos del modelo (en assets o importados)? */
  async isAvailable(): Promise<boolean> {
    const dir = appPath('embeddings');
    if ((await RNFS.exists(`${dir}/${FILES.model}`)) && (await RNFS.exists(`${dir}/${FILES.vocab}`))) {
      return true;
    }
    try {
      return await RNFS.existsAssets(`${ASSET_DIR}/${FILES.model}`);
    } catch {
      return false;
    }
  }

  private async ensureFiles(): Promise<{ model: string; vocab: string }> {
    const dir = appPath('embeddings');
    await RNFS.mkdir(dir);
    const model = `${dir}/${FILES.model}`;
    const vocab = `${dir}/${FILES.vocab}`;
    for (const [dest, name] of [[model, FILES.model], [vocab, FILES.vocab]] as const) {
      if (!(await RNFS.exists(dest))) {
        if (!(await RNFS.existsAssets(`${ASSET_DIR}/${name}`))) {
          throw new Error(
            'El modelo de embeddings no está instalado. Ejecuta tools/export_embedding_model.py antes de compilar la app.',
          );
        }
        await RNFS.copyFileAssets(`${ASSET_DIR}/${name}`, dest);
      }
    }
    return { model, vocab };
  }

  async load(): Promise<void> {
    if (this.session) {
      return;
    }
    if (!this.loading) {
      this.loading = (async () => {
        const files = await this.ensureFiles();
        this.tokenizer = WordPieceTokenizer.fromVocabText(await RNFS.readFile(files.vocab, 'utf8'));
        this.session = await InferenceSession.create(files.model, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
        });
      })().finally(() => {
        this.loading = null;
      });
    }
    await this.loading;
  }

  async embed(text: string): Promise<Float32Array> {
    await this.load();
    const enc = this.tokenizer!.encode(text, RAG.maxSequenceLength);
    const seqLen = enc.inputIds.length;
    const toTensor = (values: number[]) =>
      new Tensor('int64', BigInt64Array.from(values.map(v => BigInt(v))), [1, seqLen]);
    const feeds: Record<string, Tensor> = {
      input_ids: toTensor(enc.inputIds),
      attention_mask: toTensor(enc.attentionMask),
    };
    if (this.session!.inputNames.includes('token_type_ids')) {
      feeds.token_type_ids = toTensor(enc.tokenTypeIds);
    }
    const output = await this.session!.run(feeds);
    const outName = output.last_hidden_state ? 'last_hidden_state' : this.session!.outputNames[0];
    const tensor = output[outName];
    const dims = tensor.dims;
    const data = tensor.data as Float32Array;
    // Algunos modelos exportados ya devuelven el embedding agrupado [1, dim].
    const vector = dims.length === 2 ? data : meanPool(data, enc.attentionMask, seqLen, dims[2]);
    return l2Normalize(vector);
  }

  async embedMany(texts: string[], onProgress?: (done: number, total: number) => void): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      out.push(await this.embed(texts[i]));
      onProgress?.(i + 1, texts.length);
      // Cede el hilo JS para no congelar la interfaz en documentos grandes.
      if (i % 8 === 7) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    return out;
  }

  async release(): Promise<void> {
    await this.session?.release();
    this.session = null;
  }
}

export const EmbeddingService = new EmbeddingServiceImpl();
