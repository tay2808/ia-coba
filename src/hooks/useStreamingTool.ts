import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { BuiltPrompt } from '../core/humanizer';
import { runToolPrompt } from '../services/chat/ChatService';
import { LlamaService } from '../services/llm/LlamaService';

/** Ejecuta un prompt de herramienta mostrando la salida en streaming. */
export function useStreamingTool() {
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [tps, setTps] = useState<number | null>(null);
  const buffer = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (prompt: BuiltPrompt, transform?: (s: string) => string) => {
    if (!LlamaService.isReady()) {
      Alert.alert('Sin modelo', 'Importa y activa un modelo GGUF en el Gestor de Modelos.');
      return null;
    }
    setRunning(true);
    setOutput('');
    setTps(null);
    buffer.current = '';
    try {
      const res = await runToolPrompt(prompt, {
        onToken: (_t, full) => {
          buffer.current = full;
          // Limita los renders a ~15 por segundo.
          if (!timer.current) {
            timer.current = setTimeout(() => {
              timer.current = null;
              setOutput(buffer.current);
            }, 66);
          }
        },
      });
      const finalText = transform ? transform(res.text) : res.text;
      setOutput(finalText);
      setTps(res.tokensPerSecond);
      return finalText;
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setRunning(false);
    }
  }, []);

  return { output, setOutput, running, tps, run, stop: () => LlamaService.stop() };
}
