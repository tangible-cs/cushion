import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getSharedCoordinatorClient } = vi.hoisted(() => ({
  getSharedCoordinatorClient: vi.fn(),
}));

vi.mock('@/lib/shared-coordinator-client', () => ({
  getSharedCoordinatorClient,
}));

import { usePopularProviders } from './usePopularProviders';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function tick() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function mountUsePopularProviders() {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const root: Root = createRoot(host);
  let value: string[] = [];

  function Harness() {
    value = usePopularProviders();
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });

  return {
    getValue: () => value,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe('usePopularProviders', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reloads provider order after reconnect', async () => {
    let onState = (_state: string) => {};
    let onReconnect = () => {};
    const client = {
      getPopularProviders: vi.fn()
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValueOnce({ ids: ['opencode', 'anthropic'] }),
      onConnectionStateChanged: vi.fn((cb) => {
        onState = cb;
        return () => {};
      }),
      onReconnected: vi.fn((cb) => {
        onReconnect = cb;
        return () => {};
      }),
    };

    getSharedCoordinatorClient.mockResolvedValue(client);

    const mounted = mountUsePopularProviders();
    await tick();

    expect(mounted.getValue()).toEqual([]);

    await act(async () => {
      onReconnect();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(client.getPopularProviders).toHaveBeenCalledTimes(2);
    expect(mounted.getValue()).toEqual(['opencode', 'anthropic']);

    await act(async () => {
      onState('connected');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(client.getPopularProviders).toHaveBeenCalledTimes(3);
    mounted.cleanup();
  });
});
