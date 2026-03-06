import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPdfTelemetrySession,
  markPdfTelemetry,
  type PdfTelemetrySession,
} from './pdf-telemetry';

function createLargeSession(): PdfTelemetrySession {
  return {
    id: 'session-1',
    filePath: 'large.pdf',
    createdAtMs: 0,
    marks: {},
    base64Length: 0,
    estimatedPdfBytes: 25 * 1024 * 1024,
    estimatedBase64StringBytes: 35 * 1024 * 1024,
    isLargePdf: true,
    memorySensitiveLogged: false,
  };
}

describe('pdf telemetry logging', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs memory-sensitive warning only once per large PDF session', () => {
    const session = createLargeSession();

    markPdfTelemetry(session, 'file-read-complete');
    markPdfTelemetry(session, 'base64-decode-complete');
    markPdfTelemetry(session, 'get-document-resolved');

    const warnSpy = vi.mocked(console.warn);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('memory-sensitive-file-read-complete');
  });

  it('does not emit memory-sensitive warnings for small PDFs', () => {
    const session = createPdfTelemetrySession({
      filePath: 'small.pdf',
      base64Data: 'c21hbGw=',
      fileReadDurationMs: 12,
    });

    expect(session).not.toBeNull();

    markPdfTelemetry(session, 'base64-decode-complete');
    markPdfTelemetry(session, 'get-document-resolved');

    const warnSpy = vi.mocked(console.warn);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
