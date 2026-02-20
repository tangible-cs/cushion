import { useCallback, useEffect, useState, type RefObject } from 'react';

export function usePdfZoom(
  pdfViewerRef: RefObject<any>,
  containerRef: RefObject<HTMLDivElement | null>,
) {
  const [zoom, setZoom] = useState(100);

  const handleZoom = useCallback((delta: number) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    const newScale = Math.max(0.25, Math.min(5, (zoom + delta) / 100));
    viewer.currentScale = newScale;
  }, [zoom, pdfViewerRef]);

  const handleZoomPreset = useCallback((value: string) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    if (value === 'auto' || value === 'page-width' || value === 'page-fit') {
      viewer.currentScaleValue = value;
    } else {
      viewer.currentScale = Number(value) / 100;
    }
  }, [pdfViewerRef]);

  // Ctrl/Cmd + Scroll wheel zoom (non-customizable platform gesture).
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
  }, [handleZoom, containerRef]);

  return { zoom, setZoom, handleZoom, handleZoomPreset };
}
