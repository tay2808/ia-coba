/**
 * Gestor de modelos: importa archivos GGUF desde el almacenamiento del
 * usuario, valida su cabecera, estima la RAM necesaria y activa el modelo.
 */
import { Q } from '@nozbe/watermelondb';
import { NativeModules } from 'react-native';
import { LLM_DEFAULTS } from '../../config/constants';
import {
  estimateRam,
  extractModelInfo,
  hasGgufMagic,
  parseGgufHeader,
  ramFit,
  type Fit,
  type ModelInfo,
  type RamEstimate,
} from '../../core/gguf';
import { collections, database, type LlmModel } from '../../db';
import { getDeviceStats } from '../deviceStats';
import { RNFS, appPath, pickAndCopy, readBytes, removeIfExists } from '../fileSystem';
import { LlamaService } from '../llm/LlamaService';

export interface InspectionResult {
  info: ModelInfo;
  fileSize: number;
  ram: RamEstimate;
  fit: Fit;
  availableRamMb: number;
}

/** Tamaños de lectura progresivos para la cabecera (los vocabularios pueden ocupar varios MB). */
const HEADER_READ_SIZES = [1, 4, 16].map(mb => mb * 1024 * 1024);

export async function inspectGguf(path: string, contextSize: number = LLM_DEFAULTS.contextSize): Promise<InspectionResult> {
  const stat = await RNFS.stat(path);
  const fileSize = Number(stat.size);
  const magic = await readBytes(path, 4, 0);
  if (!hasGgufMagic(magic)) {
    throw new Error('El archivo seleccionado no es un modelo GGUF.');
  }
  let header = parseGgufHeader(await readBytes(path, Math.min(fileSize, HEADER_READ_SIZES[0]), 0));
  for (const size of HEADER_READ_SIZES.slice(1)) {
    if (header.complete || size > fileSize * 2) {
      break;
    }
    header = parseGgufHeader(await readBytes(path, Math.min(fileSize, size), 0));
  }
  const fallbackName = path.split('/').pop()!.replace(/^\d+-/, '').replace(/\.gguf$/i, '');
  const info = extractModelInfo(header, fallbackName);
  const ram = estimateRam(fileSize, info, contextSize);
  const stats = await getDeviceStats();
  return { info, fileSize, ram, fit: ramFit(ram, stats.availableRamMb), availableRamMb: stats.availableRamMb };
}

export async function importModel(): Promise<{ record: LlmModel; inspection: InspectionResult } | null> {
  const picked = await pickAndCopy('model', appPath('models'));
  if (!picked) {
    return null;
  }
  if (!/\.gguf$/i.test(picked.name)) {
    await removeIfExists(picked.path);
    throw new Error('Solo se admiten archivos con extensión .gguf');
  }
  let inspection: InspectionResult;
  try {
    inspection = await inspectGguf(picked.path);
  } catch (e) {
    await removeIfExists(picked.path);
    throw e;
  }
  const existing = await collections.models.query().fetchCount();
  const record = await database.write(() =>
    collections.models.create((m: LlmModel) => {
      m.name = inspection.info.name;
      m.filePath = picked.path;
      m.fileSize = inspection.fileSize;
      m.architecture = inspection.info.architecture;
      m.quantization = inspection.info.quantization;
      m.contextLength = inspection.info.contextLength ?? null;
      m.ramEstimateMb = inspection.ram.totalMb;
      m.kind = 'llm';
      m.isActive = existing === 0;
      m.importedAt = new Date();
    }),
  );
  return { record: record as LlmModel, inspection };
}

export async function getActiveModel(): Promise<LlmModel | null> {
  const [active] = await collections.models.query(Q.where('is_active', true), Q.where('kind', 'llm')).fetch();
  return (active as LlmModel) ?? null;
}

export async function activateModel(model: LlmModel): Promise<void> {
  const all = (await collections.models.query(Q.where('kind', 'llm')).fetch()) as LlmModel[];
  await database.write(async () => {
    await database.batch(
      ...all.map(m => m.prepareUpdate(r => {
        r.isActive = r.id === model.id;
      })),
    );
  });
  await LlamaService.load(model.filePath);
}

export async function deleteModel(model: LlmModel): Promise<void> {
  if (LlamaService.getModelPath() === model.filePath) {
    await LlamaService.release();
  }
  // Los modelos del Model Pack pertenecen a Google Play; solo se borran los importados.
  if (model.filePath.startsWith(appPath('models'))) {
    await removeIfExists(model.filePath);
  }
  await database.write(() => model.destroyPermanently());
}

interface BundledModel {
  path: string;
  name: string;
  size: number;
}

const ModelPack = NativeModules.ModelPack as { getBundledModels(): Promise<BundledModel[]> } | undefined;

/**
 * Registra los modelos del "Model Pack" (Play Asset Delivery) sin copiarlos:
 * llama.cpp los lee directamente desde la carpeta del asset pack.
 */
export async function registerBundledModels(): Promise<number> {
  const bundled = (await ModelPack?.getBundledModels().catch(() => [])) ?? [];
  if (!bundled.length) {
    return 0;
  }
  const existing = (await collections.models.query().fetch()) as LlmModel[];
  const known = new Set(existing.map(m => m.filePath));
  let added = 0;
  for (const file of bundled.filter(b => !known.has(b.path))) {
    const inspection = await inspectGguf(file.path).catch(() => null);
    if (!inspection) {
      continue;
    }
    const makeActive = existing.length === 0 && added === 0;
    await database.write(() =>
      collections.models.create((m: LlmModel) => {
        m.name = inspection.info.name;
        m.filePath = file.path;
        m.fileSize = inspection.fileSize;
        m.architecture = inspection.info.architecture;
        m.quantization = inspection.info.quantization;
        m.contextLength = inspection.info.contextLength ?? null;
        m.ramEstimateMb = inspection.ram.totalMb;
        m.kind = 'llm';
        m.isActive = makeActive;
        m.importedAt = new Date();
      }),
    );
    added++;
  }
  return added;
}

/** Carga el modelo activo al iniciar la app (si existe y cabe en memoria). */
export async function loadActiveModel(): Promise<LlmModel | null> {
  const active = await getActiveModel();
  if (!active) {
    return null;
  }
  if (!(await RNFS.exists(active.filePath))) {
    throw new Error(`El archivo del modelo "${active.name}" ya no existe. Vuelve a importarlo.`);
  }
  await LlamaService.load(active.filePath);
  return active;
}
