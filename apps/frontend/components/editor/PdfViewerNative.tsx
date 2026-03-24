
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { FileText, Type, Pencil, Highlighter, Image as ImageIcon } from 'lucide-react';
import { formatShortcutList, useShortcutBindings, useShortcutHandler } from '@/lib/shortcuts';
import {
  PDF_SHORTCUT_IDS,
  AnnotationEditorType,
  AnnotationEditorParamsType,
  HIGHLIGHT_COLORS,
  type EditorMode,
} from './pdf-constants';
import { PdfToolbar, PdfSearchBar } from './PdfToolbar';
import { usePdfZoom } from '@/hooks/usePdfZoom';
import { usePdfSearch } from '@/hooks/usePdfSearch';
import {
  createPdfTelemetrySession,
  markPdfTelemetry,
  markPdfTelemetryDuration,
  pdfTelemetryNow,
  type PdfTelemetrySession,
} from '@/lib/pdf-telemetry';
import { base64ToUint8Array, uint8ArrayToBase64, downloadPdf, printPdf } from '@/lib/pdf-bytes';
import { isPdfProgressiveLoadingEnabled } from '@/lib/pdf-feature-flags';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import type { ViewProps } from '@/lib/view-registry';

interface PdfBase64Chunk {
  base64: string;
  offset: number;
  bytesRead: number;
  totalBytes: number;
  mimeType: string;
}

interface PdfProgressiveLoadingConfig {
  readChunk: (offset: number, length: number) => Promise<PdfBase64Chunk>;
  rangeChunkSize?: number;
}

const DEFAULT_PDF_RANGE_CHUNK_SIZE = 256 * 1024;
const pdfProgressiveLoadingEnabled = isPdfProgressiveLoadingEnabled();

function mergeUint8Chunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0];
  }

  const merged = new Uint8Array(totalLength);
  let writeOffset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return merged;
}

function normalizeError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string' && error.length > 0) {
    return new Error(error);
  }

  return new Error(fallbackMessage);
}

