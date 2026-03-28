
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { CodeEditor } from './CodeEditor';
import { EditorNavRow } from './EditorNavRow';
import { buildEditorBreadcrumb } from './editor-path';
import { FileHeader } from './FileHeader';
import { buildNewFilePath } from '@/lib/wiki-link-resolver';
import { uint8ArrayToBase64 } from '@/lib/pdf-bytes';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type { EditorView } from '@codemirror/view';
import { BINARY_FILE_EXTENSIONS } from '@/lib/binary-extensions';
import type { WikiLinkNavigateCallback } from '@/lib/codemirror-wysiwyg';
import { DiffReviewBar } from './DiffReviewBar';
import { useDiffReviewStore } from '@/stores/diffReviewStore';
import { exportToPdf } from '@/lib/pdf-export';
import { ExportOptionsDialog } from './ExportOptionsDialog';
import type { PdfExportOptions } from '@cushion/types';
import { getViewForFile } from '@/lib/view-registry';
import { EditorPanelProvider } from './EditorPanelContext';
import { RecordingOverlay } from './RecordingOverlay';
import { setInsertTextCallback, setGetNoteContextCallback, setOnTextInsertedCallback, useDictationStore } from '@/stores/dictationStore';
import { showGlobalToast } from '@/utils/toast-bridge';

const MonacoEditor = lazy(() => import('./MonacoEditor'));

interface EditorPanelProps {
  client: CoordinatorClient;
  onFileRenamed?: () => void;
  filePaths?: string[];
  focusModeEnabled?: boolean;
  onToggleFocusMode?: () => void;
  onNewNote?: () => void;
  onGoToFile?: () => void;
  onAddSelectionToChat?: (data: { path: string; selection: { startLine: number; startChar: number; endLine: number; endChar: number }; preview: string }) => void;
}

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};


