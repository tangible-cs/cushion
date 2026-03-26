import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Coordinator IPC bridge
  coordinatorInvoke: (method: string, params: unknown) =>
    ipcRenderer.invoke(`coordinator:${method}`, params),
  coordinatorSend: (method: string, params: unknown) =>
    ipcRenderer.send(`coordinator:${method}`, params),
  onCoordinatorNotification: (channel: string, callback: (...args: any[]) => void) => {
    const ipcChannel = `coordinator:${channel}`;
    const handler = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(ipcChannel, handler);
    return () => ipcRenderer.removeListener(ipcChannel, handler);
  },

  // Title bar overlay theme sync
  updateTitleBarTheme: (colors: { color: string; symbolColor: string }) =>
    ipcRenderer.invoke('titlebar:update-theme', colors),

  // Recent workspaces
  notifyWorkspaceOpened: (path: string) => ipcRenderer.invoke('workspace:opened', path),

  // Open workspace from OS
  onOpenWorkspace: (callback: (path: string) => void) => {
    ipcRenderer.on('open-workspace', (_event, path) => callback(path));
  },

  // PDF export
  exportPdf: (data: { html: string; title: string; options: unknown }) =>
    ipcRenderer.invoke('export:pdf', data),

  // MCP OAuth
  openOAuthWindow: (authUrl: string) =>
    ipcRenderer.invoke('oauth:openWindow', authUrl) as Promise<string | null>,
});
