import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import type {
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  FileChange,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  DocumentState,
} from '@cushion/types';

import { WorkspaceManager } from './workspace/manager.js';
import { CredentialStorage } from './providers/storage.js';
import { getModelsDevCache } from './providers/models-dev.js';
import { getOAuthHandler } from './providers/oauth.js';

import {
  handleOpenWorkspace,
  handleSelectFolder,
  handleFsRoots,
  handleFsListDirs,
  handleListFiles,
  handleReadFile,
  handleSaveFile,
  handleRenameFile,
  handleDeleteFile,
  handleDuplicateFile,
  handleCreateFolder,
  handleReadFileBase64,
  handleSaveFileBase64,
} from './handlers/workspace.js';

import {
  handleProviderList,
  handleProviderRefresh,
  handleProviderPopular,
  handleProviderAuthMethods,
  handleProviderAuthSet,
  handleProviderAuthRemove,
  handleProviderOAuthAuthorize,
  handleProviderOAuthCallback,
  handleOllamaList,
  handleOllamaPull,
  handleOllamaDelete,
  handleOllamaWriteConfig,
} from './handlers/provider.js';

export class CoordinatorServer {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, Map<string, DocumentState>>();
  private workspaceManager: WorkspaceManager;
  private credentialStorage: CredentialStorage;
  private oauthCleanupInterval: ReturnType<typeof setInterval> | null = null;
  private binDir: string;

  constructor(private port: number = 3001) {
    this.workspaceManager = new WorkspaceManager();
    this.credentialStorage = new CredentialStorage();
    this.binDir = path.join(__dirname, '..', 'bin');
    this.wss = new WebSocketServer({ port });
    this.setupHandlers();
    this.setupWatcherCallbacks();

    // Cleanup expired OAuth states every 5 minutes
    this.oauthCleanupInterval = setInterval(() => {
      const oauth = getOAuthHandler();
      oauth.cleanupExpiredStates();
    }, 5 * 60 * 1000);
  }

