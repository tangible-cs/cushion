import { useEffect, useState } from 'react';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';

/**
 * Fetches the popular-provider ordering from the coordinator.
 *
 * Returns an empty array until the RPC resolves, which means the sort
 * comparator will treat every provider equally until the data arrives.
 */
export function usePopularProviders(): string[] {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    let stopState = () => {};
    let stopReconnect = () => {};

    const load = async () => {
      try {
        const client = await getSharedCoordinatorClient();
        if (cancelled) return;

        const result = await client.getPopularProviders();
        if (!cancelled) setIds(result.ids);
      } catch {
        // Silently fall back to empty list until the coordinator reconnects.
      }
    };

    getSharedCoordinatorClient()
      .then((client) => {
        if (cancelled) return;

        const reload = () => {
          void load();
        };

        stopState = client.onConnectionStateChanged((state) => {
          if (state === 'connected') reload();
        });
        stopReconnect = client.onReconnected(reload);
        reload();
      })
      .catch(() => {
        void load();
      });

    return () => {
      cancelled = true;
      stopState();
      stopReconnect();
    };
  }, []);

  return ids;
}
