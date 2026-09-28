/**
 * Orquestación del chat: persistencia en WatermelonDB, recuperación RAG,
 * construcción del prompt con truncamiento y generación en streaming.
 */
import { Q } from '@nozbe/watermelondb';
import { CONTEXT_BUDGET } from '../../config/constants';
import type { BuiltPrompt } from '../../core/humanizer';
import { BASE_SYSTEM_PROMPT, buildConversation, titleFromMessage, type ChatMessage } from '../../core/prompt';
import { collections, database, type Conversation, type Message, type MessageSource } from '../../db';
import { LlamaService, type GenerateResult } from '../llm/LlamaService';
import { hitsToSnippets, retrieve } from '../rag/RagService';

export async function createConversation(opts: { subjectId?: string | null; mode?: string; title?: string } = {}): Promise<Conversation> {
  return (await database.write(() =>
    collections.conversations.create((c: Conversation) => {
      c.title = opts.title ?? 'Nueva conversación';
      c.subjectId = opts.subjectId ?? null;
      c.mode = opts.mode ?? 'chat';
      c.updatedAt = new Date();
    }),
  )) as Conversation;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return (await collections.messages
    .query(Q.where('conversation_id', conversationId), Q.sortBy('created_at', Q.asc))
    .fetch()) as Message[];
}

export interface SendOptions {
  conversation: Conversation;
  text: string;
  attachmentText?: string;
  useRag?: boolean;
  subjectName?: string;
  onToken?: (token: string, full: string) => void;
}

export interface SendResult {
  assistant: Message;
  result: GenerateResult;
  droppedMessages: number;
}

export async function sendMessage(opts: SendOptions): Promise<SendResult> {
  const { conversation, text } = opts;
  const history = await getMessages(conversation.id);
  const isFirst = history.length === 0;

  await database.write(async () => {
    await collections.messages.create((m: Message) => {
      m.conversationId = conversation.id;
      m.role = 'user';
      m.content = text;
      m.attachmentText = opts.attachmentText ?? null;
    });
    await conversation.update(c => {
      if (isFirst) {
        c.title = titleFromMessage(text);
      }
      c.updatedAt = new Date();
    });
  });

  // Un fallo del RAG no debe impedir responder: se continúa sin material de referencia.
  const hits = opts.useRag === false
    ? []
    : await retrieve(`${text}\n${opts.attachmentText ?? ''}`.trim(), conversation.subjectId).catch(e => {
        console.warn('[Chat] Búsqueda RAG fallida', e);
        return [];
      });
  const systemExtra = opts.subjectName ? `\nEl estudiante está estudiando la materia: ${opts.subjectName}.` : '';
  const built = buildConversation({
    history: history.map(m => ({ role: m.role, content: m.content })),
    userMessage: text,
    attachmentText: opts.attachmentText,
    snippets: hitsToSnippets(hits),
    contextSize: LlamaService.contextSize,
    responseReserve: Math.min(CONTEXT_BUDGET.responseReserve, Math.floor(LlamaService.contextSize / 3)),
    ragBudget: CONTEXT_BUDGET.ragMax,
    systemPrompt: BASE_SYSTEM_PROMPT + systemExtra,
  });

  let result: GenerateResult;
  try {
    result = await LlamaService.chat(built.messages, { onToken: opts.onToken });
  } catch (e) {
    result = {
      text: `⚠️ ${e instanceof Error ? e.message : String(e)}`,
      tokensPredicted: 0,
      tokensPerSecond: 0,
      stoppedByUser: false,
      truncated: false,
    };
  }

  const usedSources: MessageSource[] = hits
    .filter(h => built.usedSnippets.some(s => s.text.startsWith(h.text.slice(0, 40))))
    .map(h => ({ source: h.source, score: Math.round(h.score * 100) / 100, text: h.text.slice(0, 280) }));

  const assistant = (await database.write(async () => {
    const m = await collections.messages.create((r: Message) => {
      r.conversationId = conversation.id;
      r.role = 'assistant';
      r.content = result.text + (result.stoppedByUser ? '\n\n_(respuesta detenida)_' : '');
      r.sources = usedSources;
      r.tokensPerSecond = result.tokensPerSecond || null;
    });
    await conversation.update(c => {
      c.updatedAt = new Date();
    });
    return m;
  })) as Message;

  return { assistant, result, droppedMessages: built.droppedMessages };
}

/** Ejecuta un prompt de herramienta (humanizador, corrector, explicador...) sin historial. */
export async function runToolPrompt(prompt: BuiltPrompt, opts: { onToken?: (t: string, full: string) => void; maxNewTokens?: number } = {}): Promise<GenerateResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  return LlamaService.chat(messages, { temperature: prompt.temperature, onToken: opts.onToken, maxNewTokens: opts.maxNewTokens });
}

export async function deleteConversation(conversation: Conversation): Promise<void> {
  const messages = await getMessages(conversation.id);
  await database.write(async () => {
    await database.batch(...messages.map(m => m.prepareDestroyPermanently()), conversation.prepareDestroyPermanently());
  });
}
