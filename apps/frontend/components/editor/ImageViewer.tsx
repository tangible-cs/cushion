
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShortcutList, useShortcutBindings, useShortcutHandler } from '@/lib/shortcuts';

interface ImageViewerProps {
  filePath: string;
  base64Data: string;
  mimeType: string;
}

const IMAGE_SHORTCUT_IDS = ['image.zoom.in', 'image.zoom.out', 'image.reset'] as const;

export function ImageViewer({ filePath, base64Data, mimeType }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageShortcuts = useShortcutBindings(IMAGE_SHORTCUT_IDS);

  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const dataUri = `data:${mimeType};base64,${base64Data}`;

  const zoomIn = useCallback(() => setScale(s => Math.min(s * 1.25, 10)), []);
  const zoomOut = useCallback(() => setScale(s => Math.max(s / 1.25, 0.1)), []);
  const resetView = useCallback(() => { setScale(1); setPosition({ x: 0, y: 0 }); }, []);

  // Ctrl/Cmd + Scroll wheel zoom (non-customizable platform gesture).
  // This is intentionally NOT part of the shortcut registry because:
  //  - Wheel events are continuous gestures, not discrete key presses.
  //  - Ctrl+Scroll-to-zoom is a universal platform convention (browsers, PDF
  //    viewers, image editors) and users expect it to work without configuration.
  //  - Keyboard alternatives (image.zoom.in / image.zoom.out) are registry-driven
  //    and fully customizable in Settings.
  // Policy: US-D2 — classified as non-customizable gesture.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setScale(s => Math.min(Math.max(s * factor, 0.1), 10));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard shortcuts (US-E1)
  const imageHandlers = useMemo(() => ({
    'image.zoom.in': () => { zoomIn(); },
    'image.zoom.out': () => { zoomOut(); },
    'image.reset': () => { resetView(); },
  } as const), [zoomIn, zoomOut, resetView]);

  useShortcutHandler({ handlers: imageHandlers });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...position };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setPosition({
      x: posStart.current.x + (e.clientX - dragStart.current.x),
      y: posStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const onPointerUp = useCallback(() => setDragging(false), []);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50 flex-shrink-0">
        <span className="text-sm text-muted-foreground truncate mr-auto">{fileName}</span>
        <button
          onClick={zoomOut}
          className={toolBtn}
          title={(() => {
            const label = formatShortcutList(imageShortcuts['image.zoom.out']);
            return label ? `Zoom out (${label})` : 'Zoom out';
          })()}
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-muted-foreground w-14 text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={zoomIn}
          className={toolBtn}
          title={(() => {
            const label = formatShortcutList(imageShortcuts['image.zoom.in']);
            return label ? `Zoom in (${label})` : 'Zoom in';
          })()}
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={resetView}
          className={toolBtn}
          title={(() => {
            const label = formatShortcutList(imageShortcuts['image.reset']);
            return label ? `Reset (${label})` : 'Reset';
          })()}
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Image canvas */}
      <div
        ref={containerRef}
        className={cn(
          "flex-1 min-h-0 overflow-hidden flex items-center justify-center",
          "bg-[var(--md-bg,var(--background))]",
          dragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          src={dataUri}
          alt={fileName}
          draggable={false}
          className="select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            maxWidth: scale <= 1 ? '90%' : undefined,
            maxHeight: scale <= 1 ? '90%' : undefined,
            objectFit: 'contain',
          }}
        />
      </div>
    </div>
  );
}

const toolBtn = cn(
  "h-7 w-7 rounded flex items-center justify-center",
  "text-muted-foreground hover:text-foreground",
  "hover:bg-muted/40",
  "transition-colors duration-150"
);
