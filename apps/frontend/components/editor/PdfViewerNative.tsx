'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  ZoomIn, ZoomOut, ChevronUp, ChevronDown,
  FileText, RotateCw, Download, Printer, Save,
  Search, X, Type, Pencil, Highlighter, Image as ImageIcon,
  MousePointer
} from 'lucide-react';
import { formatShortcutList, matchShortcut, useShortcutBindings, useShortcutHandler } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

interface PdfViewerNativeProps {
  filePath: string;
  base64Data: string;
  onSave?: (data: Uint8Array) => void;
}

const PDF_SHORTCUT_IDS = [
  'pdf.search.open',
  'pdf.search.next',
  'pdf.search.prev',
  'pdf.search.close',
  'pdf.save',
  'pdf.zoom.in',
  'pdf.zoom.out',
] as const;

// Annotation editor modes from pdf.js
const AnnotationEditorType = {
  DISABLE: -1,
  NONE: 0,
  FREETEXT: 3,
  HIGHLIGHT: 9,
  STAMP: 13,
  INK: 15,
};

// Param types from pdf.js AnnotationEditorParamsType (src/shared/util.js)
const AnnotationEditorParamsType = {
  RESIZE: 1,
  CREATE: 2,
  FREETEXT_SIZE: 11,
  FREETEXT_COLOR: 12,
  FREETEXT_OPACITY: 13,
  INK_COLOR: 21,
  INK_THICKNESS: 22,
  INK_OPACITY: 23,
  HIGHLIGHT_COLOR: 31,
  HIGHLIGHT_THICKNESS: 32,
  HIGHLIGHT_FREE: 33,
  HIGHLIGHT_SHOW_ALL: 34,
};

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', hex: '#FFFF00' },
  { name: 'Green', hex: '#00FF00' },
  { name: 'Cyan', hex: '#00FFFF' },
  { name: 'Pink', hex: '#FF69B4' },
  { name: 'Red', hex: '#FF0000' },
  { name: 'Orange', hex: '#FFA500' },
];

