// =============================================================================
// LSP-style Document Position & Edit Types
// =============================================================================

/** A position in a text document (zero-based line and character offset) */
export interface Position {
  line: number;
  character: number;
}

/** A range in a text document defined by start and end positions */
export interface Range {
  start: Position;
  end: Position;
}

/** A text edit: replaces content in a given range with new text */
export interface TextEdit {
  range: Range;
  newText: string;
}

/** A workspace edit containing changes keyed by document URI */
export interface WorkspaceEdit {
  changes: Record<string, TextEdit[]>;
}

// =============================================================================
// File Tree Types
// =============================================================================

/** A node in the file tree (file or directory) */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  isHidden?: boolean;
  children?: FileTreeNode[];
}

// =============================================================================
// Workspace Types
// =============================================================================

/** Metadata describing an open workspace */
export interface WorkspaceMetadata {
  projectPath: string;
  projectName: string;
  lastOpened?: number;
  gitRoot?: string;
}

// =============================================================================
// Frontmatter Types (inspired by Tangent's indexTypes.ts)
// =============================================================================

/** Parsed frontmatter from a markdown file */
export interface Frontmatter {
  /** Character position where frontmatter starts (always 0) */
  start: number;
  /** Character position where frontmatter ends (after closing ---) */
  end: number;
  /** Raw YAML string (without delimiters) */
  raw: string;
  /** Parsed data object */
  data: Record<string, unknown>;
}

// =============================================================================
// File State Types
// =============================================================================

/** State of a single open file */
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
  /** Parsed frontmatter (if any) */
  frontmatter?: Frontmatter | null;
}

/** State of a single editor tab */
export interface TabState {
  id: string;
  filePath: string;
  isActive: boolean;
  isPinned: boolean;
  isPreview: boolean;
  order: number;
}

/** User preferences for workspace behavior */
export interface WorkspacePreferences {
  showHiddenFiles: boolean;
  fileTreeCollapsed: boolean;
  sidebarWidth: number;
  autoSave: boolean;
  autoSaveDelay: number;
}

/** File watcher state */
export interface FileWatcherState {
  watchedPaths: string[];
  ignoredPatterns: string[];
  hasExternalChanges: Map<string, boolean>;
}

/** Full workspace state (used by the workspace store) */
export interface WorkspaceState {
  metadata: WorkspaceMetadata | null;
  openFiles: Map<string, FileState>;
  tabs: TabState[];
  currentFile: string | null;
  fileWatcher: FileWatcherState;
  recentProjects: WorkspaceMetadata[];
  recentFiles: string[];
  preferences: WorkspacePreferences;
  sessionId: string;
  isLoading: boolean;
  error: string | null;
}

// =============================================================================
// LSP-style Document Sync Params
// =============================================================================

/** Parameters for textDocument/didOpen notification */
export interface DidOpenTextDocumentParams {
  textDocument: {
    uri: string;
    languageId: string;
    version: number;
    text: string;
  };
}

/** Parameters for textDocument/didChange notification */
export interface DidChangeTextDocumentParams {
  textDocument: {
    uri: string;
    version: number;
  };
  contentChanges: { text: string }[];
}

/** Parameters for textDocument/codeAction request */
export interface CodeActionParams {
  textDocument: {
    uri: string;
  };
  range: Range;
  context: {
    instruction: string;
  };
}

// =============================================================================
// JSON-RPC Protocol Types
// =============================================================================

/** A JSON-RPC 2.0 request */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params: unknown;
}

/** A JSON-RPC 2.0 response */
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

/** A JSON-RPC 2.0 notification (no id, no response expected) */
export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params: unknown;
}

// =============================================================================
// Terminal Types
// =============================================================================

/** Parameters for terminal/command request */
export interface TerminalCommandParams {
  command: string;
  workingDirectory?: string;
}

/** Terminal output notification payload */
export interface TerminalOutputParams {
  output: string;
  error?: boolean;
  exitCode?: number;
}

/** Parameters for terminal/create request */
export interface TerminalCreateParams {
  workingDirectory?: string;
  shell?: string;
}

/** Parameters for terminal/input request */
export interface TerminalInputParams {
  input: string;
}

/** Parameters for terminal/resize request */
export interface TerminalResizeParams {
  cols: number;
  rows: number;
}

// =============================================================================
// Document State (server-side tracking)
// =============================================================================

/** Server-side state of a tracked document */
export interface DocumentState {
  uri: string;
  version: number;
  text: string;
}

// =============================================================================
// Wiki-Link Types (inspired by Tangent's link system)
// =============================================================================

/** Info about a parsed wiki-link [[href#contentId|displayText]] */
export interface WikiLinkInfo {
  /** Full match text including brackets */
  raw: string;
  /** Target file path/name (without extension) */
  href: string;
  /** Optional header/block anchor (e.g., "#section") */
  contentId?: string;
  /** Optional display text (e.g., "|custom text") */
  displayText?: string;
  /** Start position in document */
  start: number;
  /** End position in document */
  end: number;
}

/** Resolution state for a wiki-link */
export type WikiLinkState = 'resolved' | 'empty' | 'ambiguous';

/** Resolved wiki-link with target file info */
export interface ResolvedWikiLink {
  /** Resolution state */
  state: WikiLinkState;
  /** Matched file path(s) - empty if state is 'empty', multiple if 'ambiguous' */
  targets: string[];
}
