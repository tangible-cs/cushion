
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { CodeEditor } from './CodeEditor';
import { EditorNavRow } from './EditorNavRow';
import { buildEditorBreadcrumb } from './editor-path';
import { PdfViewerNative as PdfViewer } from './PdfViewerNative';
import { ImageViewer } from './ImageViewer';
import { FileHeader } from './FileHeader';
import { buildNewFilePath } from '@/lib/wiki-link-resolver';
import { uint8ArrayToBase64 } from '@/lib/pdf-bytes';
import { isPdfProgressiveLoadingEnabled } from '@/lib/pdf-feature-flags';
import {
  createPdfTelemetrySession,
  pdfTelemetryNow,
  type PdfTelemetrySession,
} from '@/lib/pdf-telemetry';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type { FileTreeNode } from '@cushion/types';
import type { EditorView } from '@codemirror/view';
import type { WikiLinkNavigateCallback } from '@/lib/codemirror-wysiwyg';

interface EditorPanelProps {
  client: CoordinatorClient;
  onFileRenamed?: () => void;
  fileTree?: FileTreeNode[];
  focusModeEnabled?: boolean;
  onToggleFocusMode?: () => void;
  onNewNote?: () => void;
  onGoToFile?: () => void;
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

const BINARY_WIKI_LINK_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf)$/i;


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

type PdfDataState =
  | {
      mode: 'base64';
      filePath: string;
      base64: string;
      telemetrySession: PdfTelemetrySession | null;
    }
  | {
      mode: 'progressive';
      filePath: string;
      telemetrySession: null;
    };

const PDF_RANGE_CHUNK_SIZE = 256 * 1024;

const pdfProgressiveLoadingEnabled = isPdfProgressiveLoadingEnabled();

