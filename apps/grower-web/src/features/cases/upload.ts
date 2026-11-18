import { ApiError, cases } from '@gc/api-client';

/** SPEC-FE-02 D3: longest side 1600 px, JPEG quality 0.8, at most 10 MB after compression; PDFs as they are. */
export const MAX_SIDE = 1600;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;

/** The size an image is scaled to (never enlarged). */
export function targetSize(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Photos are re-encoded as JPEG in the browser before upload (2G/3G growers); other files are kept. */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const size = targetSize(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** The file's bytes (Blob.arrayBuffer where the platform has it, else FileReader). */
export function readBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await readBytes(file));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** CASE-05 D7: photos as PHOTO, PDFs as INVOICE. */
export function kindOf(file: File): 'PHOTO' | 'INVOICE' {
  return file.type === 'application/pdf' ? 'INVOICE' : 'PHOTO';
}

/**
 * SPEC-CASE-05 R96–R100 from the browser: ask case-service for a presigned upload, PUT the bytes straight to object
 * storage (they never pass the gateway, which caps bodies at 1 MB), then complete. The scan job publishes the file.
 */
export async function uploadAttachment(caseId: string, original: File): Promise<string> {
  const file = await compressImage(original);
  if (file.size > MAX_BYTES) throw new ApiError({ status: 400, code: 'VALIDATION_FAILED', detail: 'file too large', requestId: '' });
  const requested = await cases.request(caseId, { kind: kindOf(file), contentType: file.type, sizeBytes: file.size, sha256: await sha256Hex(file) });
  const { attachmentId, upload } = requested.data;
  if (!attachmentId || !upload?.url) throw new ApiError({ status: 0, code: 'NETWORK', requestId: '' });
  const put = await fetch(upload.url, {
    method: upload.method ?? 'PUT',
    headers: { 'Content-Type': file.type, ...(upload.headers ?? {}) } as Record<string, string>,
    body: await readBytes(file),
  });
  if (!put.ok) throw new ApiError({ status: put.status === 0 ? 0 : 503, code: 'UPLOAD_FAILED', requestId: '' });
  await cases.complete(caseId, attachmentId);
  return attachmentId;
}
