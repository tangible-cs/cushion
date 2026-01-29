/**
 * WebSocket Server for Cushion coordinator
 *
 * Implements LSP-style message protocol:
 * - textDocument/didOpen
 * - textDocument/didChange
 * - workspace/* (open, files, file, save-file, rename, delete, duplicate)
 * - terminal/* (create, command, input, resize, destroy)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from '@lydell/node-pty';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import type {
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  FileTreeNode,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  DocumentState,
  TerminalCommandParams,
  TerminalOutputParams,
  TerminalCreateParams,
  TerminalInputParams,
  TerminalResizeParams,
} from '@cushion/types';
import { WorkspaceManager } from './workspace/manager.js';

const execFileAsync = promisify(execFile);

/**
 * WebSocket coordinator server
 */
export class CoordinatorServer {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, Map<string, DocumentState>>();
  private workspaceManager: WorkspaceManager;
  private terminalSessions = new Map<WebSocket, any>();
  private terminalProcesses = new Map<WebSocket, any>();

  constructor(private port: number = 3001) {
    this.workspaceManager = new WorkspaceManager();
    this.wss = new WebSocketServer({ port });
    this.setupHandlers();
  }

  private setupHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      // Initialize client state
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

        // Clean up any terminal session for this client
        const terminalSession = this.terminalSessions.get(ws);
        if (terminalSession) {
          terminalSession.kill();
          this.terminalSessions.delete(ws);
        }

