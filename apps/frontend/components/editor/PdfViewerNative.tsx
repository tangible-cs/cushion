'use client';

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

interface PdfViewerNativeProps {
  filePath: string;
  base64Data: string;
  onSave?: (data: Uint8Array) => void;
}

/**
 * PDF Viewer using pdf.js native PDFViewer component with built-in annotation editors.
 * This uses pdf.js's own annotation editing which saves properly to PDF.
 */
export function PdfViewerNative({ filePath, base64Data, onSave }: PdfViewerNativeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [editorMode, setEditorMode] = useState<EditorMode>('none');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const pdfShortcuts = useShortcutBindings(PDF_SHORTCUT_IDS);

  const pdfDocRef = useRef<any>(null);
  const pdfViewerRef = useRef<any>(null);
  const eventBusRef = useRef<any>(null);

  // Extracted hooks
  const { zoom, setZoom, handleZoom, handleZoomPreset } = usePdfZoom(pdfViewerRef, containerRef);
  const {
    showSearch, searchQuery, setSearchQuery, searchInputRef,
    handleSearch, openSearch, closeSearch,
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

  // Load CSS on mount
  useEffect(() => {
    const existingLink = document.querySelector('link[href="/pdfjs/pdf_viewer.css"]');
    if (!existingLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/pdfjs/pdf_viewer.css';
      document.head.appendChild(link);
    }
  }, []);

  // Initialize PDF viewer
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const pdfjsViewer = await import('pdfjs-dist/legacy/web/pdf_viewer.mjs');

        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;

        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);

        const eventBus = new pdfjsViewer.EventBus();
        eventBusRef.current = eventBus;

        const linkService = new pdfjsViewer.PDFLinkService({ eventBus });

        const findController = new pdfjsViewer.PDFFindController({
          eventBus,
          linkService,
        });

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
        pdfViewerRef.current = viewer;

        linkService.setViewer(viewer);

        eventBus.on('pagechanging', (evt: any) => {
          setCurrentPage(evt.pageNumber);
        });

        eventBus.on('scalechanging', (evt: any) => {
          setZoom(Math.round(evt.scale * 100));
        });

        eventBus.on('pagesinit', () => {
          viewer.currentScaleValue = 'auto';
          setLoading(false);
        });

        // Sync param changes back from pdf.js (toolbar manages its own param state now)
        eventBus.on('annotationeditorparamschanged', (_evt: any) => {
          // PdfToolbar owns the param state; pdf.js events are handled internally
        });

        const annotationStorage = pdfDoc.annotationStorage;
        if (annotationStorage) {
          annotationStorage.onSetModified = () => setHasChanges(true);
          annotationStorage.onResetModified = () => setHasChanges(false);
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
      pdfViewerRef.current?.cleanup();
    };
  }, [base64Data, setZoom]);

  // Handle editor mode changes
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

  const handleDownload = useCallback(() => {
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [base64Data, fileName]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleSave = useCallback(async () => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc || saving) return;

    try {
      setSaving(true);
      const data = await pdfDoc.saveDocument();

      if (onSave) {
        onSave(data);
      } else {
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.replace(/\.pdf$/i, '_annotated.pdf');
        a.click();
        URL.revokeObjectURL(url);
      }

      setHasChanges(false);
    } catch (err) {
      console.error('Error saving PDF:', err);
      alert('Failed to save PDF: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }, [onSave, saving, fileName]);

  // Keyboard shortcuts
  const pdfHandlers = useMemo(() => ({
    'pdf.search.open': () => { openSearch(); },
    'pdf.search.close': () => {
      if (showSearch) closeSearch();
      if (editorMode !== 'none') setEditorMode('none');
    },
    'pdf.save': () => { if (hasChanges) handleSave(); },
    'pdf.zoom.in': () => { handleZoom(10); },
    'pdf.zoom.out': () => { handleZoom(-10); },
  } as const), [showSearch, editorMode, hasChanges, handleSave, handleZoom, openSearch, closeSearch]);

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
    <div className="flex flex-col h-full bg-background">
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
        handleDownload={handleDownload}
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

      {showSearch && (
        <PdfSearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
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

      {/* PDF Viewer Container - structure required by pdf.js */}
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

      {/* Mode indicator */}
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
