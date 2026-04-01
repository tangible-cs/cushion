import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron';
import './pdf-export';
import { join } from 'path';

const isLinux = process.platform === 'linux';

if (isLinux) {
  app.disableHardwareAcceleration();
}
import windowStateKeeper from 'electron-window-state';
import { initCoordinator, stopCoordinator } from './coordinator/ipc-router';
import { startOpenCodeServer, stopOpenCodeServer } from './coordinator/opencode-server';

const iconExt = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
const iconPath = app.isPackaged
  ? join(process.resourcesPath, iconExt)
  : join(__dirname, '../../build', iconExt);

let mainWindow: BrowserWindow | null = null;

function extractPathArg(args: string[]): string | undefined {
  return args.find((arg) => !arg.startsWith('-') && arg !== process.execPath && arg !== '.');
}

function focusAndOpenWorkspace(path: string) {
  if (!mainWindow) {
    pendingOpenPath = path;
    return;
  }
  mainWindow.webContents.send('open-workspace', path);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let pendingOpenPath: string | undefined;

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 820,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 800,
    minHeight: 600,
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(isLinux
      ? {}
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#262626',
            symbolColor: '#dadada',
            height: 40,
          },
        }),
    show: false,
  });

  mainWindowState.manage(mainWindow);

  if (isLinux) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setAutoHideMenuBar(true);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (pendingOpenPath) {
      mainWindow?.webContents.send('open-workspace', pendingOpenPath);
      pendingOpenPath = undefined;
    }
  });
}

function loadRenderer() {
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow!.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow!.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('titlebar:update-theme', (_event, colors: { color: string; symbolColor: string }) => {
  if (!isLinux) mainWindow?.setTitleBarOverlay(colors);
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());

ipcMain.handle('workspace:opened', (_event, projectPath: string) => {
  app.addRecentDocument(projectPath);
});

app.on('open-file', (event, path) => {
  event.preventDefault();
  focusAndOpenWorkspace(path);
});

app.on('second-instance', (_event, commandLine) => {
  const openPath = extractPathArg(commandLine.slice(1));
  if (openPath) focusAndOpenWorkspace(openPath);
});

const OAUTH_CALLBACK_ORIGIN = 'http://127.0.0.1:19876';
const OAUTH_CALLBACK_PATH = '/mcp/oauth/callback';

ipcMain.handle('oauth:openWindow', (_event, authUrl: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const oauthWin = new BrowserWindow({
      width: 600,
      height: 700,
      parent: mainWindow ?? undefined,
      modal: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    let resolved = false;
    const finish = (code: string | null) => {
      if (resolved) return;
      resolved = true;
      resolve(code);
      setImmediate(() => { if (!oauthWin.isDestroyed()) oauthWin.close(); });
    };

    const isCallbackUrl = (url: string) =>
      url.startsWith(`${OAUTH_CALLBACK_ORIGIN}${OAUTH_CALLBACK_PATH}`);

    oauthWin.webContents.on('will-redirect', (e, url) => {
      if (isCallbackUrl(url)) {
        e.preventDefault();
        finish(new URL(url).searchParams.get('code'));
      }
    });

    oauthWin.webContents.on('will-navigate', (e, url) => {
      if (isCallbackUrl(url)) {
        e.preventDefault();
        finish(new URL(url).searchParams.get('code'));
      }
    });

    oauthWin.on('closed', () => finish(null));

    try {
      const parsed = new URL(authUrl);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        finish(null);
        return;
      }
    } catch {
      finish(null);
      return;
    }
    oauthWin.loadURL(authUrl);
  });
});

app.whenReady().then(async () => {
  const cliPath = extractPathArg(process.argv.slice(1));
  if (cliPath) {
    pendingOpenPath = cliPath;
  }

  createWindow();
  await startOpenCodeServer();
  await initCoordinator(mainWindow!);
  loadRenderer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopCoordinator();
  stopOpenCodeServer();
});
