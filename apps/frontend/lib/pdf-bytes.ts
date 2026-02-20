const BASE64_CHUNK_SIZE = 0x8000;

export function base64ToUint8Array(base64: string): Uint8Array {
  const normalizedBase64 = base64.includes(',')
    ? base64.slice(base64.indexOf(',') + 1)
    : base64;

  const binaryString = atob(normalizedBase64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

export function uint8ArrayToBase64(data: Uint8Array): string {
  if (data.length === 0) return '';

  const chunks: string[] = [];

  for (let i = 0; i < data.length; i += BASE64_CHUNK_SIZE) {
    const chunk = data.subarray(i, i + BASE64_CHUNK_SIZE);
    chunks.push(String.fromCharCode(...chunk));
  }

  return btoa(chunks.join(''));
}

/**
 * Trigger a browser download for PDF bytes.
 * Creates a temporary blob URL and anchor element, clicks it, then cleans up.
 * Anchor is appended to document.body before clicking for Firefox compatibility.
 */
export function downloadPdf(data: Uint8Array, filename: string): void {
  const blob = uint8ArrayToBlob(data, 'application/pdf');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function uint8ArrayToBlob(data: Uint8Array, type: string): Blob {
  const buffer = data.buffer;
  if (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer) {
    return new Blob([data.slice().buffer], { type });
  }
  const arrayBuffer = buffer as ArrayBuffer;
  return new Blob([new Uint8Array(arrayBuffer, data.byteOffset, data.byteLength)], { type });
}
