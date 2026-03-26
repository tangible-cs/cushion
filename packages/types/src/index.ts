import type { CushionSettings } from './config.js';

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface WorkspaceEdit {
  changes: Record<string, TextEdit[]>;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  isHidden?: boolean;
  children?: FileTreeNode[];
}

export interface WorkspaceMetadata {
  projectPath: string;
  projectName: string;
  lastOpened?: number;
  gitRoot?: string;
}

export interface Frontmatter {
  /** Character position where frontmatter starts (always 0) */
  start: number;
  /** Character position where frontmatter ends (after closing ---) */
  end: number;
  raw: string;
  data: Record<string, unknown>;
}

export interface FileState {
  filePath: string;
  absolutePath: string;
  /** Full content including frontmatter */
  content: string;
  /** Content saved on disk */
  savedContent: string;
  isDirty: boolean;
  version: number;
  language?: string;
  encoding?: string;
  lineEnding?: string;
  lastSaved?: number;
  frontmatter?: Frontmatter | null;
}

export interface TabState {
  id: string;
  filePath: string;
  isActive: boolean;
  isPinned: boolean;
  isPreview: boolean;
  order: number;
}

export type WorkspacePreferences = Required<CushionSettings>;

export interface FileWatcherState {
  watchedPaths: string[];
  ignoredPatterns: string[];
  hasExternalChanges: Map<string, boolean>;
}

export interface WorkspaceState {
  metadata: WorkspaceMetadata | null;
  openFiles: Map<string, FileState>;
  tabs: TabState[];
  currentFile: string | null;
  flatFileList: string[];
  fileWatcher: FileWatcherState;
  recentProjects: WorkspaceMetadata[];
  recentFiles: string[];
  preferences: WorkspacePreferences;
  sidebarWidth: number;
  sessionId: string;
  isLoading: boolean;
  error: string | null;
}

export interface DidOpenTextDocumentParams {
  textDocument: {
    uri: string;
    languageId: string;
    version: number;
    text: string;
  };
}

export interface DidChangeTextDocumentParams {
  textDocument: {
    uri: string;
    version: number;
  };
  contentChanges: { text: string }[];
}

export interface CodeActionParams {
  textDocument: {
    uri: string;
  };
  range: Range;
  context: {
    instruction: string;
  };
}

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params: unknown;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** No id — no response expected */
export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params: unknown;
}

export interface DocumentState {
  uri: string;
  version: number;
  text: string;
}

export interface WikiLinkInfo {
  /** Full match text including brackets */
  raw: string;
  /** Target file path/name (without extension) */
  href: string;
  /** Optional header/block anchor (e.g., "#section") */
  contentId?: string;
  /** Optional display text (e.g., "|custom text") */
  displayText?: string;
  start: number;
  end: number;
}

export type WikiLinkState = 'resolved' | 'empty' | 'ambiguous';

export interface ResolvedWikiLink {
  state: WikiLinkState;
  /** Empty if state is 'empty', multiple if 'ambiguous' */
  targets: string[];
}

export interface FileChange {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  isDirectory?: boolean;
}

export interface FilesChangedNotification {
  changes: FileChange[];
}

export interface FileChangedOnDiskNotification {
  filePath: string;
  mtime: number;
}

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export * from './rpc.js';
export * from './config.js';
export * from './pdf-export.js';
