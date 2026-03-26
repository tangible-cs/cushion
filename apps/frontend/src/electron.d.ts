export interface ElectronAPI {
  // Coordinator IPC bridge
  coordinatorInvoke: (method: string, params: unknown) => Promise<any>;
  coordinatorSend: (method: string, params: unknown) => void;
  onCoordinatorNotification: (channel: string, callback: (...args: any[]) => void) => () => void;

  // Title bar overlay theme sync
  updateTitleBarTheme: (colors: { color: string; symbolColor: string }) => Promise<void>;

  // Recent workspaces
  notifyWorkspaceOpened: (path: string) => Promise<void>;

  // Open workspace from OS
  onOpenWorkspace: (callback: (path: string) => void) => void;

  // MCP OAuth
  openOAuthWindow: (authUrl: string) => Promise<string | null>;

  // PDF export
  exportPdf: (data: {
    html: string;
    title: string;
    options: import('@cushion/types').PdfExportOptions;
  }) => Promise<{ success: boolean; path: string } | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
