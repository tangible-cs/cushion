
import { useState, useCallback, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useDiffReviewStore } from '@/stores/diffReviewStore';
import { BINARY_FILE_EXTENSIONS } from '@/lib/binary-extensions';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type { ConnectionState, WorkspaceMetadata } from '@cushion/types';

interface UseFileTreeOptions {
  client: CoordinatorClient | null;
  metadata: WorkspaceMetadata | null;
  onFilesChanged?: (affectedDirs: Set<string>) => void;
}

interface UseFileTreeReturn {
  filePaths: string[];
  connectionState: ConnectionState;
  fetchFileTree: () => Promise<void>;
}

const BULK_CHANGE_THRESHOLD = 50;

export function useFileTree({
  client,
  metadata,
  onFilesChanged,
}: UseFileTreeOptions): UseFileTreeReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const workspacePath = metadata?.projectPath ?? null;
  const setStoreFlatFileList = useWorkspaceStore((state) => state.setFlatFileList);
  const onFilesChangedRef = useRef(onFilesChanged);
  const fetchRunIdRef = useRef(0);
  onFilesChangedRef.current = onFilesChanged;

  const fetchFileTree = useCallback(async () => {
    const runId = ++fetchRunIdRef.current;

    if (!client || !workspacePath) {
      setStoreFlatFileList([]);
      return;
    }

    try {
      const { paths } = await client.listAllFiles();

      if (runId !== fetchRunIdRef.current) return;

      const activeWorkspacePath = useWorkspaceStore.getState().metadata?.projectPath ?? null;
      if (activeWorkspacePath !== workspacePath) return;

      setStoreFlatFileList(paths);
    } catch (err) {
      if (runId !== fetchRunIdRef.current) return;
      console.error('[useFileTree] Failed to fetch file tree:', err);
    }
  }, [client, workspacePath, setStoreFlatFileList]);

  // Invalidate in-flight requests and clear on workspace switch
  useEffect(() => {
    fetchRunIdRef.current += 1;
    setStoreFlatFileList([]);
  }, [workspacePath, setStoreFlatFileList]);

  // Fetch on mount/dependencies change
  useEffect(() => {
    fetchFileTree();
  }, [fetchFileTree]);

  // Track connection state and handle reconnect
  useEffect(() => {
    if (!client) return;

    const unsubState = client.onConnectionStateChanged((state) => {
      setConnectionState(state);
    });

    setConnectionState(client.connectionState);

    const unsubReconnect = client.onReconnected(async () => {
      const meta = useWorkspaceStore.getState().metadata;
      if (!meta) return;

      try {
        await client.openWorkspace(meta.projectPath);
        onFilesChangedRef.current?.();
        fetchFileTree();
      } catch (err) {
        console.error('[useFileTree] Failed to restore workspace after reconnect:', err);
      }
    });

    return () => {
      unsubState();
      unsubReconnect();
    };
  }, [client, fetchFileTree]);

  // Re-fetch when file filter preferences change
  const allowedExtensions = useWorkspaceStore((s) => s.preferences.allowedExtensions);
  const respectGitignore = useWorkspaceStore((s) => s.preferences.respectGitignore);
  useEffect(() => {
    if (!client || !workspacePath) return;
    fetchFileTree();
  }, [allowedExtensions, respectGitignore]);

  // Subscribe to file system watcher notifications (incremental updates)
  useEffect(() => {
    if (!client || !workspacePath) return;

    const unsubTree = client.onFilesChanged((changes) => {
      // Collect parent directories affected by creates/deletes
      const affectedDirs = new Set<string>();
      for (const change of changes) {
        if (change.type === 'created' || change.type === 'deleted') {
          const lastSlash = change.path.lastIndexOf('/');
          affectedDirs.add(lastSlash > 0 ? change.path.slice(0, lastSlash) : '.');
        }
      }

      onFilesChangedRef.current?.(affectedDirs);

      // Bulk operation — full re-fetch
      if (changes.length > BULK_CHANGE_THRESHOLD) {
        fetchFileTree();
        return;
      }

      // Incremental update of flatFileList (skip directory events —
      // flatFileList only contains file paths)
      const state = useWorkspaceStore.getState();
      let updated = [...state.flatFileList];
      for (const change of changes) {
        if (change.isDirectory) continue;
        if (change.type === 'created') {
          if (!updated.includes(change.path)) {
            updated.push(change.path);
          }
        } else if (change.type === 'deleted') {
          updated = updated.filter((p) => p !== change.path);
          // Close the tab if the deleted file is open
          if (state.openFiles.has(change.path)) {
            state.closeFile(change.path);
          }
        }
        // 'modified' doesn't affect the path list
      }
      setStoreFlatFileList(updated);
    });

    const unsubFile = client.onFileChangedOnDisk(async (filePath, _mtime) => {
      // Skip files with a pending snapshot or being reviewed
      const diffState = useDiffReviewStore.getState();
      if (diffState.reviewingFilePath === filePath) return;
      if (diffState.fileSnapshots[filePath]) return;

      // Binary files are handled by their own viewers
      if (BINARY_FILE_EXTENSIONS.test(filePath)) return;

      const state = useWorkspaceStore.getState();
      const openFile = state.openFiles.get(filePath);
      if (!openFile) return;

      if (!openFile.isDirty) {
        try {
          const { content } = await client.readFile(filePath);
          // Re-check after async gap: user may have started editing
          const freshState = useWorkspaceStore.getState();
          const freshFile = freshState.openFiles.get(filePath);
          if (freshFile && !freshFile.isDirty) {
            freshState.replaceOpenFileContent(filePath, content);
          }
        } catch {
          // File may have been deleted
        }
      } else {
        // File has unsaved changes
        console.warn(`[useFileTree] File "${filePath}" changed on disk but has unsaved edits`);
      }
    });

    return () => {
      unsubTree();
      unsubFile();
    };
  }, [client, workspacePath, fetchFileTree, setStoreFlatFileList]);

  const filePaths = useWorkspaceStore((s) => s.flatFileList);

  return { filePaths, connectionState, fetchFileTree };
}
