/**
 * Motor de inferencia local basado en llama.cpp (vía llama.rn).
 * Mantiene un único contexto cargado, soporta streaming de tokens y
 * cancelación, y adapta parámetros según el estado del dispositivo.
 */
import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn';
import { LLM_DEFAULTS } from '../../config/constants';
import type { ChatMessage, TokenCounter } from '../../core/prompt';
import { estimateTokens } from '../../core/prompt';
import { currentTuning } from '../performance';

export type LlmStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

export interface LoadOptions {
  contextSize?: number;
  gpuLayers?: number;
}

export interface GenerateOptions {
  temperature?: number;
  topP?: number;
  maxNewTokens?: number;
  stop?: string[];
  onToken?: (token: string, fullText: string) => void;
}

export interface GenerateResult {
  text: string;
  tokensPredicted: number;
  tokensPerSecond: number;
  stoppedByUser: boolean;
  truncated: boolean;
}

type Listener = (status: LlmStatus, info: { modelPath: string | null; error?: string; progress?: number }) => void;

/** Tokens de parada comunes de las plantillas de chat de Llama 3 y Qwen 2.5. */
const DEFAULT_STOP = ['<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|endoftext|>', '</s>'];

class LlamaServiceImpl {
  private context: LlamaContext | null = null;
  private modelPath: string | null = null;
  private status: LlmStatus = 'idle';
  private listeners = new Set<Listener>();
  private stopRequested = false;
  private cooldownUntil = 0;
  contextSize: number = LLM_DEFAULTS.contextSize;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status, { modelPath: this.modelPath });
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: LlmStatus, extra: { error?: string; progress?: number } = {}) {
    this.status = status;
    this.listeners.forEach(l => l(status, { modelPath: this.modelPath, ...extra }));
  }

  getStatus(): LlmStatus {
    return this.status;
  }

  getModelPath(): string | null {
    return this.modelPath;
  }

  isReady(): boolean {
    return this.context !== null && (this.status === 'ready' || this.status === 'generating');
  }

  async load(modelPath: string, opts: LoadOptions = {}): Promise<void> {
    if (this.modelPath === modelPath && this.context) {
      return;
    }
    await this.release();
    this.modelPath = modelPath;
    this.setStatus('loading', { progress: 0 });
    try {
      const tuning = await currentTuning(opts.contextSize ?? LLM_DEFAULTS.contextSize);
      this.contextSize = tuning.contextSize;
      this.context = await initLlama(
        {
          model: modelPath,
          n_ctx: tuning.contextSize,
          n_threads: tuning.threads,
          n_gpu_layers: opts.gpuLayers ?? LLM_DEFAULTS.gpuLayers,
          use_mlock: false,
          use_mmap: true,
        },
        progress => this.setStatus('loading', { progress }),
      );
      this.setStatus('ready');
    } catch (e) {
      this.context = null;
      const error = e instanceof Error ? e.message : String(e);
      this.setStatus('error', { error });
      throw new Error(`No se pudo cargar el modelo: ${error}`);
    }
  }

  async release(): Promise<void> {
    if (this.context) {
      try {
        await this.context.release();
      } catch {
        await releaseAllLlama();
      }
    }
    this.context = null;
    this.modelPath = null;
    this.setStatus('idle');
  }

  /** Cuenta tokens con el tokenizador real del modelo (o estimación si no hay modelo). */
  async countTokens(text: string): Promise<number> {
    if (!this.context) {
      return estimateTokens(text);
    }
    const { tokens } = await this.context.tokenize(text);
    return tokens.length;
  }

  /** Contador aproximado para cálculos síncronos de presupuesto. */
  get approxCounter(): TokenCounter {
    return estimateTokens;
  }

  async chat(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<GenerateResult> {
    if (!this.context) {
      throw new Error('No hay un modelo cargado. Importa y activa uno en el Gestor de Modelos.');
    }
    if (this.status === 'generating') {
      throw new Error('Ya hay una generación en curso.');
    }
    // Pausa de enfriamiento solicitada por el control térmico.
    const wait = this.cooldownUntil - Date.now();
    if (wait > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, wait));
    }
    const tuning = await currentTuning(this.contextSize);
    this.stopRequested = false;
    this.setStatus('generating');
    let fullText = '';
    const started = Date.now();
    try {
      const result = await this.context.completion(
        {
          messages,
          n_predict: Math.min(opts.maxNewTokens ?? LLM_DEFAULTS.maxNewTokens, tuning.maxNewTokens),
          temperature: opts.temperature ?? LLM_DEFAULTS.temperature,
          top_p: opts.topP ?? LLM_DEFAULTS.topP,
          stop: [...DEFAULT_STOP, ...(opts.stop ?? [])],
        },
        data => {
          if (data.token) {
            fullText += data.token;
            opts.onToken?.(data.token, fullText);
          }
        },
      );
      const seconds = Math.max(0.001, (Date.now() - started) / 1000);
      const tps = result.timings?.predicted_per_second ?? result.tokens_predicted / seconds;
      this.cooldownUntil = Date.now() + tuning.cooldownMs;
      return {
        text: (result.text ?? fullText).trim(),
        tokensPredicted: result.tokens_predicted,
        tokensPerSecond: Math.round(tps * 10) / 10,
        stoppedByUser: this.stopRequested,
        truncated: !!result.stopped_limit,
      };
    } finally {
      this.setStatus(this.context ? 'ready' : 'idle');
    }
  }

  async stop(): Promise<void> {
    if (this.context && this.status === 'generating') {
      this.stopRequested = true;
      await this.context.stopCompletion();
    }
  }
}

export const LlamaService = new LlamaServiceImpl();