function formatPasteTimestamp(date: Date): string {
  const pad2 = (value: number) => String(value).padStart(2, '0');
  const pad3 = (value: number) => String(value).padStart(3, '0');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} at ${pad2(date.getHours())}.${pad2(date.getMinutes())}.${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}`;
}

function resolveImageExtension(file: File): string {
  const type = file.type?.toLowerCase() ?? '';
  if (type && IMAGE_MIME_EXTENSIONS[type]) return IMAGE_MIME_EXTENSIONS[type];
  if (type.startsWith('image/')) {
    const raw = type.slice('image/'.length);
    if (raw === 'jpeg') return 'jpg';
    if (raw === 'svg+xml') return 'svg';
    if (raw === 'x-icon' || raw === 'vnd.microsoft.icon') return 'ico';
    if (raw.length > 0) return raw.replace(/\+.*/, '');
  }
  const name = file.name || '';
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase();
  }
  return 'png';
}

function buildPastedImageName(date: Date, index: number, extension: string): string {
  const suffix = index > 0 ? ` ${index + 1}` : '';
  return `Pasted on ${formatPasteTimestamp(date)}${suffix}.${extension}`;
}

function joinWorkspacePath(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\\/g, '/');
}


export function EditorPanel({
  client,
  onFileRenamed,
  filePaths,
  focusModeEnabled,
  onToggleFocusMode,
  onNewNote,
  onGoToFile,
  onAddSelectionToChat,
}: EditorPanelProps) {
  const workspacePath = useWorkspaceStore((s) => s.metadata?.projectPath ?? null);
  const projectName = useWorkspaceStore((s) => s.metadata?.projectName ?? null);
  const currentFile = useWorkspaceStore((s) => s.currentFile);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const preferences = useWorkspaceStore((s) => s.preferences);
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const markFileSaved = useWorkspaceStore((s) => s.markFileSaved);
  const setCurrentFile = useWorkspaceStore((s) => s.setCurrentFile);
  const openFile = useWorkspaceStore((s) => s.openFile);

  const historyRef = useRef<{ entries: string[]; index: number; navigating: boolean }>({
    entries: [],
    index: -1,
    navigating: false,
  });
  const [, forceUpdate] = useState(0);
  const autosaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const file = useWorkspaceStore.getState().currentFile;
      if (file) {
        scrollPositionsRef.current.set(file, container.scrollTop);
      }
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!currentFile) return;
    const container = editorContainerRef.current;
    if (!container) return;
    const target = scrollPositionsRef.current.get(currentFile) ?? 0;
    const id1 = requestAnimationFrame(() => {
      container.scrollTop = target;
    });
    let id3 = 0;
    const id2 = requestAnimationFrame(() => {
      id3 = requestAnimationFrame(() => {
        container.scrollTop = target;
      });
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
      cancelAnimationFrame(id3);
    };
  }, [currentFile]);

  useEffect(() => {
    const h = historyRef.current;
    if (!currentFile) return;
    if (h.navigating) {
      h.navigating = false;
      return;
    }
    const trimmed = h.entries.slice(0, h.index + 1);
    if (trimmed[trimmed.length - 1] !== currentFile) {
      trimmed.push(currentFile);
      h.entries = trimmed;
      h.index = trimmed.length - 1;
      forceUpdate(n => n + 1);
    }
  }, [currentFile]);

  const canGoBack = historyRef.current.index > 0;
  const canGoForward = historyRef.current.index < historyRef.current.entries.length - 1;
  const breadcrumb = useMemo(
    () => buildEditorBreadcrumb({ projectName, currentFile }),
    [projectName, currentFile]
  );

  const goBack = useCallback(() => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index--;
    h.navigating = true;
    setCurrentFile(h.entries[h.index]);
    forceUpdate(n => n + 1);
  }, [setCurrentFile]);

  const goForward = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.entries.length - 1) return;
    h.index++;
    h.navigating = true;
    setCurrentFile(h.entries[h.index]);
    forceUpdate(n => n + 1);
  }, [setCurrentFile]);

  const [showExportDialog, setShowExportDialog] = useState(false);

  useEffect(() => {
    historyRef.current = {
      entries: [],
      index: -1,
      navigating: false,
    };
    forceUpdate((n) => n + 1);
  }, [workspacePath]);

  const fileState = currentFile ? openFiles.get(currentFile) : null;

  useEffect(() => {
    if (preferences.autoSave) return;
    const timers = autosaveTimersRef.current;
    if (timers.size === 0) return;
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
  }, [preferences.autoSave]);

  useEffect(() => {
    return () => {
      const timers = autosaveTimersRef.current;
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);


  const handleChange = useCallback(
    (filePath: string, content: string) => {
      const file = useWorkspaceStore.getState().openFiles.get(filePath);
      if (!file) return;

      updateFileContent(filePath, content);

      if (
        preferences.autoSave &&
        !useDiffReviewStore.getState().reviewingFilePath &&
        /\.(md|markdown)$/i.test(filePath) &&
        content !== file.savedContent
      ) {
        const delay = Number.isFinite(preferences.autoSaveDelay)
          ? Math.max(0, preferences.autoSaveDelay)
          : 1000;
        const timers = autosaveTimersRef.current;
        const existingTimer = timers.get(filePath);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        const timeout = setTimeout(async () => {
          timers.delete(filePath);
          try {
            await client.saveFile(filePath, content);
            markFileSaved(filePath, content);
          } catch (err) {
            console.error('[EditorPanel] Autosave failed:', err);
          }
        }, delay);
        timers.set(filePath, timeout);
      }
    },
    [client, updateFileContent, markFileSaved, preferences.autoSave, preferences.autoSaveDelay]
  );

  const handleSave = useCallback(async (filePath: string) => {
    const file = useWorkspaceStore.getState().openFiles.get(filePath);
    if (!file) return;

    const timers = autosaveTimersRef.current;
    const pendingTimer = timers.get(filePath);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      timers.delete(filePath);
    }

    try {
      const contentToSave = file.content;
      await client.saveFile(filePath, contentToSave);
      markFileSaved(filePath, contentToSave);
    } catch (err) {
      console.error('[EditorPanel] Save failed:', err);
    }
  }, [client, markFileSaved]);


  const handlePasteImages = useCallback(
    ({ files, view, filePath }: { files: File[]; view: EditorView; filePath: string }) => {
      if (!files.length) return;

      const noteDir = filePath.split('/').slice(0, -1).join('/');
      const pasteFolder = joinWorkspacePath(noteDir, '.attachments');

      const selection = view.state.selection.main;
      const timestamp = new Date();
      const targets = files.map((file, index) => {
        const extension = resolveImageExtension(file);
        const filename = buildPastedImageName(timestamp, index, extension);
        const relativePath = joinWorkspacePath(pasteFolder, filename);
        return { file, relativePath };
      });

      const insertText = targets
        .map((target) => `![[${target.relativePath}]]`)
        .join('\n');

      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: insertText },
        selection: { anchor: selection.from + insertText.length },
      });

      void (async () => {
        try {
          await client.createFolder(pasteFolder);
        } catch (err) {
          console.error('[EditorPanel] Failed to create paste folder:', err);
        }

        for (const target of targets) {
          try {
            const data = new Uint8Array(await target.file.arrayBuffer());
            const base64 = uint8ArrayToBase64(data);
            await client.saveFileBase64(target.relativePath, base64);
          } catch (err) {
            console.error('[EditorPanel] Failed to save pasted image:', err);
            alert('Failed to save pasted image: ' + target.relativePath);
          }
        }
      })();
    },
    [client]
  );

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const searchPanelContainerRef = useRef<HTMLDivElement>(null);
  const diffAcceptAllRef = useRef<(() => void) | null>(null);
  const diffRejectAllRef = useRef<(() => void) | null>(null);
  const diffExitReviewRef = useRef<(() => void) | null>(null);
  const diffSaveRef = useRef<((filePath: string, content: string) => Promise<void>) | null>(null);
  const insertTextAtCursorRef = useRef<((text: string) => { from: number; to: number } | void) | null>(null);
  const getNoteContextRef = useRef<(() => string) | null>(null);
  const startEditTrackingRef = useRef<((originalText: string, from: number, to: number) => void) | null>(null);
  const clearEditTrackingRef = useRef<(() => void) | null>(null);
  const onDictationCorrectionRef = useRef<((original: string, edited: string) => void) | null>(null);
  const isReviewing = useDiffReviewStore((s) => s.reviewingFilePath === currentFile);

  useEffect(() => {
    diffSaveRef.current = async (fp: string, content: string) => {
      try {
        await client.saveFile(fp, content);
        markFileSaved(fp, content);
        const pendingTimer = autosaveTimersRef.current.get(fp);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          autosaveTimersRef.current.delete(fp);
        }
      } catch (err) {
        console.error('[EditorPanel] Diff save failed:', err);
      }
    };
    return () => { diffSaveRef.current = null; };
  }, [client, markFileSaved]);

  useEffect(() => {
    setInsertTextCallback((text) => insertTextAtCursorRef.current?.(text));
    setGetNoteContextCallback(() => getNoteContextRef.current?.() ?? '');
    setOnTextInsertedCallback((originalText, from, to) => {
      startEditTrackingRef.current?.(originalText, from, to);
    });
    return () => {
      setInsertTextCallback(null);
      setGetNoteContextCallback(null);
      setOnTextInsertedCallback(null);
    };
  }, []);

  useEffect(() => {
    onDictationCorrectionRef.current = async (original, edited) => {
      try {
        const result = await client.call('dictation/learn-correction', { original, edited });
        if (result.addedWords.length > 0) {
          const { dictionary } = useDictationStore.getState();
          const newDict = [...dictionary, ...result.addedWords.filter((w) => !dictionary.includes(w))];
          useDictationStore.setState({ dictionary: newDict });

          showGlobalToast({
            description: `Added "${result.addedWords.join('", "')}" to dictionary`,
            variant: 'success',
            duration: 6000,
            actions: [{
              label: 'Undo',
              onClick: () => {
                for (const word of result.addedWords) {
                  useDictationStore.getState().removeDictionaryWord(word);
                }
              },
            }],
          });
        }
      } catch (err) {
        console.error('[EditorPanel] Learn correction failed:', err);
      }
    };
    return () => {
      onDictationCorrectionRef.current = null;
    };
  }, [client]);

  useEffect(() => {
    clearEditTrackingRef.current?.();
  }, [currentFile]);

  const handleRename = useCallback(async (newName: string): Promise<boolean> => {
    if (!currentFile) return false;
    
    const pathParts = currentFile.split(/[/\\]/);
    const oldName = pathParts[pathParts.length - 1];
    const oldBaseName = oldName.includes('.') ? oldName.slice(0, oldName.lastIndexOf('.')) : oldName;
    const extension = oldName.includes('.') ? oldName.slice(oldName.lastIndexOf('.')) : '';
    
    if (newName === oldBaseName) return true;
    
    const newFileName = newName + extension;
    pathParts[pathParts.length - 1] = newFileName;
    const newPath = pathParts.join('/');
    
    try {
      const result = await client.renameFile(currentFile, newPath);
      if (result.success) {
        const store = useWorkspaceStore.getState();
        const fileState = store.openFiles.get(currentFile);
        
        if (fileState) {
          store.closeFile(currentFile);
          store.openFile(newPath, fileState.content);
          store.setCurrentFile(newPath);
        }
        
        onFileRenamed?.();
        
        return true;
      }
      return false;
    } catch (err) {
      console.error('[EditorPanel] Rename failed:', err);
      return false;
    }
  }, [currentFile, client, onFileRenamed]);

  const handleHeaderExit = useCallback(() => {
    editorContainerRef.current?.querySelector('.cm-content')?.dispatchEvent(
      new FocusEvent('focus', { bubbles: true })
    );
  }, []);

  const handleShare = useCallback(() => {
    if (!currentFile) return;
    setShowExportDialog(true);
  }, [currentFile]);

  const handleExportPdf = useCallback(async (options: PdfExportOptions) => {
    setShowExportDialog(false);
    if (!currentFile) return;
    const file = useWorkspaceStore.getState().openFiles.get(currentFile);
    if (!file) return;
    const pathParts = currentFile.split(/[/\\]/);
    const fileName = pathParts[pathParts.length - 1];
    const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
    await exportToPdf(file.content, baseName, options);
  }, [currentFile]);

  const handleWikiLinkNavigate: WikiLinkNavigateCallback = useCallback(
    async (href, resolvedPath, createIfMissing) => {
      if (resolvedPath) {
        try {
          if (BINARY_FILE_EXTENSIONS.test(resolvedPath)) {
            openFile(resolvedPath, '');
            return;
          }
          // Skip server fetch if the file is already open
          if (useWorkspaceStore.getState().openFiles.has(resolvedPath)) {
            openFile(resolvedPath, '');
            return;
          }
          const { content } = await client.readFile(resolvedPath);
          openFile(resolvedPath, content);
        } catch (err) {
          console.error('[EditorPanel] Failed to open wiki-link target:', err);
        }
      } else if (createIfMissing) {
        const newPath = buildNewFilePath(href);
        try {
          const initialContent = `# ${href.split('/').pop() || href}\n\n`;
          await client.saveFile(newPath, initialContent);
          openFile(newPath, initialContent);
          onFileRenamed?.();
        } catch (err) {
          console.error('[EditorPanel] Failed to create wiki-link target:', err);
        }
      }
    },
    [client, openFile, onFileRenamed]
  );

  const contextValue = useMemo(() => ({
    handleChange,
    handleSave,
    handlePasteImages,
    handleWikiLinkNavigate,
    filePaths,
    focusModeEnabled: focusModeEnabled ?? false,
    searchPanelContainerRef,
    onAddSelectionToChat,
    diffAcceptAllRef,
    diffRejectAllRef,
    diffExitReviewRef,
    diffSaveRef,
    insertTextAtCursorRef,
    getNoteContextRef,
    startEditTrackingRef,
    clearEditTrackingRef,
    onDictationCorrectionRef,
  }), [handleChange, handleSave, handlePasteImages, handleWikiLinkNavigate, filePaths, focusModeEnabled, onAddSelectionToChat]);

  return (
    <EditorPanelProvider value={contextValue}>
    <div className="flex flex-col w-full h-full bg-background">
      {!focusModeEnabled && (
          <EditorNavRow
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={goBack}
            onGoForward={goForward}
            focusModeEnabled={focusModeEnabled}
            onToggleFocusMode={onToggleFocusMode}
            onShare={handleShare}
            segments={breadcrumb.segments}
            centerTitle={breadcrumb.title}
          />
      )}

      <div ref={searchPanelContainerRef} className="flex-shrink-0" />

      {isReviewing && (
        <DiffReviewBar
          onAcceptAll={() => diffAcceptAllRef.current?.()}
          onRejectAll={() => diffRejectAllRef.current?.()}
          onExitReview={() => diffExitReviewRef.current?.()}
        />
      )}

      <div
        className="relative flex-1 min-h-0 min-w-0 overflow-auto rounded-tl-lg thin-scrollbar"
        ref={editorContainerRef}
        data-editor-scroll-container
        style={{ background: 'var(--md-bg, var(--background))' }}
      >
        <RecordingOverlay />
        {Array.from(openFiles.entries()).map(([fp]) => {
          const isActive = fp === currentFile;
          const resolved = getViewForFile(fp);
          const isMarkdown = /\.(md|markdown)$/i.test(fp);

          if (resolved) {
            return (
              <div key={fp} style={{ display: isActive ? undefined : 'none', height: isActive ? '100%' : undefined }} className={isActive ? 'contents' : undefined}>
                <resolved.component filePath={fp} />
              </div>
            );
          }

          if (isMarkdown) {
            return (
              <div key={fp} style={{ display: isActive ? undefined : 'none' }} className="contents">
                {isActive && (
                  <FileHeader filePath={fp} editable onRename={handleRename} onExit={handleHeaderExit} showExtension={false} />
                )}
                <CodeEditor filePath={fp} hidden={!isActive} />
              </div>
            );
          }

          if (isActive) {
            return (
              <div key={fp} className="contents">
                <Suspense fallback={<div className="flex-1" />}>
                  <MonacoEditor filePath={fp} />
                </Suspense>
              </div>
            );
          }

          return null;
        })}

        {(!currentFile || (currentFile && !fileState && !getViewForFile(currentFile))) && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sm">
            <button
              onClick={onNewNote}
              className="text-accent hover:underline cursor-pointer"
            >
              Create new note (Ctrl + N)
            </button>
            <button
              onClick={onGoToFile}
              className="text-accent hover:underline cursor-pointer"
            >
              Go to file (Ctrl + O)
            </button>
            {currentFile === '__new_tab__' && (
              <button
                onClick={() => {
                  const store = useWorkspaceStore.getState();
                  const tab = store.tabs.find(
                    (t) => t.filePath === '__new_tab__' && t.isActive
                  );
                  if (tab) {
                    store.removeTab(tab.id);
                    const remaining = useWorkspaceStore.getState().tabs;
                    if (remaining.length > 0) {
                      store.setActiveTab(remaining[remaining.length - 1].id);
                    } else {
                      store.setCurrentFile(null);
                    }
                  }
                }}
                className="text-accent hover:underline cursor-pointer"
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>

      <ExportOptionsDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExport={handleExportPdf}
      />
    </div>
    </EditorPanelProvider>
  );
}
