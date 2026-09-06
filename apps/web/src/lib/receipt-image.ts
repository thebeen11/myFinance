import type { ScanReceiptDto } from '@/api';

/**
 * Long edge, in pixels, of what actually gets uploaded.
 *
 * Receipt text is large relative to the frame, so 1600px keeps every line
 * legible while turning a 4 MB phone photo into a few hundred kilobytes — which
 * is what lets the scan travel as JSON instead of needing multipart, and keeps
 * it inside the API's 3 MB body limit with room to spare.
 */
const MAX_EDGE = 1600;

/** High enough that thermal print stays sharp, low enough to stay small. */
const JPEG_QUALITY = 0.8;

/** What the scan endpoint accepts, minus the data: URL wrapper. */
export type PreparedReceiptImage = Pick<ScanReceiptDto, 'imageBase64' | 'mimeType'>;

/**
 * Turns a chosen file or camera capture into something the scan endpoint takes.
 *
 * Browser-only: it needs `createImageBitmap` and a canvas, so it must never be
 * imported by anything that runs on the server.
 *
 * Re-encodes to JPEG unconditionally rather than passing the original through.
 * That is the point of the step — it caps the upload, and it launders a HEIC the
 * API does not accept into one it does, as long as the browser can decode it.
 *
 * @param file The image the user picked or photographed.
 * @returns The re-encoded image, base64 without its data: URL prefix.
 * @throws Error when the browser cannot decode the file, naming the format so the
 *   message is actionable rather than "something went wrong".
 */
export const prepareReceiptImage = async (file: File): Promise<PreparedReceiptImage> => {
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Safari hands back HEIC from the photo library that it will not decode off
    // the main thread. Nothing here can fix that, so say which file it was.
    throw new Error(
      `This browser cannot read ${file.type || 'that file'}. Try a JPEG or PNG, or take the photo in the app.`,
    );
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');

  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('This browser could not prepare the photo for upload.');
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

  return { imageBase64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' };
};
