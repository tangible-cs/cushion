export interface ElectronAPI {
  platform: string;
  coordinatorInvoke: (method: string, params: unknown) => Promise<any>;
  onCoordinatorNotification: (channel: string, callback: (...args: any[]) => void) => () => void;
  updateTitleBarTheme: (colors: { color: string; symbolColor: string }) => Promise<void>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  notifyWorkspaceOpened: (path: string) => Promise<void>;
  onOpenWorkspace: (callback: (path: string) => void) => void;
  openOAuthWindow: (authUrl: string) => Promise<string | null>;
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
