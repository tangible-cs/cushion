'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type { FileTreeNode, ConnectionState, WorkspaceMetadata } from '@cushion/types';

interface UseFileTreeOptions {
  client: CoordinatorClient | null;
  metadata: WorkspaceMetadata | null;
  onFilesChanged?: () => void;
}

interface UseFileTreeReturn {
  fileTree: FileTreeNode[];
  connectionState: ConnectionState;
  fetchFileTree: () => Promise<void>;
}

export function useFileTree({
  client,
  metadata,
  onFilesChanged,
}: UseFileTreeOptions): UseFileTreeReturn {
  const [fileTree, setFileTreeLocal] = useState<FileTreeNode[]>([]);
  const [fileTreeWorkspacePath, setFileTreeWorkspacePath] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const workspacePath = metadata?.projectPath ?? null;
  const setStoreFileTree = useWorkspaceStore((state) => state.setFileTree);
  const onFilesChangedRef = useRef(onFilesChanged);
  const fetchRunIdRef = useRef(0);
  onFilesChangedRef.current = onFilesChanged;

  const setFileTree = useCallback((tree: FileTreeNode[], sourceWorkspacePath: string | null) => {
    setFileTreeLocal(tree);
    setFileTreeWorkspacePath(sourceWorkspacePath);
    setStoreFileTree(tree);
  }, [setStoreFileTree]);

  const fetchFileTree = useCallback(async () => {
    const runId = ++fetchRunIdRef.current;

    if (!client || !workspacePath) {
      setFileTree([], workspacePath);
      return;
    }

    const buildTree = async (relativePath: string): Promise<FileTreeNode[]> => {
      if (runId !== fetchRunIdRef.current) {
        return [];
      }

      const { files } = await client.listFiles(relativePath);
      const resolved = await Promise.all(
        files.map(async (node) => {
          if (node.type !== 'directory') {
            return node;
          }

          const childPath = node.path || (relativePath === '.' ? node.name : `${relativePath}/${node.name}`);
          try {
            const children = await buildTree(childPath);
            return { ...node, children };
          } catch (error) {
            if (runId !== fetchRunIdRef.current) {
              return { ...node, children: [] };
            }
            console.error('[useFileTree] Failed to list directory:', childPath, error);
            return { ...node, children: [] };
          }
        })
      );

      return resolved;
    };

    try {
      const fullTree = await buildTree('.');

      if (runId !== fetchRunIdRef.current) {
        return;
      }

      const activeWorkspacePath = useWorkspaceStore.getState().metadata?.projectPath ?? null;
      if (activeWorkspacePath !== workspacePath) {
        return;
      }

      setFileTree(fullTree, workspacePath);
    } catch (err) {
      if (runId !== fetchRunIdRef.current) {
        return;
      }
      console.error('[useFileTree] Failed to fetch file tree:', err);
    }
  }, [client, workspacePath, setFileTree]);

  // Invalidate in-flight tree requests and clear visible tree on workspace switch
  useEffect(() => {
    fetchRunIdRef.current += 1;
    setFileTree([], workspacePath);
  }, [workspacePath, setFileTree]);

  // Fetch tree on mount/dependencies change
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

  // Subscribe to file system watcher notifications
  useEffect(() => {
    if (!client || !workspacePath) return;

    const unsubTree = client.onFilesChanged(() => {
      onFilesChangedRef.current?.();
      fetchFileTree();
    });

    const unsubFile = client.onFileChangedOnDisk(async (filePath, _mtime) => {
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
        // File has unsaved changes — warn (full conflict UI is a future step)
        console.warn(`[useFileTree] File "${filePath}" changed on disk but has unsaved edits`);
      }
    });

    return () => {
      unsubTree();
      unsubFile();
    };
  }, [client, workspacePath, fetchFileTree]);

  const resolvedFileTree = fileTreeWorkspacePath === workspacePath ? fileTree : [];

  return { fileTree: resolvedFileTree, connectionState, fetchFileTree };
}
