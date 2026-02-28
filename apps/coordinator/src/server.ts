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
  RPCParams,
  RPCNotificationParams,
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
  handleProviderSync,
  handleOllamaList,
  handleOllamaPull,
  handleOllamaDelete,
  handleOllamaWriteConfig,
} from './handlers/provider.js';

function parseAllowedOrigins(): string[] | null {
  const env = process.env.COORDINATOR_ALLOWED_ORIGINS;
  if (!env) return null;
  return env.split(',').map((o) => o.trim());
}

export class CoordinatorServer {
  private wss!: WebSocketServer;
  private clients = new Map<WebSocket, Map<string, DocumentState>>();
  private workspaceManager: WorkspaceManager;
  private credentialStorage: CredentialStorage;
  private oauthCleanupInterval: ReturnType<typeof setInterval> | null = null;
  private binDir: string;
  private origins: string[] | null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private bindRetryCount = 0;
  private readonly maxBindRetries = 30;
  private isShuttingDown = false;

  constructor(private port: number = 3001, private allowedOrigins?: string[]) {
    this.workspaceManager = new WorkspaceManager();
    this.credentialStorage = new CredentialStorage();
    this.binDir = path.join(__dirname, '..', 'bin');

    const origins = this.allowedOrigins ?? parseAllowedOrigins();
    this.origins = origins;

    this.createWebSocketServer();
    this.setupWatcherCallbacks();

    // Cleanup expired OAuth states every 5 minutes
    this.oauthCleanupInterval = setInterval(() => {
      const oauth = getOAuthHandler();
      oauth.cleanupExpiredStates();
    }, 5 * 60 * 1000);
  }

  private createWebSocketServer() {
    this.wss = new WebSocketServer({
      port: this.port,
      ...(this.origins && {
        verifyClient: (info: { origin: string; secure: boolean; req: import('http').IncomingMessage }) => {
          const origin = info.origin || info.req.headers.origin;
          if (!origin) return false;
          return this.origins!.includes(origin);
        },
      }),
    });

    this.wss.on('listening', () => {
      this.bindRetryCount = 0;
    });

    this.wss.on('error', (error) => {
      this.handleWebSocketServerError(error as NodeJS.ErrnoException);
    });

    this.setupHandlers(this.wss);
  }

  private handleWebSocketServerError(error: NodeJS.ErrnoException) {
    if (this.isShuttingDown) {
      return;
    }

    if (error.code !== 'EADDRINUSE') {
      console.error('[Coordinator] WebSocket server error:', error);
      return;
    }

    this.bindRetryCount += 1;

    if (this.bindRetryCount > this.maxBindRetries) {
      console.error(
        `[Coordinator] Failed to bind port ${this.port} after ${this.maxBindRetries} retries. Is another coordinator process running?`
      );
      return;
    }

    if (this.restartTimer) {
      return;
    }

    console.error(
      `[Coordinator] Port ${this.port} is in use. Retrying in 1s (${this.bindRetryCount}/${this.maxBindRetries})...`
    );

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;

      if (this.isShuttingDown) {
        return;
      }

      this.clients.clear();

      try {
        this.wss.close();
      } catch {
        // Ignore close errors while rebinding.
      }

      this.createWebSocketServer();
    }, 1000);
  }

  private setupHandlers(wss: WebSocketServer) {
    wss.on('connection', (ws: WebSocket) => {
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
          result = await handleOpenWorkspace(this.workspaceManager, request.params as RPCParams<'workspace/open'>);
          break;

        case 'workspace/select-folder':
          result = await handleSelectFolder(this.binDir);
          break;

        case 'fs/roots':
          result = await handleFsRoots();
          break;

        case 'fs/list-dirs':
          result = await handleFsListDirs(request.params as RPCParams<'fs/list-dirs'>);
          break;

        case 'workspace/files':
          result = await handleListFiles(this.workspaceManager, request.params as RPCParams<'workspace/files'>);
          break;

        case 'workspace/file':
          result = await handleReadFile(this.workspaceManager, request.params as RPCParams<'workspace/file'>);
          break;

        case 'workspace/save-file':
          result = await handleSaveFile(this.workspaceManager, request.params as RPCParams<'workspace/save-file'>);
          break;

        case 'workspace/rename':
          result = await handleRenameFile(this.workspaceManager, request.params as RPCParams<'workspace/rename'>);
          break;

        case 'workspace/delete':
          result = await handleDeleteFile(this.workspaceManager, request.params as RPCParams<'workspace/delete'>);
          break;

        case 'workspace/duplicate':
          result = await handleDuplicateFile(this.workspaceManager, request.params as RPCParams<'workspace/duplicate'>);
          break;

        case 'workspace/create-folder':
          result = await handleCreateFolder(this.workspaceManager, request.params as RPCParams<'workspace/create-folder'>);
          break;

        case 'workspace/file-base64':
          result = await handleReadFileBase64(this.workspaceManager, request.params as RPCParams<'workspace/file-base64'>);
          break;

        case 'workspace/save-file-base64':
          result = await handleSaveFileBase64(this.workspaceManager, request.params as RPCParams<'workspace/save-file-base64'>);
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
          result = await handleProviderAuthSet(this.credentialStorage, request.params as RPCParams<'provider/auth/set'>);
          await handleProviderSync(this.credentialStorage).catch((err) =>
            console.error('[Coordinator] Auto-sync after auth/set failed:', err)
          );
          break;

        case 'provider/auth/remove':
          result = await handleProviderAuthRemove(this.credentialStorage, request.params as RPCParams<'provider/auth/remove'>);
          await handleProviderSync(this.credentialStorage).catch((err) =>
            console.error('[Coordinator] Auto-sync after auth/remove failed:', err)
          );
          break;

        case 'provider/oauth/authorize':
          result = await handleProviderOAuthAuthorize(request.params as RPCParams<'provider/oauth/authorize'>);
          break;

        case 'provider/oauth/callback':
          result = await handleProviderOAuthCallback(this.credentialStorage, request.params as RPCParams<'provider/oauth/callback'>);
          await handleProviderSync(this.credentialStorage).catch((err) =>
            console.error('[Coordinator] Auto-sync after oauth/callback failed:', err)
          );
          break;

        case 'provider/sync':
          result = await handleProviderSync(this.credentialStorage);
          break;

        case 'provider/ollama/list':
          result = await handleOllamaList(this.credentialStorage);
          break;

        case 'provider/ollama/pull':
          result = await handleOllamaPull(this.credentialStorage, request.params as RPCParams<'provider/ollama/pull'>);
          break;

        case 'provider/ollama/delete':
          result = await handleOllamaDelete(this.credentialStorage, request.params as RPCParams<'provider/ollama/delete'>);
          break;

        case 'provider/ollama/write-config':
          result = await handleOllamaWriteConfig(this.credentialStorage, request.params as RPCParams<'provider/ollama/write-config'>);
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
        this.handleDidOpen(ws, params as RPCNotificationParams<'textDocument/didOpen'>);
        break;

      case 'textDocument/didChange':
        this.handleDidChange(ws, params as RPCNotificationParams<'textDocument/didChange'>);
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
    this.isShuttingDown = true;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.oauthCleanupInterval) {
      clearInterval(this.oauthCleanupInterval);
      this.oauthCleanupInterval = null;
    }

    this.clients.clear();
    getModelsDevCache().stopAutoRefresh();
    this.workspaceManager.stopWatcher();
    this.wss.close();
  }
}

if (import.meta.main) {
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
}
