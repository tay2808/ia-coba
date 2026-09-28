/**
 * Gestión de rendimiento: ajusta contexto, hilos y pausas según la RAM
 * disponible y el estado térmico del dispositivo.
 */
import { LLM_DEFAULTS, PERFORMANCE } from '../config/constants';
import { getDeviceStats, type DeviceStats } from './deviceStats';

export interface RuntimeTuning {
  contextSize: number;
  threads: number;
  maxNewTokens: number;
  cooldownMs: number;
  reason?: string;
}

export function computeTuning(stats: DeviceStats, requestedContext: number = LLM_DEFAULTS.contextSize): RuntimeTuning {
  let contextSize = requestedContext;
  let threads = Math.max(2, Math.min(LLM_DEFAULTS.threads, stats.cpuCores - 2));
  let maxNewTokens: number = LLM_DEFAULTS.maxNewTokens;
  let cooldownMs = 0;
  const reasons: string[] = [];

  if (stats.lowMemory || stats.availableRamMb < PERFORMANCE.lowMemoryMb) {
    contextSize = Math.min(contextSize, 1024);
    maxNewTokens = 384;
    reasons.push('memoria baja');
  }
  if (stats.thermalStatus >= 3 || stats.batteryTemperatureC >= 42) {
    threads = 2;
    maxNewTokens = Math.min(maxNewTokens, 256);
    cooldownMs = PERFORMANCE.thermalCooldownMs * 2;
    reasons.push('dispositivo caliente');
  } else if (stats.thermalStatus === 2 || stats.batteryTemperatureC >= 38) {
    threads = Math.max(2, threads - 1);
    cooldownMs = PERFORMANCE.thermalCooldownMs;
    reasons.push('temperatura moderada');
  }
  return { contextSize, threads, maxNewTokens, cooldownMs, reason: reasons.join(', ') || undefined };
}

export async function currentTuning(requestedContext?: number): Promise<RuntimeTuning> {
  return computeTuning(await getDeviceStats(), requestedContext);
}