function createCoordinatorRangeTransport(
  pdfjsLib: any,
  initialChunk: PdfBase64Chunk,
  readChunk: (offset: number, length: number) => Promise<PdfBase64Chunk>,
  onFatalError?: (error: Error) => void,
) {
  const initialData = base64ToUint8Array(initialChunk.base64);
  if (initialData.length !== initialChunk.bytesRead) {
    throw new Error(
      `Initial chunk decode mismatch (decoded ${initialData.length}, expected ${initialChunk.bytesRead})`
    );
  }

  const transport = new pdfjsLib.PDFDataRangeTransport(initialChunk.totalBytes, initialData, false);
  let aborted = false;
  let fatalErrorReported = false;
  const inFlight = new Map<string, Promise<void>>();

  const reportFatalError = (error: unknown) => {
    if (aborted || fatalErrorReported) {
      return;
    }

    fatalErrorReported = true;
    onFatalError?.(normalizeError(error, 'Failed to stream PDF data'));
  };

  (transport as any).requestDataRange = (begin: number, end: number) => {
    if (aborted || end <= begin) {
      return;
    }

    const key = `${begin}:${end}`;
    if (inFlight.has(key)) {
      return;
    }

    const requestPromise = (async () => {
      try {
        const requestedLength = end - begin;
        let loadedBytes = 0;
        let nextOffset = begin;
        const expectedTotalBytes = initialChunk.totalBytes;
        const decodedChunks: Uint8Array[] = [];

        while (!aborted && loadedBytes < requestedLength) {
          const chunk = await readChunk(nextOffset, requestedLength - loadedBytes);

          if (chunk.bytesRead <= 0) {
            throw new Error(`Empty chunk response at offset ${nextOffset}`);
          }

          if (chunk.offset !== nextOffset) {
            throw new Error(
              `Unexpected chunk offset (expected ${nextOffset}, received ${chunk.offset})`
            );
          }

          if (chunk.totalBytes !== expectedTotalBytes) {
            throw new Error(
              `Document size changed during progressive read (expected ${expectedTotalBytes}, received ${chunk.totalBytes})`
            );
          }

          const decodedChunk = base64ToUint8Array(chunk.base64);
          if (decodedChunk.length !== chunk.bytesRead) {
            throw new Error(
              `Chunk decode mismatch at offset ${nextOffset} (decoded ${decodedChunk.length}, expected ${chunk.bytesRead})`
            );
          }

          const chunkLength = decodedChunk.length;

          if (chunkLength <= 0) {
            throw new Error(`Decoded empty chunk at offset ${nextOffset}`);
          }

          decodedChunks.push(decodedChunk);

          loadedBytes += chunkLength;
          nextOffset += chunkLength;
        }

        if (aborted || loadedBytes <= 0) {
          return;
        }

        if (loadedBytes < requestedLength) {
          throw new Error(
            `Incomplete chunk response for range ${begin}:${end} (${loadedBytes}/${requestedLength} bytes)`
          );
        }

        const mergedChunk = mergeUint8Chunks(decodedChunks, loadedBytes);
        (transport as any).onDataRange(begin, mergedChunk);
        (transport as any).onDataProgress(
          Math.min(expectedTotalBytes, begin + loadedBytes),
          expectedTotalBytes,
        );
      } catch (error) {
        if (!aborted) {
          const normalizedError = normalizeError(error, 'Failed to read PDF chunk');
          console.error('[PdfViewerNative] Failed to read PDF chunk:', normalizedError);
          reportFatalError(normalizedError);
        }
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, requestPromise);
  };

  (transport as any).abort = () => {
    aborted = true;
    inFlight.clear();
  };

  return transport;
}

/**
 * Self-contained PDF viewer — loads its own data, handles saving.
 * Registered in the view registry for `.pdf` files.
 */
export function PdfViewerNative({ filePath }: ViewProps) {
  const [pdfState, setPdfState] = useState<{
    base64Data?: string;
    telemetrySession: PdfTelemetrySession | null;
    progressiveLoading: PdfProgressiveLoadingConfig | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSharedCoordinatorClient().then(async (client) => {
      if (cancelled) return;

      if (pdfProgressiveLoadingEnabled) {
        const readChunk = (offset: number, length: number) =>
          client.readFileBase64Chunk(filePath, offset, length);
        setPdfState({
          telemetrySession: null,
          progressiveLoading: { readChunk, rangeChunkSize: DEFAULT_PDF_RANGE_CHUNK_SIZE },
        });
        return;
      }

      const readStartedAtMs = pdfTelemetryNow();
      const result = await client.readFileBase64(filePath);
      if (cancelled) return;

      const session = createPdfTelemetrySession({
        filePath,
        base64Data: result.base64,
        fileReadDurationMs: pdfTelemetryNow() - readStartedAtMs,
      });

      setPdfState({
        base64Data: result.base64,
        telemetrySession: session,
        progressiveLoading: null,
      });
    }).catch((err) => {
      console.error('[PdfViewerNative] Failed to load PDF:', err);
    });

    return () => { cancelled = true; };
  }, [filePath]);

  if (!pdfState) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading PDF…</div>;
  }

  return (
    <PdfViewerInner
      filePath={filePath}
      base64Data={pdfState.base64Data}
      telemetrySession={pdfState.telemetrySession}
      progressiveLoading={pdfState.progressiveLoading}
    />
  );
}

interface PdfViewerInnerProps {
  filePath: string;
  base64Data?: string;
  telemetrySession?: PdfTelemetrySession | null;
  progressiveLoading?: PdfProgressiveLoadingConfig | null;
}

