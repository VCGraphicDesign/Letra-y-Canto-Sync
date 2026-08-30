import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface DownloadFileOptions {
  filename: string;
  content: string; // Plain text or Base64 string
  mimeType: string;
  isBase64?: boolean;
}

/**
 * Converts a UTF-8 string to a safe base64 representation
 */
function utf8ToBase64(str: string): string {
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  } catch {
    return btoa(str);
  }
}

/**
 * Sanitizes filename to prevent invalid characters in filesystem or URLs
 */
export function sanitizeFilename(filename: string, fallback = 'archivo'): string {
  const sanitized = filename
    .trim()
    .replace(/[^a-zA-Z0-9_\-\.áéíóúñÁÉÍÓÚÑ]/g, '_')
    .replace(/_+/g, '_');
  return sanitized || fallback;
}

/**
 * Downloads a file on the web using a temporary Blob + anchor element,
 * or writes to Directory.Cache and shares via @capacitor/share on native Android/iOS.
 */
export async function downloadOrShareFile(options: DownloadFileOptions): Promise<boolean> {
  const { filename, content, mimeType, isBase64 = false } = options;
  const safeFilename = sanitizeFilename(filename);

  // Check if running on native platform (Android / iOS via Capacitor)
  if (Capacitor.isNativePlatform()) {
    try {
      let base64Data: string;

      if (isBase64) {
        // If content is already a data URI (e.g. data:application/pdf;base64,XXXX), extract base64 part
        if (content.includes('base64,')) {
          base64Data = content.split('base64,')[1];
        } else {
          base64Data = content;
        }
      } else {
        // Convert plain text to UTF-8 base64
        base64Data = utf8ToBase64(content);
      }

      // Write file into Cache directory
      const fileResult = await Filesystem.writeFile({
        path: safeFilename,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });

      // Share or deliver file to Android system
      await Share.share({
        title: safeFilename,
        text: safeFilename,
        url: fileResult.uri,
        dialogTitle: `Guardar o compartir ${safeFilename}`,
      });

      return true;
    } catch (err: any) {
      // User cancelling the native share sheet is normal and should not trigger an alert
      const errorMessage = err?.message || String(err);
      if (
        errorMessage.toLowerCase().includes('canceled') ||
        errorMessage.toLowerCase().includes('cancelled') ||
        errorMessage.toLowerCase().includes('user dismiss')
      ) {
        console.log('Share dismissed by user:', safeFilename);
        return true;
      }

      console.error('Error in native file download/share:', err);
      // Optional fallback to web download if filesystem/share fails
      try {
        triggerWebDownload(safeFilename, content, mimeType, isBase64);
        return true;
      } catch (fallbackErr) {
        console.error('Fallback web download also failed:', fallbackErr);
        throw err;
      }
    }
  } else {
    // Standard Web Browser environment (Google AI Studio, Vercel, Chrome, Safari, etc.)
    try {
      triggerWebDownload(safeFilename, content, mimeType, isBase64);
      return true;
    } catch (err) {
      console.error('Error during web file download:', err);
      throw err;
    }
  }
}

/**
 * Triggers standard browser download using Blob and simulated anchor click
 */
function triggerWebDownload(
  filename: string,
  content: string,
  mimeType: string,
  isBase64: boolean
): void {
  let blob: Blob;

  if (isBase64) {
    let cleanBase64 = content;
    if (content.includes('base64,')) {
      cleanBase64 = content.split('base64,')[1];
    }
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    blob = new Blob([byteArray], { type: mimeType });
  } else {
    blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
