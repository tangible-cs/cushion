import type {
  FileTreeNode,
  FileChange,
} from './index.js';

export interface TrashItem {
  id: string;
  originalPath: string;
  deletedAt: string; // ISO 8601
  isDirectory: boolean;
}

export interface RPCMethodMap {
  // Workspace
  'workspace/open': {
    params: { projectPath: string };
    result: { projectName: string; gitRoot: string | null };
  };
  'workspace/select-folder': {
    params: void;
    result: { path: string | null };
  };
  'workspace/files': {
    params: { relativePath?: string };
    result: { files: FileTreeNode[] };
  };
  'workspace/allFiles': {
    params: void;
    result: { paths: string[] };
  };
  'workspace/file': {
    params: { filePath: string };
    result: { content: string; encoding: string; lineEnding: string };
  };
  'workspace/save-file': {
    params: {
      filePath: string;
      content: string;
      encoding?: string;
      lineEnding?: 'LF' | 'CRLF';
    };
    result: { success: boolean };
  };
  'workspace/rename': {
    params: { oldPath: string; newPath: string };
    result: { success: boolean };
  };
  'workspace/delete': {
    params: { path: string };
    result: { success: boolean; trashItem?: TrashItem };
  };
  'workspace/duplicate': {
    params: { path: string; newPath: string };
    result: { success: boolean };
  };
  'workspace/create-folder': {
    params: { path: string };
    result: { success: boolean };
  };
  'workspace/file-base64': {
    params: { filePath: string };
    result: { base64: string; mimeType: string };
  };
  'workspace/file-base64-chunk': {
    params: { filePath: string; offset: number; length: number };
    result: {
      base64: string;
      mimeType: string;
      offset: number;
      bytesRead: number;
      totalBytes: number;
    };
  };
  'workspace/save-file-base64': {
    params: { filePath: string; base64: string };
    result: { success: boolean };
  };

  // Trash
  'trash/restore': {
    params: { ids: string[] };
    result: { success: boolean; restoredPaths: string[] };
  };
  'trash/list': {
    params: void;
    result: { items: TrashItem[] };
  };
  'trash/permanent-delete': {
    params: { ids: string[] };
    result: { success: boolean };
  };
  'trash/empty': {
    params: void;
    result: { success: boolean };
  };

  // Skills
  'skill/install-zip': {
    params: { skillName: string; files: Array<{ path: string; content: string }> };
    result: { success: boolean };
  };

  // Shell (scoped to setup commands)
  'shell/exec': {
    params: { command: string; args: string[] };
    result: { stdout: string; stderr: string; exitCode: number };
  };
  'shell/login-start': {
    params: void;
    result: { started: boolean };
  };
  'shell/login-finish': {
    params: void;
    result: { finished: boolean };
  };

  // Config
  'config/read': {
    params: { file: string };
    result: { content: string | null; exists: boolean };
  };
  'config/write': {
    params: { file: string; content: string };
    result: { success: boolean };
  };
}

export interface RPCServerNotificationMap {
  'workspace/filesChanged': { changes: FileChange[] };
  'workspace/fileChangedOnDisk': { filePath: string; mtime: number };
  'config/changed': { file: string };
}

export type RPCMethodName = keyof RPCMethodMap;
export type RPCParams<M extends RPCMethodName> = RPCMethodMap[M]['params'];
export type RPCResult<M extends RPCMethodName> = RPCMethodMap[M]['result'];

export type RPCServerNotificationName = keyof RPCServerNotificationMap;
export type RPCServerNotificationParams<M extends RPCServerNotificationName> =
  RPCServerNotificationMap[M];

