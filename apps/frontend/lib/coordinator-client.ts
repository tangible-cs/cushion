/**
 * WebSocket client for communicating with the coordinator
 *
 * Implements LSP-style JSON-RPC protocol with auto-reconnect.
 */

import type {
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  FileChange,
  ConnectionState,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  RPCServerNotificationParams,
  RPCMethodName,
  RPCParams,
  RPCResult,
} from '@cushion/types';

const INITIAL_RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 30_000;

export class CoordinatorClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private requestId = 0;
  private filesChangedCallbacks: Array<(changes: FileChange[]) => void> = [];
  private fileChangedOnDiskCallbacks: Array<(filePath: string, mtime: number) => void> = [];
  private configChangedCallbacks: Array<(file: string) => void> = [];

  // Reconnect state
  private _intentionalDisconnect = false;
  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _state: ConnectionState = 'disconnected';
  private _connectionStateCallbacks: Array<(state: ConnectionState) => void> = [];
  private _reconnectedCallbacks: Array<() => void> = [];

  constructor(private url: string = 'ws://localhost:3001') {}

  /**
   * Build the WebSocket URL, checking Electron IPC for a dynamic port first.
   */
  static async resolveUrl(): Promise<string> {
    if (window.electronAPI) {
      try {
        const port = await window.electronAPI.getCoordinatorPort();
        return `ws://localhost:${port}`;
      } catch {}
    }
    return 'ws://localhost:3001';
  }

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
      case 'workspace/filesChanged': {
        const { changes } = data.params as RPCServerNotificationParams<'workspace/filesChanged'>;
        safeForEach(this.filesChangedCallbacks, changes);
        break;
      }
      case 'workspace/fileChangedOnDisk': {
        const { filePath, mtime } = data.params as RPCServerNotificationParams<'workspace/fileChangedOnDisk'>;
        safeForEach(this.fileChangedOnDiskCallbacks, filePath, mtime);
        break;
      }
      case 'config/changed': {
        const { file } = data.params as RPCServerNotificationParams<'config/changed'>;
        safeForEach(this.configChangedCallbacks, file);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Generic typed RPC call
  // ---------------------------------------------------------------------------

  /**
   * Type-safe RPC call. Params and result types are inferred from RPCMethodMap.
   *
   * For methods with `params: void`, pass `{}` or omit the second argument.
   */
  call<M extends RPCMethodName>(
    method: M,
    ...args: RPCParams<M> extends void ? [] : [RPCParams<M>]
  ): Promise<RPCResult<M>> {
    return this.sendRequest(method, args[0] ?? {});
  }

  // ---------------------------------------------------------------------------
  // LSP notifications
  // ---------------------------------------------------------------------------

  didOpen(params: DidOpenTextDocumentParams) {
    this.sendNotification('textDocument/didOpen', params);
  }

  didChange(params: DidChangeTextDocumentParams) {
    this.sendNotification('textDocument/didChange', params);
  }

  // ---------------------------------------------------------------------------
  // Convenience wrappers (thin delegates to `call`)
  // ---------------------------------------------------------------------------

  openWorkspace(projectPath: string) {
    return this.call('workspace/open', { projectPath });
  }

  selectWorkspaceFolder() {
    return this.call('workspace/select-folder');
  }

  listFsRoots() {
    return this.call('fs/roots');
  }

  listFsDirs(absPath: string) {
    return this.call('fs/list-dirs', { path: absPath });
  }

  listFiles(relativePath?: string) {
    return this.call('workspace/files', { relativePath });
  }

  readFile(filePath: string) {
    return this.call('workspace/file', { filePath });
  }

  saveFile(filePath: string, content: string, options?: { encoding?: string; lineEnding?: 'LF' | 'CRLF' }) {
    return this.call('workspace/save-file', { filePath, content, ...options });
  }

  renameFile(oldPath: string, newPath: string) {
    return this.call('workspace/rename', { oldPath, newPath });
  }

  deleteFile(path: string) {
    return this.call('workspace/delete', { path });
  }

  duplicateFile(path: string, newPath: string) {
    return this.call('workspace/duplicate', { path, newPath });
  }

  createFolder(folderPath: string) {
    return this.call('workspace/create-folder', { path: folderPath });
  }

  readFileBase64(filePath: string) {
    return this.call('workspace/file-base64', { filePath });
  }

  readFileBase64Chunk(filePath: string, offset: number, length: number) {
    return this.call('workspace/file-base64-chunk', { filePath, offset, length });
  }

  saveFileBase64(filePath: string, base64: string) {
    return this.call('workspace/save-file-base64', { filePath, base64 });
  }

  readConfig(file: string) {
    return this.call('config/read', { file });
  }

  writeConfig(file: string, content: string) {
    return this.call('config/write', { file, content });
  }

  // ---------------------------------------------------------------------------
  // Notification subscriptions
  // ---------------------------------------------------------------------------

  onFilesChanged(callback: (changes: import('@cushion/types').FileChange[]) => void): () => void {
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

  onConfigChanged(callback: (file: string) => void): () => void {
    this.configChangedCallbacks.push(callback);
    return () => {
      this.configChangedCallbacks = this.configChangedCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ---------------------------------------------------------------------------
  // Provider RPCs
  // ---------------------------------------------------------------------------

  listProviders() {
    return this.call('provider/list');
  }

  listProviderAuthMethods() {
    return this.call('provider/auth/methods');
  }

  refreshProviders() {
    return this.call('provider/refresh');
  }

  getPopularProviders() {
    return this.call('provider/popular');
  }

  setProviderAuth(params: { providerID: string; apiKey: string }) {
    return this.call('provider/auth/set', params);
  }

  removeProviderAuth(params: { providerID: string }) {
    return this.call('provider/auth/remove', params);
  }

  syncProviders() {
    return this.call('provider/sync');
  }

  authorizeOAuth(params: RPCParams<'provider/oauth/authorize'>) {
    return this.call('provider/oauth/authorize', params);
  }

  oauthCallback(params: { providerID: string; method: number; code?: string }) {
    return this.call('provider/oauth/callback', params);
  }

}
