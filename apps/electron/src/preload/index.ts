import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  getCoordinatorPort: () => ipcRenderer.invoke('get-coordinator-port'),
  updateTitleBarTheme: (colors: { color: string; symbolColor: string }) =>
    ipcRenderer.invoke('titlebar:update-theme', colors),
  notifyWorkspaceOpened: (path: string) => ipcRenderer.invoke('workspace:opened', path),
  onOpenWorkspace: (callback: (path: string) => void) => {
    ipcRenderer.on('open-workspace', (_event, path) => callback(path));
  },
  exportPdf: (data: { html: string; title: string; options: unknown }) =>
    ipcRenderer.invoke('export:pdf', data),
});
