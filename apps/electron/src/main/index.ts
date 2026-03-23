import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron';
import './pdf-export';
import { join } from 'path';
import windowStateKeeper from 'electron-window-state';
import { startCoordinator, stopCoordinator, getCoordinatorPort } from './coordinator';

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
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#262626',
      symbolColor: '#dadada',
      height: 40,
    },
    show: false,
  });

  mainWindowState.manage(mainWindow);

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (pendingOpenPath) {
      mainWindow?.webContents.send('open-workspace', pendingOpenPath);
      pendingOpenPath = undefined;
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/* IPC: dialog */
ipcMain.handle('dialog:selectFolder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('get-coordinator-port', () => {
  return getCoordinatorPort();
});

/* IPC: titlebar theme sync */
ipcMain.handle('titlebar:update-theme', (_event, colors: { color: string; symbolColor: string }) => {
  mainWindow?.setTitleBarOverlay(colors);
});

/* IPC: recent workspaces */
ipcMain.handle('workspace:opened', (_event, projectPath: string) => {
  app.addRecentDocument(projectPath);
});

/* Open workspace: macOS open-file */
app.on('open-file', (event, path) => {
  event.preventDefault();
  focusAndOpenWorkspace(path);
});

/* Open workspace: second-instance (Windows/Linux) */
app.on('second-instance', (_event, commandLine) => {
  const openPath = extractPathArg(commandLine.slice(1));
  if (openPath) focusAndOpenWorkspace(openPath);
});

app.whenReady().then(async () => {
  const cliPath = extractPathArg(process.argv.slice(1));
  if (cliPath) {
    pendingOpenPath = cliPath;
  }

  await startCoordinator();
  createWindow();

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
});
