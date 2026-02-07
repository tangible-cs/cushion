/**
 * WebSocket client for communicating with the coordinator
 *
 * Implements LSP-style JSON-RPC protocol
 */

import type {
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  FileTreeNode,
  Provider,
} from '@cushion/types';

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params: unknown;
}

export class CoordinatorClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private requestId = 0;
  private terminalOutputCallbacks: Array<(output: string, isError?: boolean) => void> = [];

  constructor(private url: string = 'ws://localhost:3001') {}

  /**
   * Connect to coordinator
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = (error) => {
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Check if this is a terminal output notification
          if (data.method === 'terminal/output' && data.params) {
            const { output, error } = data.params as { output: string; error?: boolean };
            this.terminalOutputCallbacks.forEach(callback => {
              callback(output, error);
            });
          } else {
            // Handle regular JSON-RPC responses
            this.handleResponse(data as JSONRPCResponse);
          }
        } catch (error) {
          console.error('[CoordinatorClient] Error parsing response:', error);
        }
      };

      this.ws.onclose = () => {
        // Connection closed
      };
    });
  }

  /**
   * Disconnect from coordinator
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Send notification (no response expected)
   */
  private sendNotification(method: string, params: unknown) {
    if (!this.isConnected()) {
      throw new Error('Not connected to coordinator');
    }

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.ws!.send(JSON.stringify(notification));
  }

  /**
   * Send request and wait for response
   */
  private sendRequest<T>(method: string, params: unknown): Promise<T> {
    if (!this.isConnected()) {
      throw new Error('Not connected to coordinator');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.ws!.send(JSON.stringify(request));

      // Timeout after 120 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 120000);
    });
  }

  /**
   * Handle response from coordinator
   */
  private handleResponse(response: JSONRPCResponse) {
    const pending = this.pendingRequests.get(response.id);

    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message || response.error.data?.toString() || 'Unknown error'));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * LSP: textDocument/didOpen
   */
  didOpen(params: DidOpenTextDocumentParams) {
    this.sendNotification('textDocument/didOpen', params);
  }

  /**
   * LSP: textDocument/didChange
   */
  didChange(params: DidChangeTextDocumentParams) {
    this.sendNotification('textDocument/didChange', params);
  }

  /**
   * Workspace: open a workspace by path
   */
  async openWorkspace(projectPath: string): Promise<{ projectName: string; gitRoot: string | null }> {
    return this.sendRequest<{ projectName: string; gitRoot: string | null }>('workspace/open', { projectPath });
  }

  /**
   * Workspace: open a native folder picker and return selected path
   */
  async selectWorkspaceFolder(): Promise<{ path: string | null }> {
    return this.sendRequest<{ path: string | null }>('workspace/select-folder', {});
  }

  /**
   * FS: list filesystem roots (before a workspace is open)
   */
  async listFsRoots(): Promise<{ roots: Array<{ name: string; path: string }> }> {
    return this.sendRequest<{ roots: Array<{ name: string; path: string }> }>('fs/roots', {});
  }

  /**
   * FS: list sub-directories for an absolute path
   */
  async listFsDirs(absPath: string): Promise<{ path: string; parent: string | null; dirs: Array<{ name: string; path: string }> }> {
    return this.sendRequest<{ path: string; parent: string | null; dirs: Array<{ name: string; path: string }> }>('fs/list-dirs', { path: absPath });
  }

  /**
   * Workspace: list files in a directory
   */
  async listFiles(relativePath?: string): Promise<{ files: FileTreeNode[] }> {
    return this.sendRequest<{ files: FileTreeNode[] }>('workspace/files', { relativePath });
  }

  /**
   * Workspace: read a file
   */
  async readFile(filePath: string): Promise<{ content: string; encoding: string; lineEnding: string }> {
    return this.sendRequest<{ content: string; encoding: string; lineEnding: string }>('workspace/file', { filePath });
  }

  /**
   * Workspace: save a file
   */
  async saveFile(filePath: string, content: string, options?: { encoding?: string; lineEnding?: 'LF' | 'CRLF' }): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/save-file', { filePath, content, ...options });
  }

  /**
   * Workspace: rename a file or directory
   */
  async renameFile(oldPath: string, newPath: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/rename', { oldPath, newPath });
  }

  /**
   * Workspace: delete a file or directory
   */
  async deleteFile(path: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/delete', { path });
  }

  /**
   * Workspace: duplicate a file or directory
   */
  async duplicateFile(path: string, newPath: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/duplicate', { path, newPath });
  }

  /**
   * Workspace: create a folder
   */
  async createFolder(folderPath: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/create-folder', { path: folderPath });
  }

  /**
   * Workspace: read a file as base64 (for binary files like PDFs)
   */
  async readFileBase64(filePath: string): Promise<{ base64: string; mimeType: string }> {
    return this.sendRequest<{ base64: string; mimeType: string }>('workspace/file-base64', { filePath });
  }

  /**
   * Workspace: save a file as base64 (for binary files like PDFs)
   */
  async saveFileBase64(filePath: string, base64: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/save-file-base64', { filePath, base64 });
  }

  /**
   * Terminal: execute a system command
   */
  async executeCommand(command: string, workingDirectory?: string): Promise<{ success: boolean; output: string; exitCode?: number }> {
    return this.sendRequest<{ success: boolean; output: string; exitCode?: number }>('terminal/command', { command, workingDirectory });
  }

  /**
   * Terminal: create a persistent terminal session
   */
  async createTerminal(workingDirectory?: string, shell?: string): Promise<{ success: boolean; sessionId: string }> {
    return this.sendRequest<{ success: boolean; sessionId: string }>('terminal/create', { workingDirectory, shell });
  }

  /**
   * Terminal: send input to a terminal session
   */
  async sendTerminalInput(input: string): Promise<{ success: boolean }> {
    try {
      return await this.sendRequest<{ success: boolean }>('terminal/input', { input });
    } catch (error) {
      console.error('[CoordinatorClient] sendTerminalInput error:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Terminal: resize terminal
   */
  async resizeTerminal(cols: number, rows: number): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('terminal/resize', { cols, rows });
  }

  /**
   * Terminal: destroy terminal session
   */
  async destroyTerminal(): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('terminal/destroy', {});
  }

  /**
   * Register a terminal output notification handler
   * Multiple handlers can be registered and all will be called
   */
  onTerminalOutput(callback: (output: string, isError?: boolean) => void) {
    if (!this.ws) {
      throw new Error('WebSocket not connected');
    }

    this.terminalOutputCallbacks.push(callback);
  }

  /**
   * Provider: list all providers
   */
  async listProviders(): Promise<{ providers: Provider[]; connected: string[] }> {
    return this.sendRequest<{ providers: Provider[]; connected: string[] }>('provider/list', {});
  }

  /**
   * Provider: get auth methods for all providers
   */
  async listProviderAuthMethods(): Promise<Record<string, Array<{ type: 'api' | 'oauth'; label: string }>>> {
    return this.sendRequest<Record<string, Array<{ type: 'api' | 'oauth'; label: string }>>>('provider/auth/methods', {});
  }

  /**
   * Provider: refresh providers from models.dev
   */
  async refreshProviders(): Promise<{ providers: Provider[]; connected: string[] }> {
    return this.sendRequest<{ providers: Provider[]; connected: string[] }>('provider/refresh', {});
  }

  /**
   * Provider: get popular provider IDs
   */
  async getPopularProviders(): Promise<{ ids: string[] }> {
    return this.sendRequest<{ ids: string[] }>('provider/popular', {});
  }

  /**
   * Provider: set API key authentication
   */
  async setProviderAuth(params: { providerID: string; apiKey: string }): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('provider/auth/set', params);
  }

  /**
   * Provider: remove authentication
   */
  async removeProviderAuth(params: { providerID: string }): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('provider/auth/remove', params);
  }

  /**
   * Provider: authorize OAuth flow
   */
  async authorizeOAuth(params: { providerID: string; method: number }): Promise<{ url: string; method: 'auto' | 'code'; instructions: string }> {
    return this.sendRequest<{ url: string; method: 'auto' | 'code'; instructions: string }>('provider/oauth/authorize', params);
  }

  /**
   * Provider: OAuth callback
   */
  async oauthCallback(params: { providerID: string; method: number; code?: string }): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('provider/oauth/callback', params);
  }

  /**
   * Ollama: list installed models
   */
  async listOllamaModels(): Promise<{ models: any[]; running: boolean }> {
    return this.sendRequest<{ models: any[]; running: boolean }>('provider/ollama/list', {});
  }

  /**
   * Ollama: pull a model from library
   */
  async pullOllamaModel(model: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; error?: string }>('provider/ollama/pull', { model });
  }

  /**
    * Ollama: delete a model
    */
  async deleteOllamaModel(model: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; error?: string }>('provider/ollama/delete', { model });
  }

  /**
    * Ollama: write discovered models to OpenCode config
    */
  async writeOllamaConfig(params: { baseUrl?: string; models?: any[] }): Promise<{ success: boolean; message: string }> {
    return this.sendRequest<{ success: boolean; message: string }>('provider/ollama/write-config', params);
  }
}

let clientInstance: CoordinatorClient | null = null;
let connectionPromise: Promise<void> | null = null;

export function getCoordinatorClient(): CoordinatorClient {
  if (!clientInstance) {
    clientInstance = new CoordinatorClient();
  }
  return clientInstance;
}

export async function ensureCoordinatorConnection(): Promise<void> {
  const client = getCoordinatorClient();
  if (client.isConnected()) return;

  if (!connectionPromise) {
    connectionPromise = client.connect().finally(() => {
      connectionPromise = null;
    });
  }
  return connectionPromise;
}

