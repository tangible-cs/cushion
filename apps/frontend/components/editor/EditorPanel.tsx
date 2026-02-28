'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { CodeEditor } from './CodeEditor';
import { EditorTabs } from './EditorTabs';
import { PdfViewerNative as PdfViewer } from './PdfViewerNative';
import { ImageViewer } from './ImageViewer';
import { FileHeader } from './FileHeader';
import { buildNewFilePath } from '@/lib/wiki-link-resolver';
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight, Share2, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uint8ArrayToBase64 } from '@/lib/pdf-bytes';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type { FileTreeNode } from '@cushion/types';
import type { EditorView } from '@codemirror/view';
import type { WikiLinkNavigateCallback, EmbedResolver, EmbedResolverResult } from '@/lib/codemirror-wysiwyg';

interface EditorPanelProps {
  client: CoordinatorClient;
  onFileRenamed?: () => void;
  fileTree?: FileTreeNode[];
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  onOpenChat?: () => void;
  focusModeEnabled?: boolean;
  onToggleFocusMode?: () => void;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
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
  fileTree,
  sidebarCollapsed,
  onExpandSidebar,
  onOpenChat,
  focusModeEnabled,
  onToggleFocusMode,
  rightPanelOpen,
  onToggleRightPanel,
}: EditorPanelProps) {
  const workspacePath = useWorkspaceStore((s) => s.metadata?.projectPath ?? null);
  const currentFile = useWorkspaceStore((s) => s.currentFile);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const preferences = useWorkspaceStore((s) => s.preferences);
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const markFileSaved = useWorkspaceStore((s) => s.markFileSaved);
  const setCurrentFile = useWorkspaceStore((s) => s.setCurrentFile);
  const closeFile = useWorkspaceStore((s) => s.closeFile);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
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
  const [pdfData, setPdfData] = useState<{ filePath: string; base64: string } | null>(null);
  const [imageData, setImageData] = useState<{ filePath: string; base64: string; mimeType: string } | null>(null);
  const embedCacheRef = useRef(new Map<string, Promise<EmbedResolverResult | null>>());

  useEffect(() => {
    historyRef.current = {
      entries: [],
      index: -1,
      navigating: false,
    };
    openedUrisRef.current.clear();
    embedCacheRef.current.clear();
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
    let cancelled = false;
    client.readFileBase64(currentFile).then((result) => {
      if (!cancelled) setPdfData({ filePath: currentFile, base64: result.base64 });
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


  const handleEmbedResolve = useCallback<EmbedResolver>(async (path, options) => {
    const hint = options?.hint ?? 'binary';
    const cacheKey = `${hint}:${path}`;
    const cached = embedCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const promise = (async () => {
      try {
        if (hint === 'text') {
          const { content } = await client.readFile(path);
          return { type: 'text', text: content } as const;
        }
        const { base64, mimeType } = await client.readFileBase64(path);
        return { type: 'binary', dataUrl: `data:${mimeType};base64,${base64}`, mimeType } as const;
      } catch (err) {
        console.error('[EditorPanel] Embed resolve failed:', err);
        return null;
      }
    })();

    embedCacheRef.current.set(cacheKey, promise);
    return promise;
  }, [client]);

  const handlePasteImages = useCallback(
    ({ files, view, filePath }: { files: File[]; view: EditorView; filePath: string }) => {
      if (!files.length) return;

      const noteDir = filePath.split('/').slice(0, -1).join('/');
      const pasteFolder = joinWorkspacePath(noteDir, '.cushion', 'images');

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

  const handleSelectTab = useCallback(
    (filePath: string) => {
      const tab = tabs.find((t) => t.filePath === filePath);
      if (tab) {
        setActiveTab(tab.id);
      } else {
        setCurrentFile(filePath);
      }
    },
    [tabs, setActiveTab, setCurrentFile]
  );

  const handleCloseTab = useCallback(
    (filePath: string) => {
      openedUrisRef.current.delete(filePath);
      closeFile(filePath);

      const remaining = useWorkspaceStore.getState().tabs;
      if (remaining.length > 0) {
        setCurrentFile(remaining[0].filePath);
      } else {
        setCurrentFile(null);
      }
    },
    [closeFile, setCurrentFile]
  );

  const editorContainerRef = useRef<HTMLDivElement>(null);

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


  const handleWikiLinkNavigate: WikiLinkNavigateCallback = useCallback(
    async (href, resolvedPath, createIfMissing) => {
      if (resolvedPath) {
        try {
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
      {/* Top bar: sidebar toggle, nav arrows, tabs */}
      {!focusModeEnabled && (
        <div className="flex items-center bg-background min-h-[40px] flex-shrink-0">
          {/* Sidebar toggle button (Affine-style) */}
          {sidebarCollapsed && (
            <button
              onClick={onExpandSidebar}
              className={cn(
                "h-8 w-8 rounded flex-shrink-0 flex items-center justify-center",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-muted/40",
                "transition-colors duration-150"
              )}
              title="Open sidebar"
            >
              <PanelLeft size={16} />
            </button>
          )}

          {/* Back / Forward navigation */}
          <div className="flex items-center flex-shrink-0">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              className={cn(
                "h-8 w-8 rounded flex items-center justify-center transition-colors duration-150",
                canGoBack
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/30 cursor-default"
              )}
              title="Go back"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              className={cn(
                "h-8 w-8 rounded flex items-center justify-center transition-colors duration-150",
                canGoForward
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/30 cursor-default"
              )}
              title="Go forward"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Tabs */}
          {tabs.length > 0 && (
            <EditorTabs
              tabs={tabs}
              currentFile={currentFile}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
            />
          )}

          <div className="ml-auto mr-2 flex items-center gap-1">
            {onToggleFocusMode && (
              <button
                onClick={onToggleFocusMode}
                className={cn(
                  "h-8 w-8 flex-shrink-0 flex items-center justify-center rounded",
                  focusModeEnabled ? "text-foreground" : "text-muted-foreground",
                  "hover:text-foreground",
                  focusModeEnabled
                    ? "bg-muted/40"
                    : "hover:bg-muted/40",
                  "transition-colors duration-150"
                )}
                title={focusModeEnabled ? "Exit focus mode" : "Enter focus mode"}
                aria-pressed={!!focusModeEnabled}
              >
                <Target size={16} />
              </button>
            )}
            {/* Share */}
            <button
              className={cn(
                "h-8 w-8 flex-shrink-0 flex items-center justify-center rounded",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-muted/40",
                "transition-colors duration-150"
              )}
              title="Share"
            >
              <Share2 size={16} />
            </button>
            {onToggleRightPanel && (
              <button
                onClick={onToggleRightPanel}
                className={cn(
                  "h-8 w-8 flex-shrink-0 flex items-center justify-center rounded",
                  rightPanelOpen ? "text-foreground" : "text-muted-foreground",
                  "hover:text-foreground",
                  "hover:bg-muted/40",
                  "transition-colors duration-150"
                )}
                title={rightPanelOpen ? "Close right sidebar" : "Open right sidebar"}
                aria-label={rightPanelOpen ? "Close right sidebar" : "Open right sidebar"}
                aria-pressed={!!rightPanelOpen}
              >
                <PanelRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Editor content with rounded top corners */}
      <div
        className="flex-1 min-h-0 min-w-0 overflow-auto rounded-tl-lg thin-scrollbar"
        ref={editorContainerRef}
        data-editor-scroll-container
        style={{ background: 'var(--md-bg, var(--background))' }}
      >
        {isPdf && pdfData ? (
          <PdfViewer
            filePath={currentFile!}
            base64Data={pdfData.base64}
            onSave={async (data: Uint8Array) => {
              try {
                let binary = '';
                for (let i = 0; i < data.length; i++) {
                  binary += String.fromCharCode(data[i]);
                }
                const base64 = btoa(binary);
                await client.saveFileBase64(currentFile!, base64);
                setPdfData({ filePath: currentFile!, base64 });
              } catch (err) {
                console.error('[EditorPanel] PDF save failed:', err);
                alert('Failed to save PDF: ' + (err instanceof Error ? err.message : 'Unknown error'));
              }
            }}
          />
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
              embedResolver={handleEmbedResolve}
              onPasteImages={handlePasteImages}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Open a file from the sidebar
          </div>
        )}
      </div>
    </div>
  );
}
