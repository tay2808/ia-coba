/**
 * Acceso al sistema de archivos del sandbox de la app.
 * Todos los datos se guardan en el almacenamiento privado de la aplicación.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import { keepLocalCopy, pick, types } from '@react-native-documents/picker';
import { DIRS } from '../config/constants';
import { base64ToBytes } from '../core/gguf';

export const ROOT = RNFS.DocumentDirectoryPath;

export function appPath(dir: keyof typeof DIRS, ...parts: string[]): string {
  return [ROOT, DIRS[dir], ...parts].join('/');
}

export async function ensureDirs(): Promise<void> {
  for (const dir of Object.values(DIRS)) {
    await RNFS.mkdir(`${ROOT}/${dir}`);
  }
}

export async function removeIfExists(path: string): Promise<void> {
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
}

/** Borra todos los temporales (documentos y fotos ya analizados). */
export async function clearTemp(): Promise<void> {
  const tmp = `${ROOT}/${DIRS.tmp}`;
  await removeIfExists(tmp);
  await RNFS.mkdir(tmp);
}

export function toFilePath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

export async function readBytes(path: string, length?: number, position = 0): Promise<Uint8Array> {
  const b64 = length === undefined
    ? await RNFS.readFile(path, 'base64')
    : await RNFS.read(path, length, position, 'base64');
  return base64ToBytes(b64);
}

/** Lee un archivo binario de float32 little-endian (alineado en memoria). */
export async function readFloat32(path: string): Promise<Float32Array> {
  const bytes = await readBytes(path);
  const aligned = new Uint8Array(bytes.byteLength);
  aligned.set(bytes);
  return new Float32Array(aligned.buffer, 0, Math.floor(aligned.byteLength / 4));
}

export interface PickedFile {
  path: string;
  name: string;
  size: number | null;
  mime: string | null;
}

export type PickKind = 'model' | 'pack' | 'document' | 'backup';

const PICK_TYPES: Record<PickKind, string[]> = {
  // Los .gguf y .pack no tienen MIME registrado: se permite cualquier archivo y se valida después.
  model: [types.allFiles],
  pack: [types.zip, types.allFiles],
  document: [types.plainText, types.pdf, types.docx],
  backup: [types.zip],
};

/**
 * Abre el selector del sistema y copia el archivo elegido al sandbox
 * (los `content://` de Android no se pueden leer directamente por ruta).
 */
export async function pickAndCopy(kind: PickKind, destinationDir: string): Promise<PickedFile | null> {
  let picked;
  try {
    [picked] = await pick({ type: PICK_TYPES[kind], mode: 'import' });
  } catch (e) {
    if ((e as { code?: string }).code === 'OPERATION_CANCELED') {
      return null;
    }
    throw e;
  }
  const name = picked.name ?? `archivo-${Date.now()}`;
  const [copy] = await keepLocalCopy({
    files: [{ uri: picked.uri, fileName: name }],
    destination: 'cachesDirectory',
  });
  if (copy.status !== 'success') {
    throw new Error(`No se pudo copiar el archivo: ${copy.copyError}`);
  }
  await RNFS.mkdir(destinationDir);
  const dest = `${destinationDir}/${Date.now()}-${name.replace(/[^\w.-]+/g, '_')}`;
  await RNFS.moveFile(toFilePath(copy.localUri), dest);
  return { path: dest, name, size: picked.size ?? null, mime: picked.type ?? null };
}

export { RNFS };
