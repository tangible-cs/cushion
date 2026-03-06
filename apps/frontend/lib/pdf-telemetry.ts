const LARGE_PDF_THRESHOLD_BYTES = 20 * 1024 * 1024;

export type PdfTelemetryMarker =
  | 'file-read-complete'
  | 'base64-decode-complete'
  | 'get-document-resolved'
  | 'pagesinit'
  | 'first-visible-page-rendered';

export interface PdfTelemetrySession {
  id: string;
  filePath: string;
  createdAtMs: number;
  marks: Partial<Record<PdfTelemetryMarker, number>>;
  base64Length: number;
  estimatedPdfBytes: number;
  estimatedBase64StringBytes: number;
  isLargePdf: boolean;
  memorySensitiveLogged: boolean;
}

interface CreatePdfTelemetrySessionOptions {
  filePath: string;
  base64Data: string;
  fileReadDurationMs: number;
}

function isPdfTelemetryEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && typeof window !== 'undefined';
}

function normalizeBase64(base64Data: string): string {
  const commaIndex = base64Data.indexOf(',');
  const payload = commaIndex >= 0 ? base64Data.slice(commaIndex + 1) : base64Data;
  return payload.trim();
}

function estimatePdfBytes(base64Payload: string): number {
  if (!base64Payload) return 0;

  let padding = 0;
  if (base64Payload.endsWith('==')) {
    padding = 2;
  } else if (base64Payload.endsWith('=')) {
    padding = 1;
  }

  return Math.max(0, Math.floor((base64Payload.length * 3) / 4) - padding);
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function bytesToMiB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function createSessionId(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || 'pdf';
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${fileName}-${Date.now().toString(36)}-${randomPart}`;
}

function logMemorySensitiveEvent(session: PdfTelemetrySession, marker: PdfTelemetryMarker): void {
  if (!session.isLargePdf || session.memorySensitiveLogged) return;

  session.memorySensitiveLogged = true;

  const estimatedPeakBytes = session.estimatedBase64StringBytes + session.estimatedPdfBytes;

  console.warn(`[pdf-telemetry][${session.id}] memory-sensitive-${marker}`, {
    filePath: session.filePath,
    estimatedPdfBytes: session.estimatedPdfBytes,
    estimatedPdfMiB: bytesToMiB(session.estimatedPdfBytes),
    estimatedBase64StringBytes: session.estimatedBase64StringBytes,
    estimatedBase64StringMiB: bytesToMiB(session.estimatedBase64StringBytes),
    estimatedPeakBytes,
    estimatedPeakMiB: bytesToMiB(estimatedPeakBytes),
  });
}

export function pdfTelemetryNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function createPdfTelemetrySession(options: CreatePdfTelemetrySessionOptions): PdfTelemetrySession | null {
  if (!isPdfTelemetryEnabled()) return null;

  const base64Payload = normalizeBase64(options.base64Data);
  const estimatedPdfBytes = estimatePdfBytes(base64Payload);
  const estimatedBase64StringBytes = base64Payload.length * 2;

  const session: PdfTelemetrySession = {
    id: createSessionId(options.filePath),
    filePath: options.filePath,
    createdAtMs: pdfTelemetryNow(),
    marks: {},
    base64Length: base64Payload.length,
    estimatedPdfBytes,
    estimatedBase64StringBytes,
    isLargePdf: estimatedPdfBytes >= LARGE_PDF_THRESHOLD_BYTES,
    memorySensitiveLogged: false,
  };

  markPdfTelemetry(session, 'file-read-complete', {
    fileReadDurationMs: roundMs(options.fileReadDurationMs),
    base64Length: session.base64Length,
    estimatedPdfBytes: session.estimatedPdfBytes,
    estimatedPdfMiB: bytesToMiB(session.estimatedPdfBytes),
  });

  return session;
}

export function markPdfTelemetry(
  session: PdfTelemetrySession | null | undefined,
  marker: PdfTelemetryMarker,
  details: Record<string, unknown> = {},
): void {
  if (!session || !isPdfTelemetryEnabled()) return;

  const timestampMs = pdfTelemetryNow();
  session.marks[marker] = timestampMs;

  const fileReadMarker = session.marks['file-read-complete'];
  const elapsedSinceFileReadMs =
    typeof fileReadMarker === 'number'
      ? roundMs(timestampMs - fileReadMarker)
      : undefined;

  console.info(`[pdf-telemetry][${session.id}] ${marker}`, {
    filePath: session.filePath,
    elapsedSinceFileReadMs,
    ...details,
  });

  logMemorySensitiveEvent(session, marker);
}

export function markPdfTelemetryDuration(
  session: PdfTelemetrySession | null | undefined,
  marker: PdfTelemetryMarker,
  startedAtMs: number,
  details: Record<string, unknown> = {},
): number {
  const durationMs = roundMs(pdfTelemetryNow() - startedAtMs);
  markPdfTelemetry(session, marker, { ...details, durationMs });
  return durationMs;
}
