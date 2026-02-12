/**
 * WebSocket client for communicating with the coordinator
 *
 * Implements LSP-style JSON-RPC protocol with auto-reconnect.
 */

import type {
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  FileTreeNode,
  FileChange,
  Provider,
  ConnectionState,
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

const INITIAL_RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 30_000;

export class CoordinatorClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private requestId = 0;
  private terminalOutputCallbacks: Array<(output: string, isError?: boolean) => void> = [];
  private filesChangedCallbacks: Array<(changes: FileChange[]) => void> = [];
  private fileChangedOnDiskCallbacks: Array<(filePath: string, mtime: number) => void> = [];

  // Reconnect state
  private _intentionalDisconnect = false;
  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _state: ConnectionState = 'disconnected';
  private _connectionStateCallbacks: Array<(state: ConnectionState) => void> = [];
  private _reconnectedCallbacks: Array<() => void> = [];

  constructor(private url: string = 'ws://localhost:3001') {}

  /**
   * Current connection state
   */
  get connectionState(): ConnectionState {
    return this._state;
  }

  /**
   * Connect to coordinator (initial connection)
   */
  async connect(): Promise<void> {
    this._intentionalDisconnect = false;
    this._reconnectAttempts = 0;
    this._cancelReconnect();
    await this._connectWebSocket();
    this._setState('connected');
  }

  /**
   * Disconnect from coordinator (intentional — no auto-reconnect)
   */
  disconnect() {
    this._intentionalDisconnect = true;
    this._cancelReconnect();
    this._rejectAllPending();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._setState('disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ---------------------------------------------------------------------------
  // Connection state events
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to connection state changes.
   * Returns an unsubscribe function.
   */
  onConnectionStateChanged(callback: (state: ConnectionState) => void): () => void {
    this._connectionStateCallbacks.push(callback);
    return () => {
      this._connectionStateCallbacks = this._connectionStateCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Subscribe to successful reconnection events.
   * Fired after the WebSocket reconnects (not on initial connect).
   * Returns an unsubscribe function.
   */
  onReconnected(callback: () => void): () => void {
    this._reconnectedCallbacks.push(callback);
    return () => {
      this._reconnectedCallbacks = this._reconnectedCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: WebSocket lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create a new WebSocket and wire up handlers.
   * Resolves when the socket opens, rejects on error before open.
   */
  private _connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      let opened = false;

      ws.onopen = () => {
        opened = true;
        this.ws = ws;
        resolve();
      };

      ws.onerror = () => {
        if (!opened) {
          reject(new Error('WebSocket connection failed'));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Route server→client notifications
          if (data.method && !('id' in data)) {
            this.handleNotification(data);
            return;
          }

          // Handle regular JSON-RPC responses
          this.handleResponse(data as JSONRPCResponse);
        } catch (error) {
          console.error('[CoordinatorClient] Error parsing response:', error);
        }
      };

      ws.onclose = () => {
        // If the socket that closed isn't our current one, ignore
        // (can happen during rapid reconnect cycles)
        if (this.ws !== ws) return;

        this.ws = null;
        this._rejectAllPending();
        this._setState('disconnected');

        if (!this._intentionalDisconnect) {
          this._startReconnect();
        }
      };
    });
  }

  /**
   * Start reconnection loop with exponential backoff.
   */
  private _startReconnect() {
    this._cancelReconnect();
    this._setState('reconnecting');

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, this._reconnectAttempts),
      MAX_RECONNECT_DELAY,
    );

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      this._reconnectAttempts++;

      try {
        await this._connectWebSocket();
        // Success
        this._reconnectAttempts = 0;
        this._setState('connected');
        this._emitReconnected();
      } catch {
        // Failed — try again (onclose won't fire for a connection that never opened)
        if (!this._intentionalDisconnect) {
          this._startReconnect();
        }
      }
    }, delay);
  }

  /**
   * Cancel any pending reconnect timer.
   */
  private _cancelReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /**
   * Reject all pending requests with a "Connection lost" error.
   */
  private _rejectAllPending() {
    const pending = Array.from(this.pendingRequests.values());
    this.pendingRequests.clear();
    for (const { reject } of pending) {
      try { reject(new Error('Connection lost')); } catch { /* caller may not have .catch */ }
    }
  }

  /**
   * Update connection state and notify subscribers.
   */
  private _setState(state: ConnectionState) {
    if (this._state === state) return;
    this._state = state;
    for (const cb of [...this._connectionStateCallbacks]) {
      try { cb(state); } catch (err) { console.error('[CoordinatorClient] State callback error:', err); }
    }
  }

  /**
   * Notify reconnected subscribers.
   */
  private _emitReconnected() {
    for (const cb of [...this._reconnectedCallbacks]) {
      try { cb(); } catch (err) { console.error('[CoordinatorClient] Reconnected callback error:', err); }
    }
  }

  // ---------------------------------------------------------------------------
  // JSON-RPC transport
  // ---------------------------------------------------------------------------

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
   * Route incoming server→client notifications
   */
  private handleNotification(data: JSONRPCNotification) {
    const safeForEach = <T extends unknown[]>(callbacks: Array<(...args: T) => void>, ...args: T) => {
      for (const cb of callbacks) {
        try { cb(...args); } catch (err) { console.error('[CoordinatorClient] Notification callback error:', err); }
      }
    };

    switch (data.method) {
      case 'terminal/output': {
        const { output, error } = data.params as { output: string; error?: boolean };
        safeForEach(this.terminalOutputCallbacks, output, error);
        break;
      }
      case 'workspace/filesChanged': {
        const { changes } = data.params as { changes: FileChange[] };
        safeForEach(this.filesChangedCallbacks, changes);
        break;
      }
      case 'workspace/fileChangedOnDisk': {
        const { filePath, mtime } = data.params as { filePath: string; mtime: number };
        safeForEach(this.fileChangedOnDiskCallbacks, filePath, mtime);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // LSP notifications
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Workspace RPCs
  // ---------------------------------------------------------------------------

  async openWorkspace(projectPath: string): Promise<{ projectName: string; gitRoot: string | null }> {
    return this.sendRequest<{ projectName: string; gitRoot: string | null }>('workspace/open', { projectPath });
  }

  async selectWorkspaceFolder(): Promise<{ path: string | null }> {
    return this.sendRequest<{ path: string | null }>('workspace/select-folder', {});
  }

  async listFsRoots(): Promise<{ roots: Array<{ name: string; path: string }> }> {
    return this.sendRequest<{ roots: Array<{ name: string; path: string }> }>('fs/roots', {});
  }

  async listFsDirs(absPath: string): Promise<{ path: string; parent: string | null; dirs: Array<{ name: string; path: string }> }> {
    return this.sendRequest<{ path: string; parent: string | null; dirs: Array<{ name: string; path: string }> }>('fs/list-dirs', { path: absPath });
  }

  async listFiles(relativePath?: string): Promise<{ files: FileTreeNode[] }> {
    return this.sendRequest<{ files: FileTreeNode[] }>('workspace/files', { relativePath });
  }

  async readFile(filePath: string): Promise<{ content: string; encoding: string; lineEnding: string }> {
    return this.sendRequest<{ content: string; encoding: string; lineEnding: string }>('workspace/file', { filePath });
  }

  async saveFile(filePath: string, content: string, options?: { encoding?: string; lineEnding?: 'LF' | 'CRLF' }): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/save-file', { filePath, content, ...options });
  }

  async renameFile(oldPath: string, newPath: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/rename', { oldPath, newPath });
  }

  async deleteFile(path: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/delete', { path });
  }

  async duplicateFile(path: string, newPath: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/duplicate', { path, newPath });
  }

  async createFolder(folderPath: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/create-folder', { path: folderPath });
  }

  async readFileBase64(filePath: string): Promise<{ base64: string; mimeType: string }> {
    return this.sendRequest<{ base64: string; mimeType: string }>('workspace/file-base64', { filePath });
  }

  async saveFileBase64(filePath: string, base64: string): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('workspace/save-file-base64', { filePath, base64 });
  }

  // ---------------------------------------------------------------------------
  // Terminal RPCs
  // ---------------------------------------------------------------------------

  async executeCommand(command: string, workingDirectory?: string): Promise<{ success: boolean; output: string; exitCode?: number }> {
    return this.sendRequest<{ success: boolean; output: string; exitCode?: number }>('terminal/command', { command, workingDirectory });
  }

  async createTerminal(workingDirectory?: string, shell?: string): Promise<{ success: boolean; sessionId: string }> {
    return this.sendRequest<{ success: boolean; sessionId: string }>('terminal/create', { workingDirectory, shell });
  }

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

  async resizeTerminal(cols: number, rows: number): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('terminal/resize', { cols, rows });
  }

  async destroyTerminal(): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('terminal/destroy', {});
  }

  // ---------------------------------------------------------------------------
  // Notification subscriptions
  // ---------------------------------------------------------------------------

  onTerminalOutput(callback: (output: string, isError?: boolean) => void) {
    this.terminalOutputCallbacks.push(callback);
  }

  onFilesChanged(callback: (changes: FileChange[]) => void): () => void {
    this.filesChangedCallbacks.push(callback);
    return () => {
      this.filesChangedCallbacks = this.filesChangedCallbacks.filter((cb) => cb !== callback);
    };
  }

  onFileChangedOnDisk(callback: (filePath: string, mtime: number) => void): () => void {
    this.fileChangedOnDiskCallbacks.push(callback);
    return () => {
      this.fileChangedOnDiskCallbacks = this.fileChangedOnDiskCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ---------------------------------------------------------------------------
  // Provider RPCs
  // ---------------------------------------------------------------------------

  async listProviders(): Promise<{ providers: Provider[]; connected: string[] }> {
    return this.sendRequest<{ providers: Provider[]; connected: string[] }>('provider/list', {});
  }

  async listProviderAuthMethods(): Promise<Record<string, Array<{ type: 'api' | 'oauth'; label: string }>>> {
    return this.sendRequest<Record<string, Array<{ type: 'api' | 'oauth'; label: string }>>>('provider/auth/methods', {});
  }

  async refreshProviders(): Promise<{ providers: Provider[]; connected: string[] }> {
    return this.sendRequest<{ providers: Provider[]; connected: string[] }>('provider/refresh', {});
  }

  async getPopularProviders(): Promise<{ ids: string[] }> {
    return this.sendRequest<{ ids: string[] }>('provider/popular', {});
  }

  async setProviderAuth(params: { providerID: string; apiKey: string }): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('provider/auth/set', params);
  }

  async removeProviderAuth(params: { providerID: string }): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('provider/auth/remove', params);
  }

  async authorizeOAuth(params: { providerID: string; method: number }): Promise<{ url: string; method: 'auto' | 'code'; instructions: string }> {
    return this.sendRequest<{ url: string; method: 'auto' | 'code'; instructions: string }>('provider/oauth/authorize', params);
  }

  async oauthCallback(params: { providerID: string; method: number; code?: string }): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>('provider/oauth/callback', params);
  }

  // ---------------------------------------------------------------------------
  // Ollama RPCs
  // ---------------------------------------------------------------------------

  async listOllamaModels(): Promise<{ models: any[]; running: boolean }> {
    return this.sendRequest<{ models: any[]; running: boolean }>('provider/ollama/list', {});
  }

  async pullOllamaModel(model: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; error?: string }>('provider/ollama/pull', { model });
  }

  async deleteOllamaModel(model: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; error?: string }>('provider/ollama/delete', { model });
  }

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
