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
import { ConfigManager } from './workspace/config-manager.js';
import { ConfigWatcher } from './workspace/config-watcher.js';
import { DEFAULT_ALLOWED_EXTENSIONS } from './workspace/constants.js';
import { ensurePermissionDefaults } from './providers/opencode-config.js';

import {
  handleOpenWorkspace,
  handleSelectFolder,
  handleFsRoots,
  handleFsListDirs,
  handleListFiles,
  handleListAllFiles,
  handleReadFile,
  handleSaveFile,
  handleRenameFile,
  handleDeleteFile,
  handleDuplicateFile,
  handleCreateFolder,
  handleReadFileBase64,
  handleReadFileBase64Chunk,
  handleSaveFileBase64,
} from './handlers/workspace.js';

import {
  handleConfigRead,
  handleConfigWrite,
} from './handlers/config.js';

import { handleSkillInstallZip } from './handlers/skill.js';
import { handleShellExec, handleLoginStart, handleLoginFinish } from './handlers/shell.js';


function parseAllowedOrigins(): string[] | null {
  const env = process.env.COORDINATOR_ALLOWED_ORIGINS;
  if (!env) return null;
  return env.split(',').map((o) => o.trim());
}

export class CoordinatorServer {
  private wss!: WebSocketServer;
  private clients = new Map<WebSocket, Map<string, DocumentState>>();
  private workspaceManager: WorkspaceManager;
  private configManager: ConfigManager;
  private configWatcher: ConfigWatcher;
  private binDir: string;
  private origins: string[] | null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private bindRetryCount = 0;
  private readonly maxBindRetries = 30;
  private isShuttingDown = false;

  constructor(private port: number = 3001, private allowedOrigins?: string[]) {
    this.workspaceManager = new WorkspaceManager();
    this.configManager = new ConfigManager();
    this.configWatcher = new ConfigWatcher();
    this.configManager.setConfigWatcher(this.configWatcher);
    this.binDir = path.join(__dirname, '..', 'bin');

    const origins = this.allowedOrigins ?? parseAllowedOrigins();
    this.origins = origins;

    this.createWebSocketServer();
    this.setupWatcherCallbacks();
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
        case 'workspace/open': {
          const openParams = request.params as RPCParams<'workspace/open'>;
          result = await handleOpenWorkspace(this.workspaceManager, openParams);
          this.configManager.setWorkspacePath(openParams.projectPath);
          this.configWatcher.stop();
          this.configWatcher.start(openParams.projectPath);
          await this.loadFileFilter();
          break;
        }

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

        case 'workspace/allFiles':
          result = await handleListAllFiles(this.workspaceManager);
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

        case 'workspace/file-base64-chunk':
          result = await handleReadFileBase64Chunk(this.workspaceManager, request.params as RPCParams<'workspace/file-base64-chunk'>);
          break;

        case 'workspace/save-file-base64':
          result = await handleSaveFileBase64(this.workspaceManager, request.params as RPCParams<'workspace/save-file-base64'>);
          break;

        // Skill handlers
        case 'skill/install-zip':
          result = await handleSkillInstallZip(request.params as RPCParams<'skill/install-zip'>);
          break;

        // Shell handlers
        case 'shell/exec':
          result = await handleShellExec(request.params as RPCParams<'shell/exec'>);
          break;
        case 'shell/login-start':
          result = handleLoginStart();
          break;
        case 'shell/login-finish':
          result = handleLoginFinish();
          break;

        // Config handlers
        case 'config/read':
          result = await handleConfigRead(this.configManager, request.params as RPCParams<'config/read'>);
          break;

        case 'config/write':
          result = await handleConfigWrite(this.configManager, request.params as RPCParams<'config/write'>);
          break;

        default:
          throw new Error(`Unknown method: ${method}`);
      }

      this.sendResponse(ws, request.id, result);
    } catch (error) {
      // ENOENT during readFile is expected (e.g. watcher races a rename) — log at warn level
      const isEnoent = error instanceof Error && error.message.startsWith('File not found:');
      if (isEnoent) {
        console.warn(`[Coordinator] ${error.message}`);
      } else {
        console.error(`[Coordinator] Error handling ${method}:`, error);
      }
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

  private async loadFileFilter() {
    let respectGitignore = true;
    let extensions = DEFAULT_ALLOWED_EXTENSIONS;
    try {
      const { content } = await this.configManager.readConfig('settings.json');
      if (content) {
        const parsed = JSON.parse(content);
        if (typeof parsed.respectGitignore === 'boolean') {
          respectGitignore = parsed.respectGitignore;
        }
        if (Array.isArray(parsed.allowedExtensions)) {
          extensions = parsed.allowedExtensions;
        }
      }
    } catch {
      // Fall through to defaults
    }
    if (respectGitignore) {
      await this.workspaceManager.loadGitignore();
    }
    this.workspaceManager.setFileFilter(respectGitignore, extensions);
  }

  private setupWatcherCallbacks() {
    this.workspaceManager.setOnFilesChanged((changes: FileChange[]) => {
      this.broadcastNotification('workspace/filesChanged', { changes });
    });

    this.workspaceManager.setOnFileChangedOnDisk((filePath: string, mtime: number) => {
      this.broadcastNotification('workspace/fileChangedOnDisk', { filePath, mtime });
    });

    this.configWatcher.setOnConfigChanged((file: string) => {
      if (file === 'settings.json') {
        this.loadFileFilter();
      }
      this.broadcastNotification('config/changed', { file });
    });
  }

  close() {
    this.isShuttingDown = true;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    this.clients.clear();
    this.workspaceManager.stopWatcher();
    this.configWatcher.stop();
    this.wss.close();
  }
}

if (import.meta.main) {
  const PORT = process.env.COORDINATOR_PORT ? parseInt(process.env.COORDINATOR_PORT) : 3001;

  console.log('=== Cushion Coordinator ===');
  console.log(`Starting server on port ${PORT}...`);

  await ensurePermissionDefaults();
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
