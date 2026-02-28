/**
 * Typed RPC contract map for coordinator ↔ frontend communication.
 *
 * Single source of truth for every JSON-RPC method, its params, and result.
 * Use RPCParams<M> / RPCResult<M> to extract types for a given method.
 */

import type {
  FileTreeNode,
  Provider,
  Model,
  AuthMethod,
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
  'workspace/save-file-base64': {
    params: { filePath: string; base64: string };
    result: { success: boolean };
  };

  // Provider
  'provider/list': {
    params: void;
    result: { providers: Provider[]; connected: string[] };
  };
  'provider/refresh': {
    params: void;
    result: { providers: Provider[]; connected: string[] };
  };
  'provider/popular': {
    params: void;
    result: { ids: string[] };
  };
  'provider/auth/methods': {
    params: void;
    result: Record<string, AuthMethod[]>;
  };
  'provider/auth/set': {
    params: { providerID: string; apiKey: string };
    result: { success: boolean };
  };
  'provider/auth/remove': {
    params: { providerID: string };
    result: { success: boolean };
  };
  'provider/oauth/authorize': {
    params: {
      providerID: string;
      method: number;
      inputs?: Record<string, string>;
    };
    result: { url: string; method: 'auto' | 'code'; instructions: string };
  };
  'provider/oauth/callback': {
    params: { providerID: string; method: number; code?: string };
    result: { success: boolean };
  };
  'provider/sync': {
    params: void;
    result: { success: boolean };
  };

  // Ollama
  'provider/ollama/list': {
    params: void;
    result: { models: Model[]; running: boolean };
  };
  'provider/ollama/pull': {
    params: { model: string };
    result: { success: boolean; error?: string };
  };
  'provider/ollama/delete': {
    params: { model: string };
    result: { success: boolean; error?: string };
  };
  'provider/ollama/write-config': {
    params: { baseUrl?: string; models?: unknown[] };
    result: { success: boolean; message: string };
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