  private setupHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.set(ws, new Map());

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as JSONRPCRequest | JSONRPCNotification;
          await this.handleMessage(ws, message);
        } catch (error) {
          console.error('[Coordinator] Error parsing message:', error);
          this.sendError(ws, -1, -32700, 'Parse error');
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[Coordinator] WebSocket error:', error);
      });
    });
  }

  private async handleMessage(ws: WebSocket, message: JSONRPCRequest | JSONRPCNotification) {
    const { method } = message;

    if (!('id' in message)) {
      await this.handleNotification(ws, message as JSONRPCNotification);
      return;
    }

    const request = message as JSONRPCRequest;

    try {
      let result: unknown;

      switch (method) {
        // Workspace handlers
        case 'workspace/open':
          result = await handleOpenWorkspace(this.workspaceManager, request.params as { projectPath: string });
          break;

        case 'workspace/select-folder':
          result = await handleSelectFolder(this.binDir);
          break;

        case 'fs/roots':
          result = await handleFsRoots();
          break;

        case 'fs/list-dirs':
          result = await handleFsListDirs(request.params as { path: string });
          break;

        case 'workspace/files':
          result = await handleListFiles(this.workspaceManager, request.params as { relativePath?: string });
          break;

        case 'workspace/file':
          result = await handleReadFile(this.workspaceManager, request.params as { filePath: string });
          break;

        case 'workspace/save-file':
          result = await handleSaveFile(this.workspaceManager, request.params as { filePath: string; content: string; encoding?: string; lineEnding?: 'LF' | 'CRLF' });
          break;

        case 'workspace/rename':
          result = await handleRenameFile(this.workspaceManager, request.params as { oldPath: string; newPath: string });
          break;

        case 'workspace/delete':
          result = await handleDeleteFile(this.workspaceManager, request.params as { path: string });
          break;

        case 'workspace/duplicate':
          result = await handleDuplicateFile(this.workspaceManager, request.params as { path: string; newPath: string });
          break;

        case 'workspace/create-folder':
          result = await handleCreateFolder(this.workspaceManager, request.params as { path: string });
          break;

        case 'workspace/file-base64':
          result = await handleReadFileBase64(this.workspaceManager, request.params as { filePath: string });
          break;

        case 'workspace/save-file-base64':
          result = await handleSaveFileBase64(this.workspaceManager, request.params as { filePath: string; base64: string });
          break;

        // Provider handlers
        case 'provider/list':
          result = await handleProviderList(this.credentialStorage);
          break;

        case 'provider/refresh':
          result = await handleProviderRefresh(this.credentialStorage);
          break;

        case 'provider/popular':
          result = handleProviderPopular();
          break;

        case 'provider/auth/methods':
          result = await handleProviderAuthMethods();
          break;

        case 'provider/auth/set':
          result = await handleProviderAuthSet(this.credentialStorage, request.params as { providerID: string; apiKey: string });
          break;

        case 'provider/auth/remove':
          result = await handleProviderAuthRemove(this.credentialStorage, request.params as { providerID: string });
          break;

        case 'provider/oauth/authorize':
          result = await handleProviderOAuthAuthorize(request.params as { providerID: string; method: number });
          break;

        case 'provider/oauth/callback':
          result = await handleProviderOAuthCallback(this.credentialStorage, request.params as { providerID: string; method: number; code?: string });
          break;

        case 'provider/ollama/list':
          result = await handleOllamaList(this.credentialStorage);
          break;

        case 'provider/ollama/pull':
          result = await handleOllamaPull(this.credentialStorage, request.params as { model: string });
          break;

        case 'provider/ollama/delete':
          result = await handleOllamaDelete(this.credentialStorage, request.params as { model: string });
          break;

        case 'provider/ollama/write-config':
          result = await handleOllamaWriteConfig(this.credentialStorage, request.params as { baseUrl?: string; models?: any[] });
          break;

        default:
          throw new Error(`Unknown method: ${method}`);
      }

      this.sendResponse(ws, request.id, result);
    } catch (error) {
      console.error(`[Coordinator] Error handling ${method}:`, error);
      this.sendError(
        ws,
        request.id,
        -32603,
        error instanceof Error ? error.message : 'Internal error'
      );
    }
  }

  private async handleNotification(ws: WebSocket, notification: JSONRPCNotification) {
    const { method, params } = notification;

    switch (method) {
      case 'textDocument/didOpen':
        this.handleDidOpen(ws, params as DidOpenTextDocumentParams);
        break;

      case 'textDocument/didChange':
        this.handleDidChange(ws, params as DidChangeTextDocumentParams);
        break;

      default:
        break;
    }
  }

  private handleDidOpen(ws: WebSocket, params: DidOpenTextDocumentParams) {
    const docs = this.clients.get(ws)!;
    docs.set(params.textDocument.uri, {
      uri: params.textDocument.uri,
      version: params.textDocument.version,
      text: params.textDocument.text,
    });
  }

  private handleDidChange(ws: WebSocket, params: DidChangeTextDocumentParams) {
    const docs = this.clients.get(ws)!;
    const doc = docs.get(params.textDocument.uri);

    if (!doc) {
      return;
    }

    for (const change of params.contentChanges) {
      doc.text = change.text;
    }

    doc.version = params.textDocument.version;
  }

  private sendNotification(ws: WebSocket, method: string, params: unknown) {
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    ws.send(JSON.stringify(notification));
  }

  private sendResponse(ws: WebSocket, id: string | number, result: unknown) {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    ws.send(JSON.stringify(response));
  }

  private sendError(ws: WebSocket, id: string | number, code: number, message: string, data?: unknown) {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
    ws.send(JSON.stringify(response));
  }

  private broadcastNotification(method: string, params: unknown) {
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    const json = JSON.stringify(notification);
    for (const ws of this.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
  }

  private setupWatcherCallbacks() {
    this.workspaceManager.setOnFilesChanged((changes: FileChange[]) => {
      this.broadcastNotification('workspace/filesChanged', { changes });
    });

    this.workspaceManager.setOnFileChangedOnDisk((filePath: string, mtime: number) => {
      this.broadcastNotification('workspace/fileChangedOnDisk', { filePath, mtime });
    });
  }

  close() {
    if (this.oauthCleanupInterval) {
      clearInterval(this.oauthCleanupInterval);
      this.oauthCleanupInterval = null;
    }
    getModelsDevCache().stopAutoRefresh();
    this.workspaceManager.stopWatcher();
    this.wss.close();
  }
}

const PORT = process.env.COORDINATOR_PORT ? parseInt(process.env.COORDINATOR_PORT) : 3001;

console.log('=== Cushion Coordinator ===');
console.log(`Starting server on port ${PORT}...`);

const server = new CoordinatorServer(PORT);

process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  server.close();
  process.exit(0);
});
