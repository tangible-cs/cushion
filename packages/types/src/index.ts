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
  start: number;
  end: number;
  raw: string;
  data: Record<string, unknown>;
}

export interface FileState {
  filePath: string;
  absolutePath: string;
  content: string;
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

export interface WikiLinkInfo {
  raw: string;
  href: string;
  contentId?: string;
  displayText?: string;
  start: number;
  end: number;
}

export type WikiLinkState = 'resolved' | 'empty' | 'ambiguous';

export interface ResolvedWikiLink {
  state: WikiLinkState;
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

export * from './rpc.js';
export * from './config.js';
export * from './pdf-export.js';
