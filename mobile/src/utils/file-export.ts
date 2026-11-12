import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export interface SaveAndShareParams {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  dialogTitle?: string;
}

function sanitizeLocalFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

export async function saveAndShareBytes(params: SaveAndShareParams): Promise<string | null> {
  const safeName = sanitizeLocalFilename(params.filename);

  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
      const arrayBuf = params.bytes.slice().buffer;
      const blob = new Blob([arrayBuf], { type: params.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = safeName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2_000);
      return blobUrl;
    }
    return null;
  }

  const file = new File(Paths.cache, safeName);
  if (file.exists) {
    file.delete();
  }
  file.create({ overwrite: true });
  await file.write(params.bytes);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: params.mimeType,
      dialogTitle: params.dialogTitle ?? safeName,
      UTI: params.mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
    });
  }

  return file.uri;
}

export async function printPdfBytesOrShare(params: {
  bytes: Uint8Array;
  filename: string;
  dialogTitle?: string;
}): Promise<void> {
  const safeName = sanitizeLocalFilename(params.filename);

  if (Platform.OS === 'web') {
    if (typeof globalThis.window !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([params.bytes.slice().buffer], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const win = globalThis.window.open(blobUrl, '_blank');
      if (!win) {
        await saveAndShareBytes({
          bytes: params.bytes,
          filename: safeName,
          mimeType: 'application/pdf',
          ...(params.dialogTitle ? { dialogTitle: params.dialogTitle } : {}),
        });
      }
      return;
    }
    return;
  }

  const file = new File(Paths.cache, safeName);
  if (file.exists) {
    file.delete();
  }
  file.create({ overwrite: true });
  await file.write(params.bytes);

  try {
    await Print.printAsync({ uri: file.uri });
  } catch {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: params.dialogTitle ?? safeName,
        UTI: 'com.adobe.pdf',
      });
    }
  }
}

export async function printHtmlReceipt(html: string): Promise<void> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  await Print.printAsync({ html });
}

export async function pickJsonFileText(): Promise<{ filename: string; content: string } | null> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const selected = input.files?.[0];
        if (!selected) {
          resolve(null);
          return;
        }
        const content = await selected.text();
        resolve({ filename: selected.name, content });
      };
      input.click();
    });
  }

  const picked = await File.pickFileAsync({
    mimeTypes: ['application/json', 'text/plain'],
  });
  if (picked.canceled) {
    return null;
  }
  const content = await picked.result.text();
  return {
    filename: picked.result.name,
    content,
  };
}

export { uint8ArrayToBase64 };
