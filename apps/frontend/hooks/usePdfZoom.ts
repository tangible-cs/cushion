import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const DEFAULT_SCALE_VALUE = 'auto';
const DEFAULT_SCALE_DELTA = 1.1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const WHEEL_ZOOM_STEP_PERCENT = 10;
const PIXELS_PER_LINE_SCALE = 30;

function normalizeWheelEventDirection(evt: WheelEvent): number {
  let delta = Math.hypot(evt.deltaX, evt.deltaY);
  const angle = Math.atan2(evt.deltaY, evt.deltaX);

  if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
    delta = -delta;
  }

  return delta;
}

export function usePdfZoom(
  pdfViewerRef: RefObject<any>,
  containerRef: RefObject<HTMLDivElement | null>,
) {
  const [zoom, setZoom] = useState(100);
  const wheelUnusedTicksRef = useRef(0);

  const accumulateWheelTicks = useCallback((ticks: number) => {
    let accumulatedTicks = wheelUnusedTicksRef.current;

    if ((accumulatedTicks > 0 && ticks < 0) || (accumulatedTicks < 0 && ticks > 0)) {
      accumulatedTicks = 0;
    }

    accumulatedTicks += ticks;

    const wholeTicks = Math.trunc(accumulatedTicks);
    wheelUnusedTicksRef.current = accumulatedTicks - wholeTicks;

    return wholeTicks;
  }, []);

  const applyZoomSteps = useCallback((steps: number, origin?: [number, number]) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;

    const wholeSteps = Math.trunc(steps);
    if (wholeSteps === 0) return;

    if (typeof viewer.updateScale === 'function') {
      viewer.updateScale({ steps: wholeSteps, origin });
      return;
    }

    const currentScale =
      typeof viewer.currentScale === 'number' && Number.isFinite(viewer.currentScale)
        ? viewer.currentScale
        : 1;

    const scaleDelta = wholeSteps > 0 ? DEFAULT_SCALE_DELTA : 1 / DEFAULT_SCALE_DELTA;
    const round = wholeSteps > 0 ? Math.ceil : Math.floor;
    let fallbackScale = currentScale;
    let remainingSteps = Math.abs(wholeSteps);

    do {
      fallbackScale = round(Number((fallbackScale * scaleDelta).toFixed(2)) * 10) / 10;
    } while (--remainingSteps > 0);

    viewer.currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fallbackScale));
  }, [pdfViewerRef]);

  const handleZoom = useCallback((delta: number) => {
    if (!Number.isFinite(delta) || delta === 0) return;

    const steps = delta > 0
      ? Math.max(1, Math.round(delta / WHEEL_ZOOM_STEP_PERCENT))
      : -Math.max(1, Math.round(Math.abs(delta) / WHEEL_ZOOM_STEP_PERCENT));

    applyZoomSteps(steps);
  }, [applyZoomSteps]);

  const handleZoomReset = useCallback(() => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;

    wheelUnusedTicksRef.current = 0;
    viewer.currentScaleValue = DEFAULT_SCALE_VALUE;
  }, [pdfViewerRef]);

  const handleZoomPreset = useCallback((value: string) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;

    wheelUnusedTicksRef.current = 0;

    if (value === 'auto' || value === 'page-width' || value === 'page-fit') {
      viewer.currentScaleValue = value;
    } else {
      const parsedScale = Number(value) / 100;
      if (!Number.isFinite(parsedScale)) {
        return;
      }
      viewer.currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, parsedScale));
    }
  }, [pdfViewerRef]);

  // Ctrl/Cmd + Scroll wheel zoom (non-customizable platform gesture).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }

      e.preventDefault();

      const delta = normalizeWheelEventDirection(e);
      const deltaMode = e.deltaMode;
      let ticks = 0;

      if (deltaMode === WheelEvent.DOM_DELTA_LINE || deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        ticks = Math.abs(delta) >= 1
          ? Math.sign(delta)
          : accumulateWheelTicks(delta);
      } else {
        ticks = accumulateWheelTicks(delta / PIXELS_PER_LINE_SCALE);
      }

      if (ticks !== 0) {
        applyZoomSteps(ticks, [e.clientX, e.clientY]);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [accumulateWheelTicks, applyZoomSteps, containerRef]);

  return { zoom, setZoom, handleZoom, handleZoomPreset, handleZoomReset };
}
