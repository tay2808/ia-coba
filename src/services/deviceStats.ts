/**
 * Estado del dispositivo (RAM, temperatura) mediante el módulo nativo
 * Kotlin `DeviceStats` (android/app/src/main/java/mx/cobaev/ia/DeviceStatsModule.kt).
 */
import { NativeModules } from 'react-native';

export interface DeviceStats {
  totalRamMb: number;
  availableRamMb: number;
  lowMemory: boolean;
  /** 0 = normal … 6 = apagado inminente (PowerManager.THERMAL_STATUS_*). -1 si no disponible. */
  thermalStatus: number;
  /** Temperatura de la batería en °C, -1 si no disponible. */
  batteryTemperatureC: number;
  cpuCores: number;
}

const Native = NativeModules.DeviceStats as { getStats(): Promise<DeviceStats> } | undefined;

const FALLBACK: DeviceStats = {
  totalRamMb: 4096,
  availableRamMb: 2048,
  lowMemory: false,
  thermalStatus: -1,
  batteryTemperatureC: -1,
  cpuCores: 4,
};

export async function getDeviceStats(): Promise<DeviceStats> {
  if (!Native) {
    return FALLBACK;
  }
  try {
    return await Native.getStats();
  } catch {
    return FALLBACK;
  }
}

export const THERMAL_LABELS = ['Normal', 'Leve', 'Moderado', 'Severo', 'Crítico', 'Emergencia', 'Apagado'];
