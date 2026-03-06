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

/**
 * Print PDF bytes in an isolated hidden iframe so browser print output
 * contains PDF pages rather than the surrounding application shell.
 */
export function printPdf(data: Uint8Array): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Printing is only available in a browser environment'));
  }

  return new Promise((resolve, reject) => {
    const blob = uint8ArrayToBlob(data, 'application/pdf');
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');

    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      iframe.remove();
      URL.revokeObjectURL(url);
    };

    const fail = (error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error('Failed to print PDF'));
    };

    iframe.onerror = () => {
      fail(new Error('Failed to load PDF in print frame'));
    };

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        fail(new Error('Print frame is unavailable'));
        return;
      }

      const cleanupTimeout = window.setTimeout(cleanup, 60_000);
      const handleAfterPrint = () => {
        window.clearTimeout(cleanupTimeout);
        cleanup();
      };

      frameWindow.addEventListener('afterprint', handleAfterPrint, { once: true });

      try {
        frameWindow.focus();
        frameWindow.print();
        resolve();
      } catch (error) {
        frameWindow.removeEventListener('afterprint', handleAfterPrint);
        window.clearTimeout(cleanupTimeout);
        fail(error);
      }
    };

    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

export function uint8ArrayToBlob(data: Uint8Array, type: string): Blob {
  const buffer = data.buffer;
  if (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer) {
    return new Blob([data.slice().buffer], { type });
  }
  const arrayBuffer = buffer as ArrayBuffer;
  return new Blob([new Uint8Array(arrayBuffer, data.byteOffset, data.byteLength)], { type });
}
