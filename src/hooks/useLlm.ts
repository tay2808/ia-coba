import { useEffect, useState } from 'react';
import { LlamaService, type LlmStatus } from '../services/llm/LlamaService';

export function useLlmStatus() {
  const [state, setState] = useState<{ status: LlmStatus; modelPath: string | null; error?: string; progress?: number }>({
    status: LlamaService.getStatus(),
    modelPath: LlamaService.getModelPath(),
  });
  useEffect(() => LlamaService.subscribe((status, info) => setState({ status, ...info })), []);
  return state;
}
