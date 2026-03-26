import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  coordinatorInvoke: (method: string, params: unknown) =>
    ipcRenderer.invoke(`coordinator:${method}`, params),
  onCoordinatorNotification: (channel: string, callback: (...args: any[]) => void) => {
    const ipcChannel = `coordinator:${channel}`;
    const handler = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(ipcChannel, handler);
    return () => ipcRenderer.removeListener(ipcChannel, handler);
  },

  updateTitleBarTheme: (colors: { color: string; symbolColor: string }) =>
    ipcRenderer.invoke('titlebar:update-theme', colors),

  notifyWorkspaceOpened: (path: string) => ipcRenderer.invoke('workspace:opened', path),

  onOpenWorkspace: (callback: (path: string) => void) => {
    ipcRenderer.on('open-workspace', (_event, path) => callback(path));
  },

  exportPdf: (data: { html: string; title: string; options: unknown }) =>
    ipcRenderer.invoke('export:pdf', data),

  openOAuthWindow: (authUrl: string) =>
    ipcRenderer.invoke('oauth:openWindow', authUrl) as Promise<string | null>,
});