function PdfViewerInner({
  filePath,
  base64Data,
  telemetrySession,
  progressiveLoading,
}: PdfViewerInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [editorMode, setEditorMode] = useState<EditorMode>('none');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pdfShortcuts = useShortcutBindings(PDF_SHORTCUT_IDS);

  const pdfDocRef = useRef<any>(null);
  const pdfViewerRef = useRef<any>(null);
  const eventBusRef = useRef<any>(null);
  const decodedPdfBytesRef = useRef<{ base64Key: string; bytes: Uint8Array } | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSavedBytesRef = useRef<Uint8Array | null>(null);
  const lastSavedBytesRef = useRef<Uint8Array | null>(null);

  // Extracted hooks
  const {
    zoom,
    setZoom,
    handleZoom,
    handleZoomPreset,
    handleZoomReset,
  } = usePdfZoom(pdfViewerRef, containerRef);
  const {
    showSearch, searchQuery, setSearchQuery, searchInputRef,
    caseSensitive,
    setCaseSensitive,
    entireWord,
    setEntireWord,
    highlightAll,
    setHighlightAll,
    searchMatchesCount,
    searchStatusMessage,
    handleSearch,
    handleFindControlState,
    handleFindMatchesCount,
    openSearch,
    closeSearch,
  } = usePdfSearch(eventBusRef);

  // Add image via file picker: enters stamp mode, then triggers keyboard add
  const handleAddImage = useCallback(() => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    try {
      viewer.annotationEditorMode = { mode: AnnotationEditorType.STAMP };
    } catch {}
    setEditorMode('stamp');
    setTimeout(() => {
      const layer = containerRef.current?.querySelector('.annotationEditorLayer');
      if (layer) {
        layer.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        }));
      }
    }, 100);
  }, []);

  // Dispatch annotation editor param change
  const dispatchParam = useCallback((type: number, value: any) => {
    const eventBus = eventBusRef.current;
    if (!eventBus) return;
    eventBus.dispatch('switchannotationeditorparams', {
      source: null,
      type,
      value,
    });
  }, []);

  const getDecodedPdfBytes = useCallback(() => {
    if (!base64Data) {
      throw new Error('Missing PDF base64 payload');
    }

    const cached = decodedPdfBytesRef.current;
    if (cached && cached.base64Key === base64Data) {
      return { bytes: cached.bytes, fromCache: true };
    }

    const bytes = base64ToUint8Array(base64Data);
    decodedPdfBytesRef.current = { base64Key: base64Data, bytes };
    return { bytes, fromCache: false };
  }, [base64Data]);

  const progressiveReadChunk = progressiveLoading?.readChunk;
  const progressiveRangeChunkSize = progressiveLoading?.rangeChunkSize;

  const readOriginalPdfBytes = useCallback(async () => {
    if (typeof base64Data === 'string') {
      return base64ToUint8Array(base64Data);
    }

    // For progressive mode, re-read from coordinator
    const client = await getSharedCoordinatorClient();
    const result = await client.readFileBase64(filePath);
    return base64ToUint8Array(result.base64);
  }, [base64Data, filePath]);

  const annotatedFileName = filePath
    .split(/[/\\]/)
    .pop()
    ?.replace(/\.pdf$/i, '_annotated.pdf') ?? 'Document_annotated.pdf';

  const persistPdfBytes = useCallback(async (data: Uint8Array) => {
    try {
      const client = await getSharedCoordinatorClient();
      const base64 = uint8ArrayToBase64(data);
      await client.saveFileBase64(filePath, base64);
    } catch (err) {
      console.error('[PdfViewerNative] PDF save failed:', err);
      alert('Failed to save PDF: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }, [filePath]);

  useEffect(() => {
    const existingLink = document.querySelector('link[href="/pdfjs/pdf_viewer.css"]');
    if (!existingLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/pdfjs/pdf_viewer.css';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: any = null;
    let rangeTransport: any = null;
    let loadedPdfDoc: any = null;
    let loadedViewer: any = null;
    let loadedEventBus: any = null;
    let loadedLinkService: any = null;
    let loadedFindController: any = null;
    let loadedAnnotationStorage: any = null;

    let onPageChanging: ((evt: any) => void) | null = null;
    let onScaleChanging: ((evt: any) => void) | null = null;
    let onPageRendered: ((evt: any) => void) | null = null;
    let onPagesInit: (() => void) | null = null;
    let onFindControlStateChanged: ((evt: any) => void) | null = null;
    let onFindMatchesCountChanged: ((evt: any) => void) | null = null;

    async function init() {
      try {
        setLoading(true);
        setError(null);
        setHasChanges(false);
        setSaveError(null);
        saveInFlightRef.current = false;
        pendingSavedBytesRef.current = null;
        lastSavedBytesRef.current = null;

        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const pdfjsViewer = await import('pdfjs-dist/legacy/web/pdf_viewer.mjs');

        if (cancelled) {
          return;
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

        if (progressiveReadChunk) {
          const requestedRangeChunkSize = progressiveRangeChunkSize ?? DEFAULT_PDF_RANGE_CHUNK_SIZE;
          const rangeChunkSize =
            Number.isInteger(requestedRangeChunkSize) && requestedRangeChunkSize > 0
              ? requestedRangeChunkSize
              : DEFAULT_PDF_RANGE_CHUNK_SIZE;

          const initialChunkStartedAtMs = pdfTelemetryNow();
          const initialChunk = await progressiveReadChunk(0, rangeChunkSize);

          if (cancelled) {
            return;
          }

          if (initialChunk.offset !== 0 || initialChunk.bytesRead <= 0 || initialChunk.totalBytes <= 0) {
            throw new Error('Failed to load initial PDF bytes for progressive mode');
          }

          markPdfTelemetryDuration(telemetrySession, 'base64-decode-complete', initialChunkStartedAtMs, {
            mode: 'progressive-range',
            chunkBytes: initialChunk.bytesRead,
            totalBytes: initialChunk.totalBytes,
          });

          rangeTransport = createCoordinatorRangeTransport(
            pdfjsLib,
            initialChunk,
            progressiveReadChunk,
            (rangeError) => {
              if (cancelled) {
                return;
              }

              setError(rangeError.message);
              setLoading(false);
              void loadingTask?.destroy?.();
            },
          );

          loadingTask = pdfjsLib.getDocument({
            range: rangeTransport,
            length: initialChunk.totalBytes,
            rangeChunkSize,
            disableStream: true,
          });
        } else {
          const decodeStartedAtMs = pdfTelemetryNow();
          const { bytes: decodedBytes, fromCache } = getDecodedPdfBytes();
          markPdfTelemetryDuration(telemetrySession, 'base64-decode-complete', decodeStartedAtMs, {
            decodedBytes: decodedBytes.length,
            cacheHit: fromCache,
          });

          loadingTask = pdfjsLib.getDocument({ data: decodedBytes.slice() });
        }

        const getDocumentStartedAtMs = pdfTelemetryNow();
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        markPdfTelemetryDuration(telemetrySession, 'get-document-resolved', getDocumentStartedAtMs, {
          numPages: pdfDoc.numPages,
        });

        loadedPdfDoc = pdfDoc;
        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);

        const eventBus = new pdfjsViewer.EventBus();
        loadedEventBus = eventBus;
        eventBusRef.current = eventBus;

        const linkService = new pdfjsViewer.PDFLinkService({ eventBus });
        loadedLinkService = linkService;

        const findController = new pdfjsViewer.PDFFindController({
          eventBus,
          linkService,
        });
        loadedFindController = findController;

        const container = containerRef.current!;
        const viewer = new (pdfjsViewer.PDFViewer as any)({
          container,
          viewer: viewerRef.current ?? undefined,
          eventBus,
          linkService,
          findController,
          textLayerMode: 1,
          annotationMode: 2,
          annotationEditorMode: AnnotationEditorType.NONE,
          annotationEditorHighlightColors: HIGHLIGHT_COLORS.map(c => `${c.name}=${c.hex}`).join(','),
          enableHighlightFloatingButton: false,
          enableUpdatedAddImage: false,
          enableNewAltTextWhenAddingImage: false,
        });
        loadedViewer = viewer;
        pdfViewerRef.current = viewer;

        linkService.setViewer(viewer);

        onPageChanging = (evt: any) => {
          if (cancelled) return;
          setCurrentPage(evt.pageNumber);
        };
        eventBus.on('pagechanging', onPageChanging);

        onScaleChanging = (evt: any) => {
          if (cancelled) return;
          setZoom(Math.round(evt.scale * 100));
        };
        eventBus.on('scalechanging', onScaleChanging);

        let firstPageRendered = false;

        onPageRendered = (evt: any) => {
          if (cancelled || firstPageRendered) return;
          firstPageRendered = true;
          markPdfTelemetry(telemetrySession, 'first-visible-page-rendered', {
            pageNumber: evt.pageNumber,
          });
        };
        eventBus.on('pagerendered', onPageRendered);

        onPagesInit = () => {
          if (cancelled) return;
          markPdfTelemetry(telemetrySession, 'pagesinit', {
            numPages: pdfDoc.numPages,
          });
          viewer.currentScaleValue = 'auto';
          setLoading(false);
        };
        eventBus.on('pagesinit', onPagesInit);

        onFindControlStateChanged = (evt: any) => {
          if (cancelled) return;
          handleFindControlState(evt);
        };
        eventBus.on('updatefindcontrolstate', onFindControlStateChanged);

        onFindMatchesCountChanged = (evt: any) => {
          if (cancelled) return;
          handleFindMatchesCount(evt);
        };
        eventBus.on('updatefindmatchescount', onFindMatchesCountChanged);

        const annotationStorage = pdfDoc.annotationStorage;
        loadedAnnotationStorage = annotationStorage;
        if (annotationStorage) {
          annotationStorage.onSetModified = () => {
            if (cancelled) return;
            setHasChanges(true);
            setSaveError(null);
            pendingSavedBytesRef.current = null;
          };
          annotationStorage.onResetModified = () => {
            if (cancelled) return;
            setHasChanges(false);
          };
        }

        viewer.setDocument(pdfDoc);
        linkService.setDocument(pdfDoc, null);
        findController.setDocument(pdfDoc);

      } catch (err) {
        if (cancelled) return;
        console.error('[PdfViewerNative] Load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      rangeTransport?.abort?.();

      if (loadedAnnotationStorage) {
        loadedAnnotationStorage.onSetModified = null;
        loadedAnnotationStorage.onResetModified = null;
      }

      if (loadedEventBus) {
        if (onPageChanging) {
          loadedEventBus.off?.('pagechanging', onPageChanging);
        }
        if (onScaleChanging) {
          loadedEventBus.off?.('scalechanging', onScaleChanging);
        }
        if (onPageRendered) {
          loadedEventBus.off?.('pagerendered', onPageRendered);
        }
        if (onPagesInit) {
          loadedEventBus.off?.('pagesinit', onPagesInit);
        }
        if (onFindControlStateChanged) {
          loadedEventBus.off?.('updatefindcontrolstate', onFindControlStateChanged);
        }
        if (onFindMatchesCountChanged) {
          loadedEventBus.off?.('updatefindmatchescount', onFindMatchesCountChanged);
        }
      }

      loadedFindController?.setDocument?.(null);
      loadedLinkService?.setDocument?.(null, null);
      loadedViewer?.setDocument?.(null);
      loadedViewer?.cleanup?.();

      if (pdfDocRef.current === loadedPdfDoc) {
        pdfDocRef.current = null;
      }
      if (pdfViewerRef.current === loadedViewer) {
        pdfViewerRef.current = null;
      }
      if (eventBusRef.current === loadedEventBus) {
        eventBusRef.current = null;
      }

      void loadingTask?.destroy?.();
    };
  }, [
    getDecodedPdfBytes,
    handleFindControlState,
    handleFindMatchesCount,
    progressiveRangeChunkSize,
    progressiveReadChunk,
    setZoom,
    telemetrySession,
  ]);

  useEffect(() => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;

    const modeMap: Record<EditorMode, number> = {
      'none': AnnotationEditorType.NONE,
      'freetext': AnnotationEditorType.FREETEXT,
      'ink': AnnotationEditorType.INK,
      'highlight': AnnotationEditorType.HIGHLIGHT,
      'stamp': AnnotationEditorType.STAMP,
    };

    try {
      viewer.annotationEditorMode = { mode: modeMap[editorMode] };
    } catch (err) {
      console.error('[PdfViewerNative] Failed to set editor mode:', err);
    }
  }, [editorMode]);

  const goToPage = useCallback((page: number) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    const targetPage = Math.max(1, Math.min(page, numPages));
    viewer.currentPageNumber = targetPage;
  }, [numPages]);

  const handleRotate = useCallback(() => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    viewer.pagesRotation = (viewer.pagesRotation + 90) % 360;
  }, []);

  const fileName = filePath.split(/[/\\]/).pop() || 'Document';

  const handleDownloadOriginal = useCallback(async () => {
    try {
      const originalBytes = await readOriginalPdfBytes();
      downloadPdf(originalBytes, fileName);
    } catch (err) {
      const normalizedError = normalizeError(err, 'Failed to download original PDF');
      console.error('[PdfViewerNative] Download original failed:', normalizedError);
      alert('Failed to download original PDF: ' + normalizedError.message);
    }
  }, [fileName, readOriginalPdfBytes]);

  const handleDownloadAnnotated = useCallback(async () => {
    try {
      if (hasChanges && !pendingSavedBytesRef.current) {
        throw new Error('Save annotations first to download an annotated copy');
      }

      const annotatedBytes = pendingSavedBytesRef.current?.slice()
        ?? lastSavedBytesRef.current?.slice()
        ?? await readOriginalPdfBytes();

      downloadPdf(annotatedBytes, annotatedFileName);
    } catch (err) {
      const normalizedError = normalizeError(err, 'Failed to download annotated PDF');
      console.error('[PdfViewerNative] Download annotated failed:', normalizedError);
      alert('Failed to download annotated PDF: ' + normalizedError.message);
    }
  }, [annotatedFileName, hasChanges, readOriginalPdfBytes]);

  const handlePrint = useCallback(async () => {
    try {
      const originalBytes = await readOriginalPdfBytes();
      await printPdf(originalBytes);
    } catch (err) {
      const normalizedError = normalizeError(err, 'Failed to print PDF');
      console.error('[PdfViewerNative] Print failed:', normalizedError);
      alert('Failed to print PDF: ' + normalizedError.message);
    }
  }, [readOriginalPdfBytes]);

  const handleSave = useCallback(async () => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc || saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      let bytesToPersist = pendingSavedBytesRef.current;
      if (!bytesToPersist) {
        const generatedBytes: Uint8Array = await pdfDoc.saveDocument();
        bytesToPersist = generatedBytes;
        pendingSavedBytesRef.current = generatedBytes.slice();
      }

      if (!bytesToPersist) {
        throw new Error('saveDocument returned empty PDF bytes');
      }

      await persistPdfBytes(bytesToPersist);

      const persistedBytes = bytesToPersist.slice();
      pendingSavedBytesRef.current = null;
      lastSavedBytesRef.current = persistedBytes;
      setSaveError(null);

      if (typeof base64Data === 'string') {
        decodedPdfBytesRef.current = {
          base64Key: base64Data,
          bytes: persistedBytes,
        };
      }
    } catch (err) {
      const normalizedError = normalizeError(err, 'Failed to save PDF');
      console.error('[PdfViewerNative] Save failed:', normalizedError);
      setSaveError(normalizedError.message);
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  }, [base64Data, persistPdfBytes]);

  const pdfHandlers = useMemo(() => ({
    'pdf.search.open': () => { openSearch(); },
    'pdf.search.close': () => {
      if (showSearch) closeSearch();
      if (editorMode !== 'none') setEditorMode('none');
    },
    'pdf.save': () => { if (hasChanges || saveError) handleSave(); },
    'pdf.zoom.in': () => { handleZoom(10); },
    'pdf.zoom.out': () => { handleZoom(-10); },
    'pdf.zoom.reset': () => { handleZoomReset(); },
  } as const), [
    closeSearch,
    editorMode,
    handleSave,
    handleZoom,
    handleZoomReset,
    hasChanges,
    openSearch,
    saveError,
    showSearch,
  ]);

  useShortcutHandler({ handlers: pdfHandlers });

  const searchShortcutLabel = formatShortcutList(pdfShortcuts['pdf.search.open']);
  const cancelShortcutLabel = formatShortcutList(pdfShortcuts['pdf.search.close']);
  const saveShortcutLabel = formatShortcutList(pdfShortcuts['pdf.save']);
  const zoomInShortcutLabel = formatShortcutList(pdfShortcuts['pdf.zoom.in']);
  const zoomOutShortcutLabel = formatShortcutList(pdfShortcuts['pdf.zoom.out']);
  const searchNextShortcutLabel = formatShortcutList(pdfShortcuts['pdf.search.next']);
  const searchPrevShortcutLabel = formatShortcutList(pdfShortcuts['pdf.search.prev']);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-foreground-faint gap-4">
        <FileText className="w-16 h-16 opacity-50" />
        <div className="text-center">
          <p className="text-accent-red font-medium">Failed to load PDF</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pdfjs-viewer-shell flex flex-col h-full bg-background">
      <PdfToolbar
        editorMode={editorMode}
        setEditorMode={setEditorMode}
        zoom={zoom}
        handleZoom={handleZoom}
        handleZoomPreset={handleZoomPreset}
        currentPage={currentPage}
        numPages={numPages}
        loading={loading}
        hasChanges={hasChanges}
        saving={saving}
        showSearch={showSearch}
        onToggleSearch={() => {
          if (showSearch) closeSearch();
          else openSearch();
        }}
        goToPage={goToPage}
        handleRotate={handleRotate}
        handlePrint={handlePrint}
        handleDownloadOriginal={handleDownloadOriginal}
        handleDownloadAnnotated={handleDownloadAnnotated}
        handleSave={handleSave}
        handleAddImage={handleAddImage}
        dispatchParam={dispatchParam}
        shortcutLabels={{
          search: searchShortcutLabel,
          cancel: cancelShortcutLabel,
          save: saveShortcutLabel,
          zoomIn: zoomInShortcutLabel,
          zoomOut: zoomOutShortcutLabel,
        }}
      />

      {saveError && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-[var(--background-secondary-alt)]">
          <span className="text-xs text-accent-red">Save failed: {saveError}</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Retry save
          </button>
        </div>
      )}

      {showSearch && (
        <PdfSearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          caseSensitive={caseSensitive}
          setCaseSensitive={setCaseSensitive}
          entireWord={entireWord}
          setEntireWord={setEntireWord}
          highlightAll={highlightAll}
          setHighlightAll={setHighlightAll}
          searchMatchesCount={searchMatchesCount}
          searchStatusMessage={searchStatusMessage}
          searchInputRef={searchInputRef}
          handleSearch={handleSearch}
          onClose={closeSearch}
          pdfShortcuts={pdfShortcuts}
          shortcutLabels={{
            searchNext: searchNextShortcutLabel,
            searchPrev: searchPrevShortcutLabel,
          }}
        />
      )}

      {/* required by pdf.js */}
      <div className="flex-1 relative min-h-0">
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-auto bg-[var(--color-base-40)] thin-scrollbar"
        >
          <div ref={viewerRef} className="pdfViewer" />

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--color-base-40)] text-foreground-faint gap-3">
              <div className="w-8 h-8 border-2 border-[var(--color-base-50)] border-t-accent rounded-full animate-spin" />
              <span className="text-sm">Loading PDF...</span>
            </div>
          )}
        </div>
      </div>

      {editorMode !== 'none' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-tab-container text-foreground px-4 py-2 rounded-full text-sm shadow-lg border border-border flex items-center gap-2 z-50">
          {editorMode === 'freetext' && <><Type size={16} /> Click to add text</>}
          {editorMode === 'ink' && <><Pencil size={16} /> Draw on the page</>}
          {editorMode === 'highlight' && <><Highlighter size={16} /> Select text to highlight</>}
          {editorMode === 'stamp' && <><ImageIcon size={16} /> Click to add image</>}
          {cancelShortcutLabel && (
            <span className="text-foreground-faint ml-1 text-xs">({cancelShortcutLabel} to exit)</span>
          )}
        </div>
      )}
    </div>
  );
}

export default PdfViewerNative;
