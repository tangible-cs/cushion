export interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  getCoordinatorPort: () => Promise<number>;

  // Title bar overlay theme sync
  updateTitleBarTheme: (colors: { color: string; symbolColor: string }) => Promise<void>;

  // Recent workspaces
  notifyWorkspaceOpened: (path: string) => Promise<void>;

  // Open workspace from OS
  onOpenWorkspace: (callback: (path: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
