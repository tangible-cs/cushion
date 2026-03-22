
import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';

export function useWorkspacePicker(onWorkspaceOpened?: () => void) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { openWorkspace, selectWorkspaceFolder, setClient } = useWorkspaceStore();

  useEffect(() => {
    let cancelled = false;
    getSharedCoordinatorClient()
      .then((client) => {
        if (cancelled) return;
        setClient(client);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [setClient]);

  const handleBrowse = async () => {
    setError(null);
    try {
      const path = await selectWorkspaceFolder();
      if (!path) return;

      setIsOpening(true);
      await openWorkspace(path);
      onWorkspaceOpened?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open workspace');
    } finally {
      setIsOpening(false);
    }
  };

  const handleOpenRecent = async (path: string) => {
    setIsOpening(true);
    setError(null);
    try {
      await openWorkspace(path);
      onWorkspaceOpened?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open workspace');
    } finally {
      setIsOpening(false);
    }
  };

  return { isOpening, error, handleBrowse, handleOpenRecent };
}
