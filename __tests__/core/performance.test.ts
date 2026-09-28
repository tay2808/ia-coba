import { computeTuning } from '../../src/services/performance';
import type { DeviceStats } from '../../src/services/deviceStats';

const base: DeviceStats = {
  totalRamMb: 4096,
  availableRamMb: 2000,
  lowMemory: false,
  thermalStatus: 0,
  batteryTemperatureC: 30,
  cpuCores: 8,
};

describe('control de rendimiento', () => {
  it('usa los valores por defecto en condiciones normales', () => {
    expect(computeTuning(base, 2048)).toEqual({ contextSize: 2048, threads: 4, maxNewTokens: 512, cooldownMs: 0, reason: undefined });
  });

  it('reduce el contexto con memoria baja', () => {
    const t = computeTuning({ ...base, availableRamMb: 400 }, 2048);
    expect(t.contextSize).toBe(1024);
    expect(t.reason).toContain('memoria baja');
  });

  it('reduce hilos y agrega pausas si el dispositivo está caliente', () => {
    const hot = computeTuning({ ...base, thermalStatus: 3 }, 2048);
    expect(hot).toMatchObject({ threads: 2, maxNewTokens: 256 });
    expect(hot.cooldownMs).toBeGreaterThan(0);
    const warm = computeTuning({ ...base, batteryTemperatureC: 39 }, 2048);
    expect(warm.threads).toBe(3);
    expect(warm.reason).toBe('temperatura moderada');
  });

  it('no usa menos de 2 hilos en equipos de pocos núcleos', () => {
    expect(computeTuning({ ...base, cpuCores: 2 }, 2048).threads).toBe(2);
  });
});
