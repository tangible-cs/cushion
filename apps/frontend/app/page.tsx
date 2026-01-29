'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TerminalSquare, Link2, GitBranch } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { FileBrowser, FileBrowserHandle } from '@/components/workspace/FileBrowser';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { EditorPanel } from '@/components/editor/EditorPanel';
import { BacklinksPanel } from '@/components/editor/BacklinksPanel';
import { GraphView } from '@/components/graph/GraphView';
import { QuickSwitcher } from '@/components/quick-switcher';
import { buildLinkIndex, type LinkIndex } from '@/lib/link-index';
import { flattenFileTree } from '@/lib/wiki-link-resolver';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type { FileTreeNode } from '@cushion/types';

export default function Home() {
  const { metadata, openFile, setClient, currentFile, openWorkspace, recentProjects } = useWorkspaceStore();
  const [client, setClientLocal] = useState<CoordinatorClient | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [linkIndex, setLinkIndex] = useState<LinkIndex | null>(null);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const fileBrowserRef = useRef<FileBrowserHandle>(null);
  const autoOpenAttempted = useRef(false);

  // Connect to coordinator on mount
  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const shared = await getSharedCoordinatorClient();
        if (!cancelled) {
          setClientLocal(shared);
          setClient(shared);
        }
      } catch (err) {
        console.error('[Page] Failed to connect to coordinator:', err);
      }
    }

    connect();
    return () => {
      cancelled = true;
    };
  }, [setClient]);

  // Auto-open most recent workspace if available
  useEffect(() => {
    if (!client || metadata || autoOpenAttempted.current) {
      return;
    }

    autoOpenAttempted.current = true;

    if (recentProjects.length === 0) {
      setShowWorkspaceModal(true);
      return;
    }

    const [mostRecent] = recentProjects;

    openWorkspace(mostRecent.projectPath)
      .then(() => {
        const hasWorkspace = !!useWorkspaceStore.getState().metadata;
        setShowWorkspaceModal(!hasWorkspace);
      })
      .catch(() => {
        setShowWorkspaceModal(true);
      });
  }, [client, metadata, openWorkspace, recentProjects]);

  useEffect(() => {
    if (metadata) {
      setShowWorkspaceModal(false);
    }
  }, [metadata]);

  // Fetch file tree when workspace opens (for wiki-link resolution)
  const fetchFileTree = useCallback(async () => {
    if (!client || !metadata) {
      setFileTree([]);
      return;
    }
    try {
      const { files } = await client.listFiles('.');
      setFileTree(files);
    } catch (err) {
      console.error('[Page] Failed to fetch file tree:', err);
    }
  }, [client, metadata]);

  useEffect(() => {
    fetchFileTree();
  }, [fetchFileTree]);

  // Build link index from all markdown files
  const buildIndex = useCallback(async () => {
    if (!client || !metadata || fileTree.length === 0) {
      setLinkIndex(null);
      return;
    }
    
    try {
      // Get all markdown files
      const allFiles = flattenFileTree(fileTree);
      const mdFiles = allFiles.filter(f => f.toLowerCase().endsWith('.md'));
      
      // Read content of each markdown file
      const fileContents = new Map<string, string>();
      
      await Promise.all(
        mdFiles.map(async (filePath) => {
          try {
            const { content } = await client.readFile(filePath);
            fileContents.set(filePath, content);
          } catch (err) {
            // Skip files that can't be read
            console.warn(`[Page] Could not read ${filePath}:`, err);
          }
        })
      );
      
      // Build the index
      const index = buildLinkIndex(fileContents, fileTree);
      setLinkIndex(index);
    } catch (err) {
      console.error('[Page] Failed to build link index:', err);
    }
  }, [client, metadata, fileTree]);

  // Rebuild index when file tree changes
  useEffect(() => {
    buildIndex();
  }, [buildIndex]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+O / Cmd+O to open quick switcher
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        setShowQuickSwitcher(true);
      }
      // Ctrl+` to toggle terminal
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setTerminalVisible((v) => !v);
      }
      // Ctrl+G to toggle graph view
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        setShowGraph((v) => !v);
      }
      // Ctrl+B to toggle backlinks
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setShowBacklinks((v) => !v);
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        if (showQuickSwitcher) {
          setShowQuickSwitcher(false);
        } else if (showGraph) {
          setShowGraph(false);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showGraph, showQuickSwitcher]);

  // File selection handler — reads file via coordinator and opens in editor
  const handleFileOpen = useCallback(
    (filePath: string, content: string) => {
      openFile(filePath, content);
    },
    [openFile]
  );

  const handleOpenWorkspace = useCallback(() => {
    setShowWorkspaceModal(true);
  }, []);

  const handleSidebarToggle = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
  }, []);

  // Called when a file is renamed from the editor header (or a wiki-link creates a new file)
  const handleFileRenamed = useCallback(() => {
    fileBrowserRef.current?.refreshFileList();
    // Also refresh the file tree for wiki-link resolution
    fetchFileTree();
  }, [fetchFileTree]);

  // Navigate to a file from backlinks or graph
  const handleNavigateToFile = useCallback(async (filePath: string) => {
    if (!client) return;
    
    try {
      const { content } = await client.readFile(filePath);
      openFile(filePath, content);
    } catch (err) {
      console.error('[Page] Failed to navigate to file:', err);
    }
  }, [client, openFile]);

  // Create a new file from quick switcher
  const handleCreateFile = useCallback(async (fileName: string) => {
    if (!client) return;
    
    try {
      // Ensure .md extension
      const filePath = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
      
      // Create the file with empty content
      await client.saveFile(filePath, '');
      
      // Refresh file tree
      fileBrowserRef.current?.refreshFileList();
      fetchFileTree();
      
      // Open the new file
      openFile(filePath, '');
    } catch (err) {
      console.error('[Page] Failed to create file:', err);
    }
  }, [client, openFile, fetchFileTree]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex">
      {/* LEFT: File browser sidebar - uses negative margin to collapse */}
      <FileBrowser
        ref={fileBrowserRef}
        client={client}
        onFileOpen={handleFileOpen}
        onOpenWorkspace={handleOpenWorkspace}
        onSidebarToggle={handleSidebarToggle}
        isCollapsed={sidebarCollapsed}
        onSearch={() => setShowQuickSwitcher(true)}
        onIntelligence={() => {
          // TODO: Implement Intelligence feature
          console.log('[Page] Intelligence clicked');
        }}
        onSettings={() => {
          // TODO: Implement Settings modal
          console.log('[Page] Settings clicked');
        }}
      />

      {/* CENTER: Editor panel - flex grows to fill remaining space */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-hidden">
            {client ? (
              <EditorPanel
                client={client}
                onFileRenamed={handleFileRenamed}
                fileTree={fileTree}
                sidebarCollapsed={sidebarCollapsed && !!metadata}
                onExpandSidebar={() => setSidebarCollapsed(false)}
              />
            ) : (
              <EditorPlaceholder />
            )}
          </div>

          {/* BOTTOM: Terminal toggle bar + panel */}
          {!terminalVisible && (
            <div className="flex items-center border-t" style={{ backgroundColor: 'var(--md-bg-secondary, #242424)', borderColor: 'var(--md-border, #3a3a3a)' }}>
              <button
                onClick={() => setTerminalVisible(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs transition-colors"
                style={{ color: 'var(--md-text-muted, #a0a0a0)' }}
              >
                <TerminalSquare size={13} />
                Terminal
                <span className="ml-1" style={{ color: 'var(--md-text-faint, #666)' }}>Ctrl+`</span>
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setShowBacklinks(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs transition-colors"
                style={{ color: showBacklinks ? 'var(--md-accent)' : 'var(--md-text-muted, #a0a0a0)' }}
                title="Toggle backlinks (Ctrl+B)"
              >
                <Link2 size={13} />
                Backlinks
              </button>
              <button
                onClick={() => setShowGraph(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs transition-colors"
                style={{ color: 'var(--md-text-muted, #a0a0a0)' }}
                title="Open graph view (Ctrl+G)"
              >
                <GitBranch size={13} />
                Graph
              </button>
            </div>
          )}
          <TerminalPanel
            isVisible={terminalVisible}
            onClose={() => setTerminalVisible(false)}
          />
        </main>

      {/* RIGHT: Backlinks panel - also uses negative margin for smooth transition */}
      <aside
        className={`
          h-screen w-[280px] flex-shrink-0 border-l border-border bg-background
          transition-[margin] duration-300 ease-in-out
          ${showBacklinks ? 'mr-0' : '-mr-[280px]'}
        `}
      >
        <BacklinksPanel
          currentFile={currentFile}
          linkIndex={linkIndex}
          onNavigate={handleNavigateToFile}
        />
      </aside>

      {/* Graph view modal */}
      {showGraph && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-8">
          <div className="w-full h-full max-w-6xl max-h-[90vh] bg-[var(--md-bg)] rounded-xl overflow-hidden shadow-2xl border border-[var(--md-border)]">
            <GraphView
              linkIndex={linkIndex}
              currentFile={currentFile}
              onNodeClick={handleNavigateToFile}
              onClose={() => setShowGraph(false)}
            />
          </div>
        </div>
      )}

      {/* Workspace modal */}
      <WorkspaceModal
        isOpen={showWorkspaceModal}
        onClose={() => setShowWorkspaceModal(false)}
      />

      {/* Quick Switcher */}
      <QuickSwitcher
        isOpen={showQuickSwitcher}
        onClose={() => setShowQuickSwitcher(false)}
        fileTree={fileTree}
        onSelectFile={handleNavigateToFile}
        onCreateFile={handleCreateFile}
      />
    </div>
  );
}

/**
 * Placeholder shown while EditorPanel is being built in parallel
 */
function EditorPlaceholder() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <div className="text-center text-muted-foreground">
        <div className="text-lg font-medium mb-2">Editor</div>
        <div className="text-sm">Open a file from the sidebar to start editing</div>
      </div>
    </div>
  );
}
