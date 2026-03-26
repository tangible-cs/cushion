import { ipcMain, dialog, type BrowserWindow } from 'electron';
import type {
  FileChange,
  RPCParams,
} from '@cushion/types';

import { WorkspaceManager } from './workspace-manager';
import { ConfigManager } from './config-manager';
import { ConfigWatcher } from './config-watcher';
import { DEFAULT_ALLOWED_EXTENSIONS } from './constants';
import { ensurePermissionDefaults } from './opencode-config';

import {
  handleOpenWorkspace,
  handleListFiles,
  handleListAllFiles,
  handleReadFile,
  handleSaveFile,
  handleRenameFile,
  handleDeleteFile,
  handleDuplicateFile,
  handleCreateFolder,
  handleReadFileBase64,
  handleReadFileBase64Chunk,
  handleSaveFileBase64,
} from './handlers/workspace';

import {
  handleConfigRead,
  handleConfigWrite,
} from './handlers/config';

import { handleSkillInstallZip } from './handlers/skill';
import { handleShellExec, handleLoginStart, handleLoginFinish } from './handlers/shell';
import {
  handleTrashRestore,
  handleTrashList,
  handleTrashPermanentDelete,
  handleTrashEmpty,
} from './handlers/trash';

let workspaceManager: WorkspaceManager;
let configManager: ConfigManager;
let configWatcher: ConfigWatcher;

async function loadFileFilter() {
  let respectGitignore = true;
  let extensions = DEFAULT_ALLOWED_EXTENSIONS;
  try {
    const { content } = await configManager.readConfig('settings.json');
    if (content) {
      const parsed = JSON.parse(content);
      if (typeof parsed.respectGitignore === 'boolean') {
        respectGitignore = parsed.respectGitignore;
      }
      if (Array.isArray(parsed.allowedExtensions)) {
        extensions = parsed.allowedExtensions;
      }
    }
  } catch {}
  if (respectGitignore) {
    await workspaceManager.loadGitignore();
  }
  workspaceManager.setFileFilter(respectGitignore, extensions);
}

export async function initCoordinator(mainWindow: BrowserWindow) {
  workspaceManager = new WorkspaceManager();
  configManager = new ConfigManager();
  configWatcher = new ConfigWatcher();
  configManager.setConfigWatcher(configWatcher);

  await ensurePermissionDefaults();

  workspaceManager.setOnFilesChanged((changes: FileChange[]) => {
    mainWindow.webContents.send('coordinator:workspace/filesChanged', { changes });
  });

  workspaceManager.setOnFileChangedOnDisk((filePath: string, mtime: number) => {
    mainWindow.webContents.send('coordinator:workspace/fileChangedOnDisk', { filePath, mtime });
  });

  configWatcher.setOnConfigChanged((file: string) => {
    if (file === 'settings.json') {
      loadFileFilter();
    }
    mainWindow.webContents.send('coordinator:config/changed', { file });
  });

  ipcMain.handle('coordinator:workspace/open', async (_event, params: RPCParams<'workspace/open'>) => {
    const result = await handleOpenWorkspace(workspaceManager, params);
    configManager.setWorkspacePath(params.projectPath);
    configWatcher.stop();
    configWatcher.start(params.projectPath);
    await loadFileFilter();
    return result;
  });

  ipcMain.handle('coordinator:workspace/select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { path: null };
    return { path: result.filePaths[0] };
  });

  ipcMain.handle('coordinator:workspace/files', async (_event, params: RPCParams<'workspace/files'>) => {
    return handleListFiles(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/allFiles', async () => {
    return handleListAllFiles(workspaceManager);
  });

  ipcMain.handle('coordinator:workspace/file', async (_event, params: RPCParams<'workspace/file'>) => {
    return handleReadFile(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/save-file', async (_event, params: RPCParams<'workspace/save-file'>) => {
    return handleSaveFile(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/rename', async (_event, params: RPCParams<'workspace/rename'>) => {
    return handleRenameFile(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/delete', async (_event, params: RPCParams<'workspace/delete'>) => {
    return handleDeleteFile(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/duplicate', async (_event, params: RPCParams<'workspace/duplicate'>) => {
    return handleDuplicateFile(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/create-folder', async (_event, params: RPCParams<'workspace/create-folder'>) => {
    return handleCreateFolder(workspaceManager, params);
  });

  ipcMain.handle('coordinator:trash/restore', async (_event, params: RPCParams<'trash/restore'>) => {
    return handleTrashRestore(workspaceManager, params);
  });

  ipcMain.handle('coordinator:trash/list', async () => {
    return handleTrashList(workspaceManager);
  });

  ipcMain.handle('coordinator:trash/permanent-delete', async (_event, params: RPCParams<'trash/permanent-delete'>) => {
    return handleTrashPermanentDelete(workspaceManager, params);
  });

  ipcMain.handle('coordinator:trash/empty', async () => {
    return handleTrashEmpty(workspaceManager);
  });

  ipcMain.handle('coordinator:workspace/file-base64', async (_event, params: RPCParams<'workspace/file-base64'>) => {
    return handleReadFileBase64(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/file-base64-chunk', async (_event, params: RPCParams<'workspace/file-base64-chunk'>) => {
    return handleReadFileBase64Chunk(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/save-file-base64', async (_event, params: RPCParams<'workspace/save-file-base64'>) => {
    return handleSaveFileBase64(workspaceManager, params);
  });

  ipcMain.handle('coordinator:config/read', async (_event, params: RPCParams<'config/read'>) => {
    return handleConfigRead(configManager, params);
  });

  ipcMain.handle('coordinator:config/write', async (_event, params: RPCParams<'config/write'>) => {
    return handleConfigWrite(configManager, params);
  });

  ipcMain.handle('coordinator:skill/install-zip', async (_event, params: RPCParams<'skill/install-zip'>) => {
    return handleSkillInstallZip(params);
  });

  ipcMain.handle('coordinator:shell/exec', async (_event, params: RPCParams<'shell/exec'>) => {
    return handleShellExec(params);
  });

  ipcMain.handle('coordinator:shell/login-start', async () => {
    return handleLoginStart();
  });

  ipcMain.handle('coordinator:shell/login-finish', async () => {
    return handleLoginFinish();
  });

}

export function stopCoordinator() {
  workspaceManager?.stopWatcher();
  configWatcher?.stop();
}
