import { useState, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, ChevronUp, ChevronDown,
  RotateCw, Download, Printer, Save,
  Search, X, Type, Pencil, Highlighter, Image as ImageIcon,
  MousePointer
} from 'lucide-react';
import { matchShortcut } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import {
  AnnotationEditorParamsType,
  HIGHLIGHT_COLORS,
  type EditorMode,
} from './pdf-constants';

type PdfToolbarProps = {
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  zoom: number;
  handleZoom: (delta: number) => void;
  handleZoomPreset: (value: string) => void;
  currentPage: number;
  numPages: number;
  loading: boolean;
  hasChanges: boolean;
  saving: boolean;
  showSearch: boolean;
  onToggleSearch: () => void;
  goToPage: (page: number) => void;
  handleRotate: () => void;
  handlePrint: () => void;
  handleDownload: () => void;
  handleSave: () => void;
  handleAddImage: () => void;
  dispatchParam: (type: number, value: any) => void;
  shortcutLabels: {
    search: string;
    cancel: string;
    save: string;
    zoomIn: string;
    zoomOut: string;
  };
};

const zoomPresets = [50, 75, 100, 125, 150, 200, 300, 400];

export function PdfToolbar({
  editorMode,
  setEditorMode,
  zoom,
  handleZoom,
  handleZoomPreset,
  currentPage,
  numPages,
  loading,
  hasChanges,
  saving,
  showSearch,
  onToggleSearch,
  goToPage,
  handleRotate,
  handlePrint,
  handleDownload,
  handleSave,
  handleAddImage,
  dispatchParam,
  shortcutLabels,
}: PdfToolbarProps) {
  // Toolbar param state
  const [freetextColor, setFreetextColor] = useState('#000000');
  const [freetextSize, setFreetextSize] = useState(14);
  const [inkColor, setInkColor] = useState('#000000');
  const [inkThickness, setInkThickness] = useState(3);
  const [inkOpacity, setInkOpacity] = useState(1);
  const [highlightColor, setHighlightColor] = useState('#FFFF00');

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[#323130] border-b border-[#484644] text-sm select-none">
      {/* Search button */}
      <button
        className={cn("p-1.5 rounded transition-colors", showSearch ? "bg-[#484644] text-white" : "hover:bg-[#484644] text-[#d4d4d4]")}
        onClick={onToggleSearch}
        title={shortcutLabels.search ? `Search (${shortcutLabels.search})` : 'Search'}
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
        title={shortcutLabels.cancel ? `Selection tool (${shortcutLabels.cancel})` : 'Selection tool'}
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
          title={shortcutLabels.zoomOut ? `Zoom out (${shortcutLabels.zoomOut})` : 'Zoom out'}
        >
          <ZoomOut size={18} />
        </button>

        <button
          className="p-1.5 rounded hover:bg-[#484644] text-[#d4d4d4] transition-colors"
          onClick={() => handleZoom(10)}
          title={shortcutLabels.zoomIn ? `Zoom in (${shortcutLabels.zoomIn})` : 'Zoom in'}
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
            ? (shortcutLabels.save ? `Save with annotations (${shortcutLabels.save})` : 'Save with annotations')
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
  );
}

type PdfSearchBarProps = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  handleSearch: (direction: 'next' | 'prev' | 'initial') => void;
  onClose: () => void;
  pdfShortcuts: Record<string, any>;
  shortcutLabels: {
    searchNext: string;
    searchPrev: string;
  };
};

export function PdfSearchBar({
  searchQuery,
  setSearchQuery,
  searchInputRef,
  handleSearch,
  onClose,
  pdfShortcuts,
  shortcutLabels,
}: PdfSearchBarProps) {
  return (
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
        title={shortcutLabels.searchPrev ? `Previous match (${shortcutLabels.searchPrev})` : 'Previous match'}
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={() => handleSearch('next')}
        className="p-1 rounded hover:bg-[#484644] text-[#d4d4d4]"
        title={shortcutLabels.searchNext ? `Next match (${shortcutLabels.searchNext})` : 'Next match'}
      >
        <ChevronDown size={16} />
      </button>
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-[#484644] text-[#888]"
        title="Close search"
      >
        <X size={16} />
      </button>
    </div>
  );
}
