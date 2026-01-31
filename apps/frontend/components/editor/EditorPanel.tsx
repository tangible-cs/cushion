'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { CodeEditor, type SelectionInfo } from './CodeEditor';
import { useChatStore } from '@/stores/chatStore';
import { EditorTabs } from './EditorTabs';
import { PdfViewerNative as PdfViewer } from './PdfViewerNative';
import { FileHeader } from './FileHeader';
import { buildNewFilePath } from '@/lib/wiki-link-resolver';
import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type { FileTreeNode } from '@cushion/types';
import type { WikiLinkNavigateCallback } from '@/lib/codemirror-wysiwyg';

interface EditorPanelProps {
  client: CoordinatorClient;
  /** Called after a file is successfully renamed (so file browser can refresh) */
  onFileRenamed?: () => void;
  /** File tree for wiki-link resolution */
  fileTree?: FileTreeNode[];
  /** Whether the sidebar is collapsed */
  sidebarCollapsed?: boolean;
  /** Called to expand the sidebar */
  onExpandSidebar?: () => void;
  /** Open the chat sidebar */
  onOpenChat?: () => void;
}

export function EditorPanel({
  client,
  onFileRenamed,
  fileTree,
  sidebarCollapsed,
  onExpandSidebar,
  onOpenChat,
}: EditorPanelProps) {
  const currentFile = useWorkspaceStore((s) => s.currentFile);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const markFileSaved = useWorkspaceStore((s) => s.markFileSaved);
  const setCurrentFile = useWorkspaceStore((s) => s.setCurrentFile);
  const closeFile = useWorkspaceStore((s) => s.closeFile);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const openFile = useWorkspaceStore((s) => s.openFile);
  const addContextItem = useChatStore((s) => s.addContextItem);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);

  // Tab navigation history (using ref to avoid stale closure issues)
  const historyRef = useRef<{ entries: string[]; index: number; navigating: boolean }>({
    entries: [],
    index: -1,
    navigating: false,
  });
  const [, forceUpdate] = useState(0);

  // Track tab switches in history
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

  // Track which files we've already sent didOpen for
  const openedUrisRef = useRef<Set<string>>(new Set());
  const [pdfData, setPdfData] = useState<{ filePath: string; base64: string } | null>(null);

  const fileState = currentFile ? openFiles.get(currentFile) : null;
  const isPdf = currentFile?.toLowerCase().endsWith('.pdf') ?? false;

  // Load PDF binary data when a PDF file is selected
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

  // Send didOpen if not already sent for this file
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
    },
    [currentFile, client, updateFileContent]
  );

  const handleSave = useCallback(async () => {
    if (!currentFile) return;
    const file = useWorkspaceStore.getState().openFiles.get(currentFile);
    if (!file) return;

    try {
      await client.saveFile(currentFile, file.content);
      markFileSaved(currentFile, file.content);
    } catch (err) {
      console.error('[EditorPanel] Save failed:', err);
    }
  }, [currentFile, client, markFileSaved]);

  const handleSelectionChange = useCallback((next: SelectionInfo | null) => {
    setSelection(next);
  }, []);

  useEffect(() => {
    setSelection(null);
  }, [currentFile]);

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

      // Pick next file
      const remaining = useWorkspaceStore.getState().tabs;
      if (remaining.length > 0) {
        setCurrentFile(remaining[0].filePath);
      } else {
        setCurrentFile(null);
      }
    },
    [closeFile, setCurrentFile]
  );

  // Reference to the CodeEditor for focus management
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Handle file rename from the header
  const handleRename = useCallback(async (newName: string): Promise<boolean> => {
    if (!currentFile) return false;
    
    // Build the new path by replacing the filename
    const pathParts = currentFile.split(/[/\\]/);
    const oldName = pathParts[pathParts.length - 1];
    const oldBaseName = oldName.includes('.') ? oldName.slice(0, oldName.lastIndexOf('.')) : oldName;
    const extension = oldName.includes('.') ? oldName.slice(oldName.lastIndexOf('.')) : '';
    
    // Don't rename if name hasn't changed
    if (newName === oldBaseName) return true;
    
    // Build new filename (preserve extension)
    const newFileName = newName + extension;
    pathParts[pathParts.length - 1] = newFileName;
    const newPath = pathParts.join('/');
    
    try {
      const result = await client.renameFile(currentFile, newPath);
      if (result.success) {
        // Update the store with the new path
        const store = useWorkspaceStore.getState();
        const fileState = store.openFiles.get(currentFile);
        
        if (fileState) {
          // Close old file and open with new path
          store.closeFile(currentFile);
          store.openFile(newPath, fileState.content);
          store.setCurrentFile(newPath);
          
          // Update the opened URIs tracking
          openedUrisRef.current.delete(currentFile);
        }
        
        // Notify parent to refresh file browser (like Tangent's TreeChange event)
        onFileRenamed?.();
        
        return true;
      }
      return false;
    } catch (err) {
      console.error('[EditorPanel] Rename failed:', err);
      return false;
    }
  }, [currentFile, client, onFileRenamed]);

  // Handle exiting the header (focus the editor)
  const handleHeaderExit = useCallback(() => {
    // Focus the editor container - CodeMirror will handle focusing itself
    editorContainerRef.current?.querySelector('.cm-content')?.dispatchEvent(
      new FocusEvent('focus', { bubbles: true })
    );
  }, []);

  const handleAskSelection = useCallback(() => {
    if (!currentFile || !selection) return;
    addContextItem({
      path: currentFile,
      selection: {
        startLine: selection.startLine,
        startChar: selection.startChar,
        endLine: selection.endLine,
        endChar: selection.endChar,
      },
      preview: selection.text,
    });
    onOpenChat?.();
  }, [addContextItem, currentFile, selection, onOpenChat]);

  // Handle wiki-link navigation (click on [[link]])
  const handleWikiLinkNavigate: WikiLinkNavigateCallback = useCallback(
    async (href, resolvedPath, createIfMissing) => {
      console.log('[EditorPanel] Wiki-link navigate called:', { href, resolvedPath, createIfMissing });
      
      if (resolvedPath) {
        // File exists - open it
        console.log('[EditorPanel] Opening existing file:', resolvedPath);
        try {
          const { content } = await client.readFile(resolvedPath);
          openFile(resolvedPath, content);
          console.log('[EditorPanel] File opened successfully');
        } catch (err) {
          console.error('[EditorPanel] Failed to open wiki-link target:', err);
        }
      } else if (createIfMissing) {
        // File doesn't exist - create it (like Tangent does)
        const newPath = buildNewFilePath(href);
        console.log('[EditorPanel] Creating new file:', newPath);
        try {
          // Create empty file with just the title as H1
          const initialContent = `# ${href.split('/').pop() || href}\n\n`;
          await client.saveFile(newPath, initialContent);
          console.log('[EditorPanel] File saved, now opening');
          openFile(newPath, initialContent);
          // Refresh file browser to show new file
          onFileRenamed?.();
          console.log('[EditorPanel] New file created and opened');
        } catch (err) {
          console.error('[EditorPanel] Failed to create wiki-link target:', err);
        }
      } else {
        console.log('[EditorPanel] No action taken (resolvedPath null and createIfMissing false)');
      }
    },
    [client, openFile, onFileRenamed]
  );

  return (
    <div className="flex flex-col w-full h-full bg-sidebar-bg">
      {/* Top bar: sidebar toggle, nav arrows, tabs */}
      <div className="flex items-center bg-sidebar-bg min-h-[40px] flex-shrink-0">
        {/* Sidebar toggle button (Affine-style) */}
        {sidebarCollapsed && (
          <button
            onClick={onExpandSidebar}
            className={cn(
              "h-10 w-10 flex-shrink-0 flex items-center justify-center",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
              "transition-colors duration-150"
            )}
            title="Open sidebar"
          >
            <PanelLeft size={18} />
          </button>
        )}

        {/* Back / Forward navigation */}
        <div className="flex items-center flex-shrink-0">
          <button
            onClick={goBack}
            disabled={!canGoBack}
            className={cn(
              "h-10 w-8 flex items-center justify-center transition-colors duration-150",
              canGoBack
                ? "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/30 cursor-default"
            )}
            title="Go back"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goForward}
            disabled={!canGoForward}
            className={cn(
              "h-10 w-8 flex items-center justify-center transition-colors duration-150",
              canGoForward
                ? "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/30 cursor-default"
            )}
            title="Go forward"
          >
            <ChevronRight size={18} />
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

        {/* Share */}
        <button
          className={cn(
            "ml-auto mr-2 h-7 w-7 flex-shrink-0 flex items-center justify-center rounded",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
            "transition-colors duration-150"
          )}
          title="Share"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 3.5H4.5C3.67157 3.5 3 4.17157 3 5V12C3 12.8284 3.67157 13.5 4.5 13.5H11.5C12.3284 13.5 13 12.8284 13 12V5C13 4.17157 12.3284 3.5 11.5 3.5H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M8 1.5V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M5.5 4L8 1.5L10.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Editor content with rounded top corners */}
      <div
        className="flex-1 min-h-0 overflow-auto rounded-tl-lg"
        ref={editorContainerRef}
        style={{ background: 'var(--md-bg, var(--background))' }}
      >
        {isPdf && pdfData ? (
          <PdfViewer
            filePath={currentFile!}
            base64Data={pdfData.base64}
            onSave={async (data: Uint8Array) => {
              try {
                // Convert Uint8Array to base64
                let binary = '';
                for (let i = 0; i < data.length; i++) {
                  binary += String.fromCharCode(data[i]);
                }
                const base64 = btoa(binary);
                await client.saveFileBase64(currentFile!, base64);
                // Update cached PDF data so re-renders use saved version
                setPdfData({ filePath: currentFile!, base64 });
              } catch (err) {
                console.error('[EditorPanel] PDF save failed:', err);
                alert('Failed to save PDF: ' + (err instanceof Error ? err.message : 'Unknown error'));
              }
            }}
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
            {selection && selection.text.trim().length > 0 && (
              <div
                className="flex items-center justify-end px-5 pb-2"
                style={{
                  maxWidth: 'var(--md-content-max-width, 900px)',
                  margin: '0 auto',
                }}
              >
                <button
                  type="button"
                  onClick={handleAskSelection}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Ask AI about selection
                </button>
              </div>
            )}
            {/* Editor */}
            <CodeEditor
              filePath={currentFile}
              content={fileState.content}
              language={fileState.language}
              onChange={handleChange}
              onSave={handleSave}
              onSelectionChange={handleSelectionChange}
              fileTree={fileTree}
              onWikiLinkNavigate={handleWikiLinkNavigate}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            Open a file from the sidebar
          </div>
        )}
      </div>
    </div>
  );
}
