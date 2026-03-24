/**
 * Typed RPC contract map for coordinator ↔ frontend communication.
 *
 * Single source of truth for every JSON-RPC method, its params, and result.
 * Use RPCParams<M> / RPCResult<M> to extract types for a given method.
 */

import type {
  FileTreeNode,
  FileChange,
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
} from './index.js';

/** Filesystem entry returned by fs/roots and fs/list-dirs */
export interface FsEntry {
  name: string;
  path: string;
}

// ── RPC Method Map ────────────────────────────────────────────────

/**
 * Maps every coordinator JSON-RPC request method to { params, result }.
 *
 * `params: void` means the method accepts no meaningful parameters
 * (the transport still sends `{}` per JSON-RPC convention).
 */
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
  'fs/roots': {
    params: void;
    result: { roots: FsEntry[] };
  };
  'fs/list-dirs': {
    params: { path: string };
    result: { path: string; parent: string | null; dirs: FsEntry[] };
  };
  'workspace/files': {
    params: { relativePath?: string };
    result: { files: FileTreeNode[] };
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
    result: { success: boolean };
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

// ── Notification Maps ─────────────────────────────────────────────

/** Client → Server notifications (fire-and-forget, no response expected) */
export interface RPCNotificationMap {
  'textDocument/didOpen': DidOpenTextDocumentParams;
  'textDocument/didChange': DidChangeTextDocumentParams;
}

/** Server → Client notifications (pushed from coordinator) */
export interface RPCServerNotificationMap {
  'workspace/filesChanged': { changes: FileChange[] };
  'workspace/fileChangedOnDisk': { filePath: string; mtime: number };
  'config/changed': { file: string };
}

// ── Extraction Helpers ────────────────────────────────────────────

/** Union of all RPC request method names */
export type RPCMethodName = keyof RPCMethodMap;

/** Extract the params type for a given RPC method */
export type RPCParams<M extends RPCMethodName> = RPCMethodMap[M]['params'];

/** Extract the result type for a given RPC method */
export type RPCResult<M extends RPCMethodName> = RPCMethodMap[M]['result'];

/** Union of all client → server notification names */
export type RPCNotificationName = keyof RPCNotificationMap;

/** Extract params for a client → server notification */
export type RPCNotificationParams<M extends RPCNotificationName> = RPCNotificationMap[M];

/** Union of all server → client notification names */
export type RPCServerNotificationName = keyof RPCServerNotificationMap;

/** Extract params for a server → client notification */
export type RPCServerNotificationParams<M extends RPCServerNotificationName> =
  RPCServerNotificationMap[M];

// ── Typed JSON-RPC Message Shapes ─────────────────────────────────

/** Typed JSON-RPC request for a specific method */
export interface TypedRPCRequest<M extends RPCMethodName> {
  jsonrpc: '2.0';
  id: string | number;
  method: M;
  params: RPCParams<M>;
}

/** Typed JSON-RPC response for a specific method */
export interface TypedRPCResponse<M extends RPCMethodName> {
  jsonrpc: '2.0';
  id: string | number;
  result?: RPCResult<M>;
  error?: { code: number; message: string; data?: unknown };
}

/** Typed client → server notification */
export interface TypedRPCNotification<M extends RPCNotificationName> {
  jsonrpc: '2.0';
  method: M;
  params: RPCNotificationParams<M>;
}

/** Typed server → client notification */
export interface TypedRPCServerNotification<M extends RPCServerNotificationName> {
  jsonrpc: '2.0';
  method: M;
  params: RPCServerNotificationParams<M>;
}
