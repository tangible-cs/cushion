import { createContext, useContext, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import type { WikiLinkNavigateCallback } from '@/lib/codemirror-wysiwyg';

export interface EditorPanelContextValue {
  handleChange: (filePath: string, content: string) => void;
  handleSave: (filePath: string) => void;
  handlePasteImages: (params: { files: File[]; view: EditorView; filePath: string }) => void;
  handleWikiLinkNavigate: WikiLinkNavigateCallback;
  filePaths?: string[];
  focusModeEnabled: boolean;
  searchPanelContainerRef: RefObject<HTMLDivElement | null>;
  onAddSelectionToChat?: (data: { path: string; selection: { startLine: number; startChar: number; endLine: number; endChar: number }; preview: string }) => void;
  diffAcceptAllRef: React.MutableRefObject<(() => void) | null>;
  diffRejectAllRef: React.MutableRefObject<(() => void) | null>;
  diffExitReviewRef: React.MutableRefObject<(() => void) | null>;
  diffSaveRef: React.MutableRefObject<((filePath: string, content: string) => Promise<void>) | null>;
}

const EditorPanelCtx = createContext<EditorPanelContextValue | null>(null);

export const EditorPanelProvider = EditorPanelCtx.Provider;

export function useEditorPanelContext(): EditorPanelContextValue {
  const ctx = useContext(EditorPanelCtx);
  if (!ctx) throw new Error('useEditorPanelContext must be used within EditorPanelProvider');
  return ctx;
}
