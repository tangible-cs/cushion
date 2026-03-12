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

    getSharedCoordinatorClient()
      .then((client) => client.getPopularProviders())
      .then((result) => {
        if (!cancelled) setIds(result.ids);
      })
      .catch(() => {
        // Silently fall back to empty list — models will sort alphabetically.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return ids;
}
