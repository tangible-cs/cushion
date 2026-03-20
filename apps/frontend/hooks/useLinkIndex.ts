
import { useState, useCallback, useEffect, useRef } from 'react';
import { buildLinkIndex, type LinkIndex } from '@/lib/link-index';
import { flattenFileTree } from '@/lib/wiki-link-resolver';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type { FileTreeNode, FileState, WorkspaceMetadata } from '@cushion/types';

const isMarkdownFile = (filePath: string) => filePath.toLowerCase().endsWith('.md');

interface UseLinkIndexOptions {
  client: CoordinatorClient | null;
  metadata: WorkspaceMetadata | null;
  fileTree: FileTreeNode[];
  openFiles: Map<string, FileState>;
}

export function useLinkIndex({
  client,
  metadata,
  fileTree,
  openFiles,
}: UseLinkIndexOptions): LinkIndex | null {
  const [linkIndex, setLinkIndex] = useState<LinkIndex | null>(null);
  const fileContentsRef = useRef<Map<string, string>>(new Map());
  const openFilesSnapshotRef = useRef<Map<string, FileState>>(new Map());
  const indexBuildIdRef = useRef(0);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rebuildIndexFromCache = useCallback(() => {
    if (!metadata || fileTree.length === 0) {
      setLinkIndex(null);
      return;
    }
    const snapshot = new Map(fileContentsRef.current);
    setLinkIndex(buildLinkIndex(snapshot, fileTree));
  }, [fileTree, metadata]);

  const scheduleRebuildIndex = useCallback((delay = 200) => {
    if (rebuildTimerRef.current) {
      clearTimeout(rebuildTimerRef.current);
    }
    rebuildTimerRef.current = setTimeout(() => {
      rebuildTimerRef.current = null;
      rebuildIndexFromCache();
    }, delay);
  }, [rebuildIndexFromCache]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (rebuildTimerRef.current) {
        clearTimeout(rebuildTimerRef.current);
      }
    };
  }, []);

  // Build initial index when client/metadata/fileTree change
  const buildIndex = useCallback(async () => {
    if (!client || !metadata || fileTree.length === 0) {
      fileContentsRef.current = new Map();
      setLinkIndex(null);
      return;
    }

    const buildId = ++indexBuildIdRef.current;

    try {
      const allFiles = flattenFileTree(fileTree);
      const mdFiles = allFiles.filter(isMarkdownFile);
      const fileContents = new Map<string, string>();

      await Promise.all(
        mdFiles.map(async (filePath) => {
          try {
            const { content } = await client.readFile(filePath);
            fileContents.set(filePath, content);
          } catch {
            // Skip files that can't be read
          }
        })
      );

      if (buildId !== indexBuildIdRef.current) return;

      // Overlay open files (which may have unsaved edits)
      openFiles.forEach((file, filePath) => {
        if (isMarkdownFile(filePath)) {
          fileContents.set(filePath, file.content);
        }
      });

      fileContentsRef.current = fileContents;
      setLinkIndex(buildLinkIndex(fileContents, fileTree));
    } catch (err) {
      console.error('[useLinkIndex] Failed to build link index:', err);
    }
  }, [client, metadata, fileTree, openFiles]);

  useEffect(() => {
    buildIndex();
  }, [buildIndex]);

  // Sync open files to cache and schedule debounced rebuild
  useEffect(() => {
    if (!metadata || fileTree.length === 0) return;

    const prevOpenFiles = openFilesSnapshotRef.current;
    const nextOpenFiles = openFiles;

    // When a file is closed, save its last saved content to cache
    prevOpenFiles.forEach((file, filePath) => {
      if (!nextOpenFiles.has(filePath) && isMarkdownFile(filePath)) {
        fileContentsRef.current.set(filePath, file.savedContent);
      }
    });

    // When a file is open, use its current (possibly unsaved) content
    nextOpenFiles.forEach((file, filePath) => {
      if (isMarkdownFile(filePath)) {
        fileContentsRef.current.set(filePath, file.content);
      }
    });

    openFilesSnapshotRef.current = new Map(nextOpenFiles);
    scheduleRebuildIndex();
  }, [openFiles, fileTree, metadata, scheduleRebuildIndex]);

  return linkIndex;
}