        // Clean up any terminal process for this client (legacy support)
        const terminalProcess = this.terminalProcesses.get(ws);
        if (terminalProcess) {
          terminalProcess.kill();
          this.terminalProcesses.delete(ws);
        }
      });

      ws.on('error', (error) => {
        console.error('[Coordinator] WebSocket error:', error);
      });
    });
  }

  private async handleMessage(ws: WebSocket, message: JSONRPCRequest | JSONRPCNotification) {
    const { method } = message;

    // Handle notifications (no response expected)
    if (!('id' in message)) {
      await this.handleNotification(ws, message as JSONRPCNotification);
      return;
    }

    // Handle requests (response required)
    const request = message as JSONRPCRequest;

    try {
      let result: unknown;

      switch (method) {
        case 'workspace/open':
          result = await this.handleOpenWorkspace(request.params as { projectPath: string });
          break;

        case 'workspace/select-folder':
          result = await this.handleSelectFolder();
          break;

        case 'fs/roots':
          result = await this.handleFsRoots();
          break;

        case 'fs/list-dirs':
          result = await this.handleFsListDirs(request.params as { path: string });
          break;

        case 'workspace/files':
          result = await this.handleListFiles(request.params as { relativePath?: string });
          break;

        case 'workspace/file':
          result = await this.handleReadFile(request.params as { filePath: string });
          break;

        case 'workspace/save-file':
          result = await this.handleSaveFile(request.params as { filePath: string; content: string; encoding?: string; lineEnding?: 'LF' | 'CRLF' });
          break;

        case 'workspace/rename':
          result = await this.handleRenameFile(request.params as { oldPath: string; newPath: string });
          break;

        case 'workspace/delete':
          result = await this.handleDeleteFile(request.params as { path: string });
          break;

        case 'workspace/duplicate':
          result = await this.handleDuplicateFile(request.params as { path: string; newPath: string });
          break;

        case 'workspace/create-folder': {
          const p = request.params as { path: string };
          await this.workspaceManager.createFolder(p.path);
          result = { success: true };
          break;
        }

        case 'workspace/file-base64':
          result = await this.workspaceManager.readFileBase64((request.params as { filePath: string }).filePath);
          break;

        case 'workspace/save-file-base64': {
          const p = request.params as { filePath: string; base64: string };
          await this.workspaceManager.saveFileBase64(p.filePath, p.base64);
          result = { success: true };
          break;
        }

        case 'terminal/command':
          result = await this.handleTerminalCommand(ws, request.params as TerminalCommandParams);
          break;

        case 'terminal/create':
          result = await this.handleTerminalCreate(ws, request.params as TerminalCreateParams);
          break;

        case 'terminal/input':
          result = await this.handleTerminalInput(ws, request.params as TerminalInputParams);
          break;

        case 'terminal/resize':
          result = await this.handleTerminalResize(ws, request.params as TerminalResizeParams);
          break;

        case 'terminal/destroy':
          result = await this.handleTerminalDestroy(ws);
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

    // Apply changes (simplified - assumes full document sync)
    for (const change of params.contentChanges) {
      doc.text = change.text;
    }

    doc.version = params.textDocument.version;
  }

  /**
   * Handle workspace open request
   */
  private async handleOpenWorkspace(params: { projectPath: string }): Promise<{ projectName: string; gitRoot: string | null }> {
    try {
      const result = await this.workspaceManager.openWorkspace(params.projectPath);
      return result;
    } catch (error) {
      console.error(`[Coordinator] Error opening workspace:`, error);
      throw error;
    }
  }

  private async handleSelectFolder(): Promise<{ path: string | null }> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        console.log('[Coordinator] Opening folder picker...');

        // Use pre-compiled folder-picker.exe (modern IFileOpenDialog, no terminal window)
        const pickerExe = path.join(__dirname, '..', 'bin', 'folder-picker.exe');

        let stdout: string;
        try {
          const result = await execFileAsync(pickerExe, [], {
            windowsHide: true, encoding: 'utf8', timeout: 5 * 60 * 1000,
          });
          stdout = result.stdout;
        } catch (err: any) {
          // exit code 1 = user cancelled
          if (err?.code === 1) {
            return { path: null };
          }
          throw err;
        }

        const out = String(stdout || '').trim();
        console.log('[Coordinator] Folder picker result:', out.length > 0 ? out : '(cancelled)');
        return { path: out.length > 0 ? out : null };
      }

      if (platform === 'darwin') {
        try {
          const { stdout } = await execFileAsync(
            'osascript',
            ['-e', 'POSIX path of (choose folder with prompt "Select workspace folder")'],
            { encoding: 'utf8' }
          );
          const out = String(stdout || '').trim().replace(/\/$/, '');
          return { path: out.length > 0 ? out : null };
        } catch (err) {
          // osascript uses non-zero exit when user cancels
          return { path: null };
        }
      }

      if (platform === 'linux') {
        try {
          const { stdout } = await execFileAsync(
            'zenity',
            ['--file-selection', '--directory', '--title=Select workspace folder'],
            { encoding: 'utf8' }
          );
          const out = String(stdout || '').trim();
          return { path: out.length > 0 ? out : null };
        } catch (err: any) {
          // exit code 1 = cancelled
          if (typeof err?.code === 'number') {
            return { path: null };
          }
          throw err;
        }
      }

      throw new Error(`Folder picker not supported on platform: ${platform}`);
    } catch (error) {
      console.error('[Coordinator] Error selecting folder:', error);
      throw error;
    }
  }

  private async handleFsRoots(): Promise<{ roots: Array<{ name: string; path: string }> }> {
    if (process.platform === 'win32') {
      const roots: Array<{ name: string; path: string }> = [];
      const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ';
      await Promise.all(
        letters.split('').map(async (letter) => {
          const drive = `${letter}:\\`;
          try {
            await fs.access(drive);
            roots.push({ name: `${letter}:`, path: drive });
          } catch {
            // ignore
          }
        })
      );
      roots.sort((a, b) => a.name.localeCompare(b.name));
      return { roots };
    }

    const home = os.homedir();
    const roots = [
      { name: '/', path: '/' },
      { name: 'Home', path: home },
    ];
    return { roots };
  }

  private async handleFsListDirs(params: { path: string }): Promise<{
    path: string;
    parent: string | null;
    dirs: Array<{ name: string; path: string }>;
  }> {
    const absPath = params.path;

    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const dirs: Array<{ name: string; path: string }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(absPath, entry.name);
      dirs.push({ name: entry.name, path: full });
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(absPath);
    const normalizedAbs = path.resolve(absPath);
    const normalizedParent = path.resolve(parent);

    return {
      path: absPath,
      parent: normalizedParent === normalizedAbs ? null : parent,
      dirs,
    };
  }

  /**
   * Handle file listing request
   */
  private async handleListFiles(params: { relativePath?: string }): Promise<{ files: FileTreeNode[] }> {
    const relativePath = params.relativePath || '.';

    try {
      const files = await this.workspaceManager.listFiles(relativePath);
      return { files };
    } catch (error) {
      console.error(`[Coordinator] Error listing files:`, error);
      throw error;
    }
  }

  /**
   * Handle file read request
   */
  private async handleReadFile(params: { filePath: string }): Promise<{ content: string; encoding: string; lineEnding: string }> {
    try {
      const result = await this.workspaceManager.readFile(params.filePath);
      return result;
    } catch (error) {
      console.error(`[Coordinator] Error reading file:`, error);
      throw error;
    }
  }

  /**
   * Handle file save request
   */
  private async handleSaveFile(params: {
    filePath: string;
    content: string;
    encoding?: string;
    lineEnding?: 'LF' | 'CRLF';
  }): Promise<{ success: boolean }> {
    try {
      await this.workspaceManager.saveFile(params.filePath, params.content, {
        encoding: params.encoding as BufferEncoding,
        lineEnding: params.lineEnding,
      });
      return { success: true };
    } catch (error) {
      console.error(`[Coordinator] Error saving file:`, error);
      throw error;
    }
  }

  /**
   * Handle file/directory rename request
   */
  private async handleRenameFile(params: { oldPath: string; newPath: string }): Promise<{ success: boolean }> {
    try {
      await this.workspaceManager.renameFile(params.oldPath, params.newPath);
      return { success: true };
    } catch (error) {
      console.error(`[Coordinator] Error renaming file:`, error);
      throw error;
    }
  }

  /**
   * Handle file/directory delete request
   */
  private async handleDeleteFile(params: { path: string }): Promise<{ success: boolean }> {
    try {
      await this.workspaceManager.deleteFile(params.path);
      return { success: true };
    } catch (error) {
      console.error(`[Coordinator] Error deleting file:`, error);
      throw error;
    }
  }

  /**
   * Handle file/directory duplicate request
   */
  private async handleDuplicateFile(params: { path: string; newPath: string }): Promise<{ success: boolean }> {
    try {
      await this.workspaceManager.duplicateFile(params.path, params.newPath);
      return { success: true };
    } catch (error) {
      console.error(`[Coordinator] Error duplicating file:`, error);
      throw error;
    }
  }

  private async handleTerminalCommand(ws: WebSocket, params: TerminalCommandParams): Promise<{ success: boolean; output: string; exitCode?: number }> {
    const { command, workingDirectory } = params;

    // Clean up any existing process for this client
    const existingProcess = this.terminalProcesses.get(ws);
    if (existingProcess) {
      existingProcess.kill();
      this.terminalProcesses.delete(ws);
    }

    return new Promise((resolve) => {
      // Create a real pseudo-terminal using node-pty
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

      const term = spawn(shell, [command], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workingDirectory || process.cwd(),
        env: process.env
      });

      this.terminalProcesses.set(ws, term);

      let output = '';

      term.onData((data) => {
        output += data;
        // Send real-time output to client
        this.sendNotification(ws, 'terminal/output', {
          output: data,
          error: false
        } as TerminalOutputParams);
      });

      term.onExit(({ exitCode }) => {
        resolve({
          success: exitCode === 0,
          output: output,
          exitCode,
        });

        // Clean up process reference
        this.terminalProcesses.delete(ws);
      });

      // For Windows PowerShell, we need to write the command to the terminal
      if (process.platform === 'win32') {
        term.write(command + '\r');
      }
    });
  }

  private async handleTerminalCreate(ws: WebSocket, params: TerminalCreateParams): Promise<{ success: boolean; sessionId: string }> {
    const { workingDirectory, shell } = params;

    // Clean up any existing session for this client
    const existingSession = this.terminalSessions.get(ws);
    if (existingSession) {
      existingSession.kill();
      this.terminalSessions.delete(ws);
    }

    return new Promise((resolve) => {
      // Create a persistent pseudo-terminal
      const shellName = shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash');

      const term = spawn(shellName, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workingDirectory || process.cwd(),
        env: process.env
      });

      this.terminalSessions.set(ws, term);

      const sessionId = `term_${Date.now()}`;

      term.onData((data) => {
        // Send real-time output to client
        this.sendNotification(ws, 'terminal/output', {
          output: data,
          error: false
        } as TerminalOutputParams);
      });

      term.onExit(({ exitCode, signal }) => {
        this.sendNotification(ws, 'terminal/exit', { code: exitCode, signal, sessionId });
        this.terminalSessions.delete(ws);
      });

      resolve({
        success: true,
        sessionId
      });
    });
  }

  private async handleTerminalInput(ws: WebSocket, params: TerminalInputParams): Promise<{ success: boolean }> {
    const { input } = params;
    const term = this.terminalSessions.get(ws);

    if (!term) {
      return { success: false };
    }

    try {
      term.write(input);
      return { success: true };
    } catch (error) {
      console.error('[Coordinator] Error writing to terminal:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false };
    }
  }

  private async handleTerminalResize(ws: WebSocket, params: TerminalResizeParams): Promise<{ success: boolean }> {
    const { cols, rows } = params;
    const term = this.terminalSessions.get(ws);

    if (!term) {
      return { success: false };
    }

    try {
      term.resize(cols, rows);
      return { success: true };
    } catch (error) {
      console.error('[Coordinator] Error resizing terminal:', error);
      return { success: false };
    }
  }

  private async handleTerminalDestroy(ws: WebSocket): Promise<{ success: boolean }> {
    const term = this.terminalSessions.get(ws);

    if (!term) {
      return { success: false };
    }

    try {
      term.kill();
      this.terminalSessions.delete(ws);
      return { success: true };
    } catch (error) {
      console.error('[Coordinator] Error destroying terminal:', error);
      return { success: false };
    }
  }

  private sendNotification(ws: WebSocket, method: string, params: unknown) {
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params
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

  close() {
    this.wss.close();
  }
}

// --- Entry point ---

const PORT = process.env.COORDINATOR_PORT ? parseInt(process.env.COORDINATOR_PORT) : 3001;

console.log('=== Cushion Coordinator ===');
console.log(`Starting server on port ${PORT}...`);

const server = new CoordinatorServer(PORT);

// Graceful shutdown
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