type EditorMode = 'none' | 'freetext' | 'ink' | 'highlight' | 'stamp';

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
  const [zoom, setZoom] = useState(100);
  const [editorMode, setEditorMode] = useState<EditorMode>('none');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const pdfShortcuts = useShortcutBindings(PDF_SHORTCUT_IDS);
  const [searchQuery, setSearchQuery] = useState('');

  // Toolbar param state
  const [freetextColor, setFreetextColor] = useState('#000000');
  const [freetextSize, setFreetextSize] = useState(14);
  const [inkColor, setInkColor] = useState('#000000');
  const [inkThickness, setInkThickness] = useState(3);
  const [inkOpacity, setInkOpacity] = useState(1);
  const [highlightColor, setHighlightColor] = useState('#FFFF00');

  const pdfDocRef = useRef<any>(null);
  const pdfViewerRef = useRef<any>(null);
  const eventBusRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Add image via file picker: enters stamp mode, then triggers keyboard add
  const handleAddImage = useCallback(() => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    // Enter stamp mode first
    try {
      viewer.annotationEditorMode = { mode: AnnotationEditorType.STAMP };
    } catch {}
    setEditorMode('stamp');
    // Trigger the "add new editor" via dispatching Enter on the annotation layer
    // pdf.js listens for Enter/Space to call addNewEditorFromKeyboard which opens file picker
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

        const pdfjsLib = await import('pdfjs-dist');
        const pdfjsViewer = await import('pdfjs-dist/web/pdf_viewer.mjs');

        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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
        // TODO: pdf.js doesn't export PDFViewer constructor types - cast unavoidable
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

        // Sync param changes back from pdf.js
        eventBus.on('annotationeditorparamschanged', (evt: any) => {
          for (const [type, value] of evt.details) {
            switch (type) {
              case AnnotationEditorParamsType.FREETEXT_SIZE:
                setFreetextSize(value);
                break;
              case AnnotationEditorParamsType.FREETEXT_COLOR:
                setFreetextColor(value);
                break;
              case AnnotationEditorParamsType.INK_COLOR:
                setInkColor(value);
                break;
              case AnnotationEditorParamsType.INK_THICKNESS:
                setInkThickness(value);
                break;
              case AnnotationEditorParamsType.INK_OPACITY:
                setInkOpacity(value);
                break;
              case AnnotationEditorParamsType.HIGHLIGHT_COLOR:
                setHighlightColor(value);
                break;
            }
          }
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
  }, [base64Data]);

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

  const handleZoom = useCallback((delta: number) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    const newScale = Math.max(0.25, Math.min(5, (zoom + delta) / 100));
    viewer.currentScale = newScale;
  }, [zoom]);

  const handleZoomPreset = useCallback((value: string) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    if (value === 'auto' || value === 'page-width' || value === 'page-fit') {
      viewer.currentScaleValue = value;
    } else {
      viewer.currentScale = Number(value) / 100;
    }
  }, []);

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
  }, [base64Data]);

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
  }, [onSave, saving]);

  const handleSearch = useCallback((direction: 'next' | 'prev' | 'initial' = 'initial') => {
    const eventBus = eventBusRef.current;
    if (!eventBus || !searchQuery) return;

    eventBus.dispatch('find', {
      source: null,
      type: direction === 'initial' ? '' : 'again',
      query: searchQuery,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: direction === 'prev',
    });
  }, [searchQuery]);

  // Keyboard shortcuts (US-E1)
  const pdfHandlers = useMemo(() => ({
    'pdf.search.open': () => {
      setShowSearch(true);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    },
    'pdf.search.close': () => {
      if (showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
      if (editorMode !== 'none') {
        setEditorMode('none');
      }
    },
    'pdf.save': () => { if (hasChanges) handleSave(); },
    'pdf.zoom.in': () => { handleZoom(10); },
    'pdf.zoom.out': () => { handleZoom(-10); },
  } as const), [showSearch, editorMode, hasChanges, handleSave, handleZoom]);

  useShortcutHandler({ handlers: pdfHandlers });

  // Ctrl/Cmd + Scroll wheel zoom (non-customizable platform gesture).
  // This is intentionally NOT part of the shortcut registry because:
  //  - Wheel events are continuous gestures, not discrete key presses.
  //  - Ctrl+Scroll-to-zoom is a universal platform convention (browsers, PDF
  //    viewers, image editors) and users expect it to work without configuration.
  //  - Keyboard alternatives (pdf.zoom.in / pdf.zoom.out) are registry-driven
  //    and fully customizable in Settings.
  // Policy: US-D2 — classified as non-customizable gesture.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        handleZoom(delta);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleZoom]);

  const fileName = filePath.split(/[/\\]/).pop() || 'Document';
  const zoomPresets = [50, 75, 100, 125, 150, 200, 300, 400];
  const searchShortcutLabel = formatShortcutList(pdfShortcuts['pdf.search.open']);
  const cancelShortcutLabel = formatShortcutList(pdfShortcuts['pdf.search.close']);
  const saveShortcutLabel = formatShortcutList(pdfShortcuts['pdf.save']);
  const zoomInShortcutLabel = formatShortcutList(pdfShortcuts['pdf.zoom.in']);
  const zoomOutShortcutLabel = formatShortcutList(pdfShortcuts['pdf.zoom.out']);
  const searchNextShortcutLabel = formatShortcutList(pdfShortcuts['pdf.search.next']);
  const searchPrevShortcutLabel = formatShortcutList(pdfShortcuts['pdf.search.prev']);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#1f1f1f] text-[#888] gap-4">
        <FileText className="w-16 h-16 opacity-50" />
        <div className="text-center">
          <p className="text-red-400 font-medium">Failed to load PDF</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1f1f1f]">
      {/* Unified Toolbar - single row */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[#323130] border-b border-[#484644] text-sm select-none">
        {/* Search button */}
        <button
          className={cn("p-1.5 rounded transition-colors", showSearch ? "bg-[#484644] text-white" : "hover:bg-[#484644] text-[#d4d4d4]")}
          onClick={() => {
            setShowSearch(s => !s);
            if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50);
          }}
          title={searchShortcutLabel ? `Search (${searchShortcutLabel})` : 'Search'}
        >
          <Search size={18} />
        </button>

        <div className="w-px h-5 bg-[#484644] mx-0.5" />

        {/* Annotation tools */}
        <button
          className={cn(
            "p-1.5 rounded transition-colors",
            editorMode === "none"
              ? "bg-[#0078d4] text-white"
              : "hover:bg-[#484644] text-[#d4d4d4]"
          )}
          onClick={() => setEditorMode('none')}
          title={cancelShortcutLabel ? `Selection tool (${cancelShortcutLabel})` : 'Selection tool'}
        >
          <MousePointer size={18} />
        </button>

        <button
          className={cn(
            "p-1.5 rounded transition-colors",
            editorMode === "freetext"
              ? "bg-[#0078d4] text-white"
              : "hover:bg-[#484644] text-[#d4d4d4]"
          )}
          onClick={() => setEditorMode(editorMode === 'freetext' ? 'none' : 'freetext')}
          title="Add text annotation"
        >
          <Type size={18} />
        </button>

        <button
          className={cn(
            "p-1.5 rounded transition-colors",
            editorMode === "ink"
              ? "bg-[#0078d4] text-white"
              : "hover:bg-[#484644] text-[#d4d4d4]"
          )}
          onClick={() => setEditorMode(editorMode === 'ink' ? 'none' : 'ink')}
          title="Draw / Ink annotation"
        >
          <Pencil size={18} />
        </button>

        <button
          className={cn(
            "p-1.5 rounded transition-colors",
            editorMode === "highlight"
              ? "bg-[#0078d4] text-white"
              : "hover:bg-[#484644] text-[#d4d4d4]"
          )}
          onClick={() => setEditorMode(editorMode === 'highlight' ? 'none' : 'highlight')}
          title="Highlight text"
        >
          <Highlighter size={18} />
        </button>

        <button
          className={cn(
            "p-1.5 rounded transition-colors",
            editorMode === "stamp"
              ? "bg-[#0078d4] text-white"
              : "hover:bg-[#484644] text-[#d4d4d4]"
          )}
          onClick={() => editorMode === 'stamp' ? setEditorMode('none') : handleAddImage()}
          title="Add image"
        >
          <ImageIcon size={18} />
        </button>

        {/* Tool-specific params inline */}
        {editorMode === 'freetext' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="color"
              value={freetextColor}
              onChange={(e) => {
                setFreetextColor(e.target.value);
                dispatchParam(AnnotationEditorParamsType.FREETEXT_COLOR, e.target.value);
              }}
              className="w-6 h-6 rounded cursor-pointer border border-[#484644] bg-transparent"
              title="Text color"
            />
            <input
              type="range"
              min={5}
              max={100}
              step={1}
              value={freetextSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                setFreetextSize(v);
                dispatchParam(AnnotationEditorParamsType.FREETEXT_SIZE, v);
              }}
              className="w-20 accent-[#0078d4]"
              title={`Font size: ${freetextSize}px`}
            />
            <span className="text-[#a0a0a0] text-xs w-6">{freetextSize}</span>
          </div>
        )}

        {editorMode === 'ink' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="color"
              value={inkColor}
              onChange={(e) => {
                setInkColor(e.target.value);
                dispatchParam(AnnotationEditorParamsType.INK_COLOR, e.target.value);
              }}
              className="w-6 h-6 rounded cursor-pointer border border-[#484644] bg-transparent"
              title="Ink color"
            />
            <label className="text-[#a0a0a0] text-xs">Size</label>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={inkThickness}
              onChange={(e) => {
                const v = Number(e.target.value);
                setInkThickness(v);
                dispatchParam(AnnotationEditorParamsType.INK_THICKNESS, v);
              }}
              className="w-16 accent-[#0078d4]"
              title={`Thickness: ${inkThickness}px`}
            />
            <span className="text-[#a0a0a0] text-xs w-4">{inkThickness}</span>
            <label className="text-[#a0a0a0] text-xs ml-1">Opacity</label>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={inkOpacity}
              onChange={(e) => {
                const v = Number(e.target.value);
                setInkOpacity(v);
                dispatchParam(AnnotationEditorParamsType.INK_OPACITY, v);
              }}
              className="w-16 accent-[#0078d4]"
              title={`Opacity: ${Math.round(inkOpacity * 100)}%`}
            />
            <span className="text-[#a0a0a0] text-xs w-7">{Math.round(inkOpacity * 100)}%</span>
          </div>
        )}

        {editorMode === 'highlight' && (
          <div className="flex items-center gap-1 ml-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.hex}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-colors",
                  highlightColor.toUpperCase() === c.hex
                    ? "border-white scale-110"
                    : "border-transparent hover:border-[#888]"
                )}
                style={{ backgroundColor: c.hex }}
                onClick={() => {
                  setHighlightColor(c.hex);
                  dispatchParam(AnnotationEditorParamsType.HIGHLIGHT_COLOR, c.hex);
                }}
                title={c.name}
              />
            ))}
          </div>
        )}

        {/* Center: Page navigation */}
        <div className="flex-1 flex items-center justify-center gap-0.5">
          <button
            className="p-1.5 rounded hover:bg-[#484644] text-[#d4d4d4] transition-colors disabled:opacity-40"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            title="Previous page"
          >
            <ChevronUp size={18} />
          </button>

          <button
            className="p-1.5 rounded hover:bg-[#484644] text-[#d4d4d4] transition-colors disabled:opacity-40"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages || loading}
            title="Next page"
          >
            <ChevronDown size={18} />
          </button>

          <div className="flex items-center gap-1.5 text-[#d4d4d4] text-sm ml-1">
            <input
              type="number"
              min={1}
              max={numPages}
              value={currentPage}
              onChange={(e) => goToPage(Number(e.target.value))}
              className="w-10 bg-[#1f1f1f] text-center rounded px-1 py-0.5 border border-[#484644] outline-none focus:border-[#0078d4] text-sm"
              disabled={loading}
            />
            <span className="text-[#a0a0a0]">of {numPages || '...'}</span>
          </div>
        </div>

        {/* Right: Zoom + Actions */}
        <div className="flex items-center gap-0.5">
          <button
            className="p-1.5 rounded hover:bg-[#484644] text-[#d4d4d4] transition-colors"
            onClick={() => handleZoom(-10)}
            title={zoomOutShortcutLabel ? `Zoom out (${zoomOutShortcutLabel})` : 'Zoom out'}
          >
            <ZoomOut size={18} />
          </button>

          <button
            className="p-1.5 rounded hover:bg-[#484644] text-[#d4d4d4] transition-colors"
            onClick={() => handleZoom(10)}
            title={zoomInShortcutLabel ? `Zoom in (${zoomInShortcutLabel})` : 'Zoom in'}
          >
            <ZoomIn size={18} />
          </button>

          <select
            value={zoom}
            onChange={(e) => handleZoomPreset(e.target.value)}
            className="bg-[#1f1f1f] text-[#d4d4d4] px-2 py-1 rounded text-sm border border-[#484644] outline-none cursor-pointer focus:border-[#0078d4] min-w-[100px] ml-1"
          >
            <option value="auto">Automatic</option>
            <option value="page-width">Fit to width</option>
            <option value="page-fit">Fit to page</option>
            <option disabled>─────────</option>
            {zoomPresets.map(preset => (
              <option key={preset} value={preset}>{preset}%</option>
            ))}
          </select>

          <div className="w-px h-5 bg-[#484644] mx-1" />

          <button
            className="p-1.5 rounded hover:bg-[#484644] text-[#d4d4d4] transition-colors"
            onClick={handleRotate}
            title="Rotate clockwise"
          >
            <RotateCw size={18} />
          </button>

          <button
            className="p-1.5 rounded hover:bg-[#484644] text-[#d4d4d4] transition-colors"
            onClick={handlePrint}
            title="Print"
          >
            <Printer size={18} />
          </button>

          <button
            className="p-1.5 rounded hover:bg-[#484644] text-[#d4d4d4] transition-colors"
            onClick={handleDownload}
            title="Download original"
          >
            <Download size={18} />
          </button>

          <button
            className={cn(
              "p-1.5 rounded transition-colors",
              hasChanges
                ? "bg-[#0078d4] text-white hover:bg-[#1084d8]"
                : "hover:bg-[#484644] text-[#d4d4d4] opacity-50"
            )}
            onClick={handleSave}
            disabled={!hasChanges || saving}
            title={hasChanges
              ? (saveShortcutLabel ? `Save with annotations (${saveShortcutLabel})` : 'Save with annotations')
              : 'No changes to save'
            }
          >
            <Save size={18} />
          </button>

          {hasChanges && (
            <span className="text-xs text-[#ffa500] ml-1">Unsaved changes</span>
          )}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#2d2d2d] border-b border-[#484644]">
          <Search size={16} className="text-[#888]" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.defaultPrevented) return;
              const nextBindings = pdfShortcuts['pdf.search.next'];
              const prevBindings = pdfShortcuts['pdf.search.prev'];
              if (matchShortcut(e.nativeEvent, prevBindings)) {
                e.preventDefault();
                handleSearch('prev');
                return;
              }
              if (matchShortcut(e.nativeEvent, nextBindings)) {
                e.preventDefault();
                handleSearch(searchQuery ? 'next' : 'initial');
              }
            }}
            placeholder="Search in document..."
            className="flex-1 bg-[#1f1f1f] text-[#d4d4d4] px-2 py-1 rounded border border-[#484644] outline-none focus:border-[#0078d4] text-sm min-w-[200px]"
          />
          <button
            onClick={() => handleSearch('prev')}
            className="p-1 rounded hover:bg-[#484644] text-[#d4d4d4]"
            title={searchPrevShortcutLabel ? `Previous match (${searchPrevShortcutLabel})` : 'Previous match'}
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => handleSearch('next')}
            className="p-1 rounded hover:bg-[#484644] text-[#d4d4d4]"
            title={searchNextShortcutLabel ? `Next match (${searchNextShortcutLabel})` : 'Next match'}
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={() => { setShowSearch(false); setSearchQuery(''); }}
            className="p-1 rounded hover:bg-[#484644] text-[#888]"
            title="Close search"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* PDF Viewer Container - structure required by pdf.js (container must be absolutely positioned) */}
      <div className="flex-1 relative min-h-0">
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-auto bg-[#525659] thin-scrollbar"
        >
          <div ref={viewerRef} className="pdfViewer" />

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#525659] text-[#888] gap-3">
              <div className="w-8 h-8 border-2 border-[#555] border-t-[#0078d4] rounded-full animate-spin" />
              <span className="text-sm">Loading PDF...</span>
            </div>
          )}
        </div>
      </div>

      {/* Mode indicator */}
      {editorMode !== 'none' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#323130] text-[#d4d4d4] px-4 py-2 rounded-full text-sm shadow-lg border border-[#484644] flex items-center gap-2 z-50">
          {editorMode === 'freetext' && <><Type size={16} /> Click to add text</>}
          {editorMode === 'ink' && <><Pencil size={16} /> Draw on the page</>}
          {editorMode === 'highlight' && <><Highlighter size={16} /> Select text to highlight</>}
          {editorMode === 'stamp' && <><ImageIcon size={16} /> Click to add image</>}
          {cancelShortcutLabel && (
            <span className="text-[#888] ml-1 text-xs">({cancelShortcutLabel} to exit)</span>
          )}
        </div>
      )}
    </div>
  );
}

export default PdfViewerNative;