export function EditorPanel({
  client,
  onFileRenamed,
  fileTree,
  focusModeEnabled,
  onToggleFocusMode,
  onNewNote,
  onGoToFile,
}: EditorPanelProps) {
  const workspacePath = useWorkspaceStore((s) => s.metadata?.projectPath ?? null);
  const projectName = useWorkspaceStore((s) => s.metadata?.projectName ?? null);
  const currentFile = useWorkspaceStore((s) => s.currentFile);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const preferences = useWorkspaceStore((s) => s.preferences);
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const markFileSaved = useWorkspaceStore((s) => s.markFileSaved);
  const setCurrentFile = useWorkspaceStore((s) => s.setCurrentFile);
  const closeFile = useWorkspaceStore((s) => s.closeFile);
  const openFile = useWorkspaceStore((s) => s.openFile);

  const historyRef = useRef<{ entries: string[]; index: number; navigating: boolean }>({
    entries: [],
    index: -1,
    navigating: false,
  });
  const [, forceUpdate] = useState(0);
  const autosaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  const openedUrisRef = useRef<Set<string>>(new Set());
  const [pdfData, setPdfData] = useState<PdfDataState | null>(null);
  const [imageData, setImageData] = useState<{ filePath: string; base64: string; mimeType: string } | null>(null);

  useEffect(() => {
    historyRef.current = {
      entries: [],
      index: -1,
      navigating: false,
    };
    openedUrisRef.current.clear();
    setPdfData(null);
    setImageData(null);
    forceUpdate((n) => n + 1);
  }, [workspacePath]);

  const fileState = currentFile ? openFiles.get(currentFile) : null;
  const isPdf = currentFile?.toLowerCase().endsWith('.pdf') ?? false;
  const imageExtensions = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;
  const isImage = imageExtensions.test(currentFile ?? '');

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

  useEffect(() => {
    if (!isPdf || !currentFile) {
      setPdfData(null);
      return;
    }

    if (pdfProgressiveLoadingEnabled) {
      setPdfData({
        mode: 'progressive',
        filePath: currentFile,
        telemetrySession: null,
      });
      return;
    }

    let cancelled = false;
    const readStartedAtMs = pdfTelemetryNow();
    client.readFileBase64(currentFile).then((result) => {
      if (cancelled) return;

      const telemetrySession = createPdfTelemetrySession({
        filePath: currentFile,
        base64Data: result.base64,
        fileReadDurationMs: pdfTelemetryNow() - readStartedAtMs,
      });

      setPdfData({
        mode: 'base64',
        filePath: currentFile,
        base64: result.base64,
        telemetrySession,
      });
    }).catch((err) => {
      console.error('[EditorPanel] Failed to load PDF:', err);
    });
    return () => { cancelled = true; };
  }, [isPdf, currentFile, client]);

  useEffect(() => {
    if (!isImage || !currentFile) {
      setImageData(null);
      return;
    }
    let cancelled = false;
    client.readFileBase64(currentFile).then((result) => {
      if (!cancelled) setImageData({ filePath: currentFile, base64: result.base64, mimeType: result.mimeType });
    }).catch((err) => {
      console.error('[EditorPanel] Failed to load image:', err);
    });
    return () => { cancelled = true; };
  }, [isImage, currentFile, client]);

  if (fileState && currentFile && !openedUrisRef.current.has(currentFile)) {
    openedUrisRef.current.add(currentFile);
    try {
      client.didOpen({
        textDocument: {
          uri: `file://${fileState.absolutePath}`,
          languageId: fileState.language || 'plaintext',
          version: fileState.version,
          text: fileState.content,
        },
      });
    } catch {
      // Client may not be connected yet
    }
  }

  const handleChange = useCallback(
    (content: string) => {
      if (!currentFile) return;
      const file = useWorkspaceStore.getState().openFiles.get(currentFile);
      if (!file) return;

      updateFileContent(currentFile, content);

      try {
        client.didChange({
          textDocument: {
            uri: `file://${file.absolutePath}`,
            version: file.version + 1,
          },
          contentChanges: [{ text: content }],
        });
      } catch {
        // Client may not be connected
      }

      if (
        preferences.autoSave &&
        /\.(md|markdown)$/i.test(currentFile) &&
        content !== file.savedContent
      ) {
        const delay = Number.isFinite(preferences.autoSaveDelay)
          ? Math.max(0, preferences.autoSaveDelay)
          : 1000;
        const timers = autosaveTimersRef.current;
        const existingTimer = timers.get(currentFile);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        const timeout = setTimeout(async () => {
          timers.delete(currentFile);
          try {
            await client.saveFile(currentFile, content);
            markFileSaved(currentFile, content);
          } catch (err) {
            console.error('[EditorPanel] Autosave failed:', err);
          }
        }, delay);
        timers.set(currentFile, timeout);
      }
    },
    [currentFile, client, updateFileContent, markFileSaved, preferences.autoSave, preferences.autoSaveDelay]
  );

  const handleSave = useCallback(async () => {
    if (!currentFile) return;
    const file = useWorkspaceStore.getState().openFiles.get(currentFile);
    if (!file) return;

    const timers = autosaveTimersRef.current;
    const pendingTimer = timers.get(currentFile);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      timers.delete(currentFile);
    }

    try {
      const contentToSave = file.content;
      await client.saveFile(currentFile, contentToSave);
      markFileSaved(currentFile, contentToSave);
    } catch (err) {
      console.error('[EditorPanel] Save failed:', err);
    }
  }, [currentFile, client, markFileSaved]);


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
          
          openedUrisRef.current.delete(currentFile);
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

  const pdfFilePath = pdfData?.filePath ?? currentFile ?? null;

  const readPdfChunk = useCallback(
    async (offset: number, length: number) => {
      if (!pdfFilePath) {
        throw new Error('No PDF file selected');
      }

      return client.readFileBase64Chunk(pdfFilePath, offset, length);
    },
    [client, pdfFilePath]
  );

  const readPdfBase64 = useCallback(async () => {
    if (!pdfFilePath) {
      throw new Error('No PDF file selected');
    }

    const result = await client.readFileBase64(pdfFilePath);
    return result.base64;
  }, [client, pdfFilePath]);


  const handleWikiLinkNavigate: WikiLinkNavigateCallback = useCallback(
    async (href, resolvedPath, createIfMissing) => {
      if (resolvedPath) {
        try {
          if (BINARY_WIKI_LINK_EXTENSIONS.test(resolvedPath)) {
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

  return (
    <div className="flex flex-col w-full h-full bg-background">
      {/* Header rows */}
      {!focusModeEnabled && (
        <>
          <EditorNavRow
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={goBack}
            onGoForward={goForward}
            focusModeEnabled={focusModeEnabled}
            onToggleFocusMode={onToggleFocusMode}
            centerContent={breadcrumb.text}
            centerTitle={breadcrumb.title}
          />
        </>
      )}

      <div ref={searchPanelContainerRef} className="flex-shrink-0" />

      {/* Editor content with rounded top corners */}
      <div
        className="flex-1 min-h-0 min-w-0 overflow-auto rounded-tl-lg thin-scrollbar"
        ref={editorContainerRef}
        data-editor-scroll-container
        style={{ background: 'var(--md-bg, var(--background))' }}
      >
        {isPdf && !pdfData ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">Loading PDF…</div>
        ) : isPdf && pdfData ? (
          <PdfViewer
            filePath={pdfData.filePath}
            base64Data={pdfData.mode === 'base64' ? pdfData.base64 : undefined}
            telemetrySession={pdfData.telemetrySession}
            progressiveLoading={pdfData.mode === 'progressive' ? {
              readChunk: readPdfChunk,
              rangeChunkSize: PDF_RANGE_CHUNK_SIZE,
            } : null}
            readOriginalBase64={readPdfBase64}
            onSave={async (data: Uint8Array) => {
              const activeFile = pdfData.filePath;

              try {
                const base64 = uint8ArrayToBase64(data);
                await client.saveFileBase64(activeFile, base64);
              } catch (err) {
                console.error('[EditorPanel] PDF save failed:', err);
                alert('Failed to save PDF: ' + (err instanceof Error ? err.message : 'Unknown error'));
              }
            }}
          />
        ) : isImage && !imageData ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">Loading image…</div>
        ) : isImage && imageData ? (
          <ImageViewer
            filePath={currentFile!}
            base64Data={imageData.base64}
            mimeType={imageData.mimeType}
          />
        ) : fileState && currentFile ? (
          <>
            {/* File title header */}
            <FileHeader
              filePath={currentFile}
              editable={true}
              onRename={handleRename}
              onExit={handleHeaderExit}
              showExtension={!/\.(md|markdown)$/i.test(currentFile)}
            />
            {/* Editor */}
            <CodeEditor
              filePath={currentFile}
              content={fileState.content}
              language={fileState.language}
              onChange={handleChange}
              onSave={handleSave}
              focusModeEnabled={focusModeEnabled}
              fileTree={fileTree}
              onWikiLinkNavigate={handleWikiLinkNavigate}
              onPasteImages={handlePasteImages}
              searchPanelContainerRef={searchPanelContainerRef}
            />
          </>
        ) : (
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
    </div>
  );
}
