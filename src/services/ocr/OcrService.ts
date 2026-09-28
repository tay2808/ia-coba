/**
 * OCR offline con Google ML Kit Text Recognition v2 (modelo empaquetado
 * en el APK, no requiere Google Play Services ni internet).
 */
import ImageEditor from '@react-native-community/image-editor';
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import ImagePicker, { type Image } from 'react-native-image-crop-picker';
import { blocksToText, looksLikeMath, suggestCropRect, type Rect } from '../../core/ocrLayout';
import { removeIfExists, toFilePath } from '../fileSystem';

export interface OcrResult {
  text: string;
  /** Imagen final analizada (recortada si aplica). */
  imageUri: string;
  cropped: boolean;
  isMath: boolean;
  blockCount: number;
}

function withScheme(uri: string): string {
  return uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`;
}

export async function recognize(uri: string) {
  const result = await TextRecognition.recognize(withScheme(uri), TextRecognitionScript.LATIN);
  const blocks = result.blocks.map(b => ({ text: b.text, frame: b.frame as Rect | undefined }));
  return { blocks, text: blocksToText(blocks) };
}

/**
 * Analiza una imagen: OCR, recorte inteligente alrededor del texto y,
 * si el primer pase detectó poco texto, un segundo pase sobre el recorte.
 */
export async function analyzeImage(image: { path: string; width: number; height: number }): Promise<OcrResult> {
  let uri = withScheme(image.path);
  let { blocks, text } = await recognize(uri);
  let cropped = false;

  const crop = suggestCropRect(blocks, image.width, image.height);
  if (crop) {
    try {
      const res = await ImageEditor.cropImage(uri, {
        offset: { x: crop.left, y: crop.top },
        size: { width: crop.width, height: crop.height },
        quality: 0.9,
        format: 'jpeg',
      });
      const croppedUri = withScheme(res.uri);
      if (text.length < 40) {
        const second = await recognize(croppedUri);
        if (second.text.length > text.length) {
          ({ blocks, text } = second);
        }
      }
      await removeIfExists(toFilePath(image.path));
      uri = croppedUri;
      cropped = true;
    } catch (e) {
      console.warn('[OCR] No se pudo recortar la imagen', e);
    }
  }
  return { text, imageUri: uri, cropped, isMath: looksLikeMath(text), blockCount: blocks.length };
}

const PICKER_OPTIONS = {
  mediaType: 'photo' as const,
  cropping: true,
  freeStyleCropEnabled: true,
  compressImageQuality: 0.9,
  cropperToolbarTitle: 'Recorta el ejercicio',
};

export async function captureFromCamera(): Promise<Image | null> {
  try {
    return await ImagePicker.openCamera(PICKER_OPTIONS);
  } catch (e) {
    if ((e as { code?: string }).code === 'E_PICKER_CANCELLED') {
      return null;
    }
    throw e;
  }
}

export async function pickFromGallery(): Promise<Image | null> {
  try {
    return await ImagePicker.openPicker(PICKER_OPTIONS);
  } catch (e) {
    if ((e as { code?: string }).code === 'E_PICKER_CANCELLED') {
      return null;
    }
    throw e;
  }
}

/** Elimina imágenes temporales de la cámara/recortador tras el análisis. */
export async function cleanupImages(): Promise<void> {
  await ImagePicker.clean().catch(() => undefined);
}
