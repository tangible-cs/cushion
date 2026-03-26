/**
 * Coordinator client using Electron IPC transport.
 *
 * Replaces the previous WebSocket/JSON-RPC implementation.
 * IPC is always connected — no reconnect logic needed.
 */

import type {
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  FileChange,
  RPCMethodName,
  RPCParams,
  RPCResult,
} from '@cushion/types';

export class CoordinatorClient {
  private filesChangedCallbacks: Array<(changes: FileChange[]) => void> = [];
  private fileChangedOnDiskCallbacks: Array<(filePath: string, mtime: number) => void> = [];
  private configChangedCallbacks: Array<(file: string) => void> = [];
  private _cleanups: Array<() => void> = [];

  isConnected(): boolean {
    return true;
  }

  /**
   * Subscribe to IPC broadcast notifications from the main process.
   */
  connect(): Promise<void> {
    const api = window.electronAPI!;

    this._cleanups.push(
      api.onCoordinatorNotification('workspace/filesChanged', (data: { changes: FileChange[] }) => {
        for (const cb of this.filesChangedCallbacks) {
          try { cb(data.changes); } catch (err) { console.error('[CoordinatorClient] filesChanged callback error:', err); }
        }
      }),
    );

    this._cleanups.push(
      api.onCoordinatorNotification('workspace/fileChangedOnDisk', (data: { filePath: string; mtime: number }) => {
        for (const cb of this.fileChangedOnDiskCallbacks) {
          try { cb(data.filePath, data.mtime); } catch (err) { console.error('[CoordinatorClient] fileChangedOnDisk callback error:', err); }
        }
      }),
    );

    this._cleanups.push(
      api.onCoordinatorNotification('config/changed', (data: { file: string }) => {
        for (const cb of this.configChangedCallbacks) {
          try { cb(data.file); } catch (err) { console.error('[CoordinatorClient] configChanged callback error:', err); }
        }
      }),
    );

    return Promise.resolve();
  }

  disconnect() {
    for (const cleanup of this._cleanups) cleanup();
    this._cleanups = [];
  }

  // ---------------------------------------------------------------------------
  // Generic typed RPC call
  // ---------------------------------------------------------------------------

  call<M extends RPCMethodName>(
    method: M,
    ...args: RPCParams<M> extends void ? [] : [RPCParams<M>]
  ): Promise<RPCResult<M>> {
    return window.electronAPI!.coordinatorInvoke(method, args[0] ?? {});
  }

  // ---------------------------------------------------------------------------
  // LSP notifications
  // ---------------------------------------------------------------------------

  didOpen(params: DidOpenTextDocumentParams) {
    window.electronAPI!.coordinatorSend('textDocument/didOpen', params);
  }

  didChange(params: DidChangeTextDocumentParams) {
    window.electronAPI!.coordinatorSend('textDocument/didChange', params);
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

  listFiles(relativePath?: string) {
    return this.call('workspace/files', { relativePath });
  }

  listAllFiles() {
    return this.call('workspace/allFiles');
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
}
