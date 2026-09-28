import {
  BASE_SYSTEM_PROMPT,
  ChatMessage,
  buildConversation,
  estimateTokens,
  titleFromMessage,
  truncateToTokens,
} from '../../src/core/prompt';

const words = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ');

describe('buildConversation', () => {
  it('arma sistema + historial + mensaje del usuario', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: '¡Hola! ¿En qué te ayudo?' },
    ];
    const r = buildConversation({ history, userMessage: '¿Qué es un átomo?', contextSize: 2048, responseReserve: 512 });
    expect(r.messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(r.messages[0].content).toBe(BASE_SYSTEM_PROMPT);
    expect(r.droppedMessages).toBe(0);
  });

  it('descarta los mensajes más antiguos cuando no caben', () => {
    const history: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      history.push({ role: 'user', content: words(60) });
      history.push({ role: 'assistant', content: words(60) });
    }
    const r = buildConversation({ history, userMessage: 'última pregunta', contextSize: 1024, responseReserve: 256 });
    expect(r.droppedMessages).toBeGreaterThan(0);
    expect(r.promptTokens).toBeLessThanOrEqual(1024 - 256);
    expect(r.messages[1].role).toBe('user');
    expect(r.messages[r.messages.length - 1].content).toBe('última pregunta');
    // El historial conservado es el más reciente.
    expect(r.messages[r.messages.length - 2]).toBe(history[history.length - 1]);
  });

  it('incluye fragmentos RAG dentro del presupuesto', () => {
    const snippets = [
      { source: 'Química I', text: 'El átomo es la unidad básica de la materia.' },
      { source: 'Química I', text: words(2000) },
    ];
    const r = buildConversation({
      history: [],
      userMessage: '¿Qué es un átomo?',
      snippets,
      contextSize: 2048,
      responseReserve: 512,
      ragBudget: 300,
    });
    expect(r.messages[0].content).toContain('[1] (Química I)');
    expect(r.usedSnippets.length).toBe(2);
    expect(estimateTokens(r.usedSnippets[1].text)).toBeLessThanOrEqual(300);
  });

  it('adjunta y recorta el texto OCR', () => {
    const r = buildConversation({
      history: [],
      userMessage: 'Resuelve',
      attachmentText: words(5000),
      contextSize: 1024,
      responseReserve: 256,
    });
    expect(r.messages[1].content).toContain('Texto extraído de la imagen adjunta');
    expect(r.promptTokens).toBeLessThanOrEqual(1024 - 256);
  });

  it('falla si la reserva excede el contexto', () => {
    expect(() => buildConversation({ history: [], userMessage: 'x', contextSize: 256, responseReserve: 512 })).toThrow();
  });
});

describe('utilidades de prompt', () => {
  it('truncateToTokens respeta el límite', () => {
    const t = truncateToTokens(words(500), 50);
    expect(estimateTokens(t)).toBeLessThanOrEqual(50);
    expect(t.endsWith('…')).toBe(true);
    expect(truncateToTokens('corto', 50)).toBe('corto');
    expect(truncateToTokens('algo', 0)).toBe('');
  });

  it('titleFromMessage acorta en límite de palabra', () => {
    expect(titleFromMessage('   ')).toBe('Nueva conversación');
    expect(titleFromMessage('Hola')).toBe('Hola');
    const t = titleFromMessage('¿Me puedes explicar la segunda ley de Newton con un ejemplo?');
    expect(t.length).toBeLessThanOrEqual(41);
    expect(t.endsWith('…')).toBe(true);
  });
});
