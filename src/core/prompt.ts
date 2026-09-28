/**
 * Construcción de conversaciones para el LLM local con preservación de contexto
 * y truncamiento automático para respetar la ventana de contexto del modelo.
 */

export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ContextSnippet {
  source: string;
  text: string;
}

export type TokenCounter = (text: string) => number;

/**
 * Estimador rápido de tokens (≈ 3.6 caracteres por token en español para
 * tokenizadores BPE como los de Llama 3 / Qwen). Se usa cuando no se
 * quiere pagar el costo de tokenizar con el modelo real.
 */
export const estimateTokens: TokenCounter = text => Math.ceil(text.length / 3.6);

/** Overhead aproximado de las etiquetas de la plantilla de chat por mensaje. */
const MESSAGE_OVERHEAD = 6;

export const BASE_SYSTEM_PROMPT =
  'Eres COBAEV IA, un asistente educativo para estudiantes del Colegio de Bachilleres del Estado de Veracruz. ' +
  'Funcionas completamente sin internet dentro del teléfono del estudiante. ' +
  'Responde siempre en español claro, adaptado a un estudiante de bachillerato. ' +
  'Explica paso a paso cuando se trate de ejercicios, fomenta que el estudiante razone y no solo copie. ' +
  'Si no sabes algo o el contexto no lo incluye, dilo honestamente en lugar de inventar.';

export interface BuildConversationOptions {
  systemPrompt?: string;
  history: ChatMessage[];
  userMessage: string;
  /** Fragmentos recuperados por RAG (documentos, temarios). */
  snippets?: ContextSnippet[];
  /** Texto extraído por OCR de una imagen adjunta. */
  attachmentText?: string;
  contextSize: number;
  responseReserve: number;
  ragBudget?: number;
  countTokens?: TokenCounter;
}

export interface BuiltConversation {
  messages: ChatMessage[];
  promptTokens: number;
  droppedMessages: number;
  usedSnippets: ContextSnippet[];
}

/** Recorta un texto para que quepa en `maxTokens`, cortando en límite de palabra. */
export function truncateToTokens(text: string, maxTokens: number, count: TokenCounter = estimateTokens): string {
  if (maxTokens <= 0) {
    return '';
  }
  if (count(text) <= maxTokens) {
    return text;
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (count(text.slice(0, mid)) <= maxTokens - 1) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const cut = text.slice(0, lo);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > lo * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export function formatSnippets(snippets: ContextSnippet[]): string {
  return snippets.map((s, i) => `[${i + 1}] (${s.source})\n${s.text.trim()}`).join('\n\n');
}

export function buildConversation(opts: BuildConversationOptions): BuiltConversation {
  const count = opts.countTokens ?? estimateTokens;
  const budget = opts.contextSize - opts.responseReserve;
  if (budget <= 0) {
    throw new Error('La ventana de contexto es demasiado pequeña para la reserva de respuesta.');
  }

  // 1. Mensaje del sistema + contexto RAG (limitado por ragBudget).
  let system = opts.systemPrompt ?? BASE_SYSTEM_PROMPT;
  const usedSnippets: ContextSnippet[] = [];
  if (opts.snippets?.length) {
    const ragBudget = opts.ragBudget ?? Math.floor(budget * 0.35);
    let used = 0;
    for (const snip of opts.snippets) {
      const cost = count(snip.text) + 8;
      if (used + cost > ragBudget) {
        const remaining = ragBudget - used - 8;
        if (remaining > 40) {
          usedSnippets.push({ ...snip, text: truncateToTokens(snip.text, remaining, count) });
        }
        break;
      }
      usedSnippets.push(snip);
      used += cost;
    }
    if (usedSnippets.length) {
      system +=
        '\n\nUsa el siguiente material de referencia si es relevante y menciona la fuente entre corchetes, p. ej. [1]:\n' +
        formatSnippets(usedSnippets);
    }
  }

  // 2. Mensaje actual del usuario (con texto OCR adjunto si existe).
  let userContent = opts.userMessage.trim();
  if (opts.attachmentText?.trim()) {
    const systemCost = count(system) + MESSAGE_OVERHEAD;
    const maxAttachment = Math.max(0, budget - systemCost - count(userContent) - MESSAGE_OVERHEAD * 2 - 64);
    userContent =
      `${userContent}\n\nTexto extraído de la imagen adjunta:\n"""\n` +
      `${truncateToTokens(opts.attachmentText.trim(), maxAttachment, count)}\n"""`;
  }

  const systemMsg: ChatMessage = { role: 'system', content: system };
  const userMsg: ChatMessage = { role: 'user', content: userContent };
  let used = count(system) + count(userContent) + MESSAGE_OVERHEAD * 2;

  if (used > budget) {
    // Caso extremo: el mensaje del usuario por sí solo excede el contexto.
    userMsg.content = truncateToTokens(userContent, Math.max(32, budget - count(system) - MESSAGE_OVERHEAD * 2), count);
    used = count(system) + count(userMsg.content) + MESSAGE_OVERHEAD * 2;
  }

  // 3. Historial: se agregan los mensajes más recientes primero hasta llenar el presupuesto.
  const kept: ChatMessage[] = [];
  const history = opts.history.filter(m => m.role !== 'system');
  let i = history.length - 1;
  for (; i >= 0; i--) {
    const cost = count(history[i].content) + MESSAGE_OVERHEAD;
    if (used + cost > budget) {
      break;
    }
    kept.unshift(history[i]);
    used += cost;
  }
  // Evita iniciar el historial con una respuesta del asistente sin su pregunta.
  let dropped = i + 1;
  while (kept.length && kept[0].role === 'assistant') {
    used -= count(kept[0].content) + MESSAGE_OVERHEAD;
    kept.shift();
    dropped++;
  }

  return {
    messages: [systemMsg, ...kept, userMsg],
    promptTokens: used,
    droppedMessages: dropped,
    usedSnippets,
  };
}

/** Genera un título corto para una conversación a partir del primer mensaje. */
export function titleFromMessage(message: string, maxLength = 40): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  if (!clean) {
    return 'Nueva conversación';
  }
  if (clean.length <= maxLength) {
    return clean;
  }
  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 15 ? cut.slice(0, lastSpace) : cut) + '…';
}
