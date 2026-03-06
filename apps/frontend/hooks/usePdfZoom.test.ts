import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { usePdfZoom } from './usePdfZoom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountUsePdfZoom(viewer: any, container: HTMLDivElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const root: Root = createRoot(host);
  let hookValue: ReturnType<typeof usePdfZoom> | null = null;

  function Harness() {
    hookValue = usePdfZoom({ current: viewer }, { current: container });
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });

  return {
    getHook() {
      if (!hookValue) {
        throw new Error('Hook was not mounted');
      }
      return hookValue;
    },
    cleanup() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function dispatchZoomWheel(
  container: HTMLDivElement,
  options: Pick<WheelEventInit, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey' | 'metaKey'> & {
    clientX?: number;
    clientY?: number;
  },
) {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
    deltaX: options.deltaX ?? 0,
    deltaY: options.deltaY ?? 0,
    deltaMode: options.deltaMode,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
  });

  act(() => {
    container.dispatchEvent(event);
  });

  return event;
}

describe('usePdfZoom', () => {
  let viewer: {
    updateScale: ReturnType<typeof vi.fn>;
    currentScale: number;
    currentScaleValue: string;
  };
  let container: HTMLDivElement;
  let unmount: () => void;
  let getHook: () => ReturnType<typeof usePdfZoom>;

  beforeEach(() => {
    viewer = {
      updateScale: vi.fn(),
      currentScale: 1,
      currentScaleValue: 'page-width',
    };

    container = document.createElement('div');
    document.body.appendChild(container);

    const mounted = mountUsePdfZoom(viewer, container);
    unmount = mounted.cleanup;
    getHook = mounted.getHook;
  });

  afterEach(() => {
    unmount();
    container.remove();
  });

  it('translates toolbar zoom delta into whole updateScale steps', () => {
    act(() => {
      getHook().handleZoom(19);
      getHook().handleZoom(-4);
    });

    expect(viewer.updateScale).toHaveBeenNthCalledWith(1, {
      steps: 2,
      origin: undefined,
    });
    expect(viewer.updateScale).toHaveBeenNthCalledWith(2, {
      steps: -1,
      origin: undefined,
    });
  });

  it('normalizes ctrl/cmd wheel zoom and preserves cursor origin', () => {
    const event = dispatchZoomWheel(container, {
      deltaX: 0,
      deltaY: -120,
      deltaMode: 0,
      ctrlKey: true,
      clientX: 120,
      clientY: 48,
    });

    expect(event.defaultPrevented).toBe(true);
    expect(viewer.updateScale).toHaveBeenCalledWith({
      steps: 4,
      origin: [120, 48],
    });
  });

  it('accumulates pixel-wheel deltas before applying a zoom step', () => {
    dispatchZoomWheel(container, {
      deltaY: -15,
      deltaMode: 0,
      ctrlKey: true,
    });
    expect(viewer.updateScale).not.toHaveBeenCalled();

    dispatchZoomWheel(container, {
      deltaY: -15,
      deltaMode: 0,
      ctrlKey: true,
    });
    expect(viewer.updateScale).toHaveBeenCalledWith({
      steps: 1,
      origin: [0, 0],
    });
  });

  it('maps line-mode wheel deltas to single in/out steps', () => {
    dispatchZoomWheel(container, {
      deltaY: 1,
      deltaMode: 1,
      ctrlKey: true,
    });

    expect(viewer.updateScale).toHaveBeenCalledWith({
      steps: -1,
      origin: [0, 0],
    });
  });

  it('resets accumulated wheel ticks when zoom is reset', () => {
    dispatchZoomWheel(container, {
      deltaY: -15,
      deltaMode: 0,
      ctrlKey: true,
    });
    expect(viewer.updateScale).not.toHaveBeenCalled();

    act(() => {
      getHook().handleZoomReset();
    });

    expect(viewer.currentScaleValue).toBe('auto');

    dispatchZoomWheel(container, {
      deltaY: -15,
      deltaMode: 0,
      ctrlKey: true,
    });
    expect(viewer.updateScale).not.toHaveBeenCalled();
  });
});
