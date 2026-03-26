
import { useCallback, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useDiffReviewStore } from '@/stores/diffReviewStore';
import { BINARY_FILE_EXTENSIONS } from '@/lib/binary-extensions';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type { WorkspaceMetadata } from '@cushion/types';

interface UseFileTreeOptions {
  client: CoordinatorClient | null;
  metadata: WorkspaceMetadata | null;
  onFilesChanged?: (affectedDirs: Set<string>) => void;
}

interface UseFileTreeReturn {
  filePaths: string[];
  fetchFileTree: () => Promise<void>;
}

const BULK_CHANGE_THRESHOLD = 50;

export function useFileTree({
  client,
  metadata,
  onFilesChanged,
}: UseFileTreeOptions): UseFileTreeReturn {
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

  useEffect(() => {
    fetchRunIdRef.current += 1;
    setStoreFlatFileList([]);
  }, [workspacePath, setStoreFlatFileList]);

  useEffect(() => {
    fetchFileTree();
  }, [fetchFileTree]);

  const allowedExtensions = useWorkspaceStore((s) => s.preferences.allowedExtensions);
  const respectGitignore = useWorkspaceStore((s) => s.preferences.respectGitignore);
  useEffect(() => {
    if (!client || !workspacePath) return;
    fetchFileTree();
  }, [allowedExtensions, respectGitignore, fetchFileTree]);

  useEffect(() => {
    if (!client || !workspacePath) return;

    const unsubTree = client.onFilesChanged((changes) => {
      const affectedDirs = new Set<string>();
      for (const change of changes) {
        if (change.type === 'created' || change.type === 'deleted') {
          const lastSlash = change.path.lastIndexOf('/');
          affectedDirs.add(lastSlash > 0 ? change.path.slice(0, lastSlash) : '.');
        }
      }

      onFilesChangedRef.current?.(affectedDirs);

      if (changes.length > BULK_CHANGE_THRESHOLD) {
        fetchFileTree();
        return;
      }

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
          if (state.openFiles.has(change.path)) {
            state.closeFile(change.path);
          }
        }
      }
      setStoreFlatFileList(updated);
    });

    const unsubFile = client.onFileChangedOnDisk(async (filePath, _mtime) => {
      const diffState = useDiffReviewStore.getState();
      if (diffState.reviewingFilePath === filePath) return;
      if (diffState.fileSnapshots[filePath]) return;

      if (BINARY_FILE_EXTENSIONS.test(filePath)) return;

      const state = useWorkspaceStore.getState();
      const openFile = state.openFiles.get(filePath);
      if (!openFile) return;

      if (!openFile.isDirty) {
        try {
          const { content } = await client.readFile(filePath);
          const freshState = useWorkspaceStore.getState();
          const freshFile = freshState.openFiles.get(filePath);
          if (freshFile && !freshFile.isDirty) {
            freshState.replaceOpenFileContent(filePath, content);
          }
        } catch {
          // File may have been deleted
        }
      } else {
        console.warn(`[useFileTree] File "${filePath}" changed on disk but has unsaved edits`);
      }
    });

    return () => {
      unsubTree();
      unsubFile();
    };
  }, [client, workspacePath, fetchFileTree, setStoreFlatFileList]);

  const filePaths = useWorkspaceStore((s) => s.flatFileList);

  return { filePaths, fetchFileTree };
}
