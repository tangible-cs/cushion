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

import { DictationConfigManager } from './dictation-config';
import { PostProcessor } from './post-processor';
import { HotkeyManager } from './hotkey-manager';
import { SherpaModelManager } from './sherpa-model-manager';
import { SherpaManager } from './sherpa-manager';
import { SherpaBinaryManager } from './sherpa-binary-manager';

import {
  handleDictationListModels,
  handleDictationDownloadModel,
  handleDictationCancelDownload,
  handleDictationDeleteModel,
  handleDictationStartServer,
  handleDictationStopServer,
  handleDictationServerStatus,
  handleDictationTranscribe,
  handleDictationEnsureBinary,
  handleDictationBinaryStatus,
  handleDictationPostProcess,
  handleDictationConfigRead,
  handleDictationConfigWrite,
  handleDictationDictionaryAdd,
  handleDictationDictionaryRemove,
  handleDictationLearnCorrection,
  handleDictationUpdateHotkey,
} from './handlers/dictation';

let workspaceManager: WorkspaceManager;
let configManager: ConfigManager;
let configWatcher: ConfigWatcher;
let dictationConfigManager: DictationConfigManager;
let postProcessor: PostProcessor;
let hotkeyManager: HotkeyManager;
let sherpaModelManager: SherpaModelManager;
let sherpaManager: SherpaManager;
let sherpaBinaryManager: SherpaBinaryManager;

async function loadFileFilter() {
  let respectGitignore = true;
  let extensions = DEFAULT_ALLOWED_EXTENSIONS;
  let trashMethod: 'cushion' | 'system' = 'cushion';
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
      if (parsed.trashMethod === 'cushion' || parsed.trashMethod === 'system') {
        trashMethod = parsed.trashMethod;
      }
    }
  } catch {}
  if (respectGitignore) {
    await workspaceManager.loadGitignore();
  }
  workspaceManager.setFileFilter(respectGitignore, extensions);
  workspaceManager.setTrashMethod(trashMethod);
}

async function warmStartDictationServer() {
  const config = await dictationConfigManager.read();
  const model = config.selectedModel;
  if (!sherpaModelManager.isModelDownloaded(model)) return;
  const { available } = sherpaBinaryManager.isBinaryAvailable();
  if (!available) return;
  const modelDir = sherpaModelManager.getModelDir(model);
  await sherpaManager.start(model, modelDir);
}

export async function initCoordinator(mainWindow: BrowserWindow) {
  workspaceManager = new WorkspaceManager();
  configManager = new ConfigManager();
  configWatcher = new ConfigWatcher();
  configManager.setConfigWatcher(configWatcher);

  const notifyRenderer = (channel: string, data: unknown) => {
    mainWindow.webContents.send(`coordinator:${channel}`, data);
  };

  dictationConfigManager = new DictationConfigManager();
  await dictationConfigManager.init();
  postProcessor = new PostProcessor(dictationConfigManager);

  hotkeyManager = new HotkeyManager(notifyRenderer);
  try {
    const config = await dictationConfigManager.read();
    if (config.hotkey) hotkeyManager.register(config.hotkey);
  } catch {}

  sherpaModelManager = new SherpaModelManager(notifyRenderer);
  await sherpaModelManager.init();

  sherpaManager = new SherpaManager(notifyRenderer);
  await sherpaManager.init();

  sherpaBinaryManager = new SherpaBinaryManager(notifyRenderer);
  await sherpaBinaryManager.init();

  await ensurePermissionDefaults();

  warmStartDictationServer().catch((err) => {
    console.warn('[Coordinator] Dictation warm-start failed:', err?.message || err);
  });

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

  // Workspace handlers
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

  // Trash handlers
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

  // File base64 handlers
  ipcMain.handle('coordinator:workspace/file-base64', async (_event, params: RPCParams<'workspace/file-base64'>) => {
    return handleReadFileBase64(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/file-base64-chunk', async (_event, params: RPCParams<'workspace/file-base64-chunk'>) => {
    return handleReadFileBase64Chunk(workspaceManager, params);
  });

  ipcMain.handle('coordinator:workspace/save-file-base64', async (_event, params: RPCParams<'workspace/save-file-base64'>) => {
    return handleSaveFileBase64(workspaceManager, params);
  });

  // Config handlers
  ipcMain.handle('coordinator:config/read', async (_event, params: RPCParams<'config/read'>) => {
    return handleConfigRead(configManager, params);
  });

  ipcMain.handle('coordinator:config/write', async (_event, params: RPCParams<'config/write'>) => {
    const result = await handleConfigWrite(configManager, params);
    if (params.file === 'settings.json') {
      await loadFileFilter();
    }
    return result;
  });

  // Skill/shell handlers
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

  // --- Unified dictation handlers ---
  ipcMain.handle('coordinator:dictation/list-models', async () => {
    return handleDictationListModels(sherpaModelManager);
  });

  ipcMain.handle('coordinator:dictation/download-model', async (_event, params: RPCParams<'dictation/download-model'>) => {
    return handleDictationDownloadModel(sherpaModelManager, params);
  });

  ipcMain.handle('coordinator:dictation/cancel-download', async () => {
    return handleDictationCancelDownload(sherpaModelManager);
  });

  ipcMain.handle('coordinator:dictation/delete-model', async (_event, params: RPCParams<'dictation/delete-model'>) => {
    return handleDictationDeleteModel(sherpaModelManager, params);
  });

  ipcMain.handle('coordinator:dictation/start-server', async (_event, params: RPCParams<'dictation/start-server'>) => {
    return handleDictationStartServer(sherpaManager, sherpaModelManager, params);
  });

  ipcMain.handle('coordinator:dictation/stop-server', async () => {
    return handleDictationStopServer(sherpaManager);
  });

  ipcMain.handle('coordinator:dictation/server-status', async () => {
    return handleDictationServerStatus(sherpaManager);
  });

  ipcMain.handle('coordinator:dictation/transcribe', async (_event, params: RPCParams<'dictation/transcribe'>) => {
    return handleDictationTranscribe(sherpaManager, params);
  });

  ipcMain.handle('coordinator:dictation/ensure-binary', async () => {
    return handleDictationEnsureBinary(sherpaBinaryManager);
  });

  ipcMain.handle('coordinator:dictation/binary-status', async () => {
    return handleDictationBinaryStatus(sherpaBinaryManager);
  });

  ipcMain.handle('coordinator:dictation/post-process', async (_event, params: RPCParams<'dictation/post-process'>) => {
    return handleDictationPostProcess(postProcessor, params);
  });

  ipcMain.handle('coordinator:dictation/dictation-config-read', async () => {
    return handleDictationConfigRead(dictationConfigManager);
  });

  ipcMain.handle('coordinator:dictation/dictation-config-write', async (_event, params: RPCParams<'dictation/dictation-config-write'>) => {
    return handleDictationConfigWrite(dictationConfigManager, params);
  });

  ipcMain.handle('coordinator:dictation/dictionary-add', async (_event, params: RPCParams<'dictation/dictionary-add'>) => {
    return handleDictationDictionaryAdd(dictationConfigManager, params);
  });

  ipcMain.handle('coordinator:dictation/dictionary-remove', async (_event, params: RPCParams<'dictation/dictionary-remove'>) => {
    return handleDictationDictionaryRemove(dictationConfigManager, params);
  });

  ipcMain.handle('coordinator:dictation/learn-correction', async (_event, params: RPCParams<'dictation/learn-correction'>) => {
    return handleDictationLearnCorrection(dictationConfigManager, params);
  });

  ipcMain.handle('coordinator:dictation/update-hotkey', async (_event, params: RPCParams<'dictation/update-hotkey'>) => {
    return handleDictationUpdateHotkey(hotkeyManager, dictationConfigManager, params);
  });
}

export function stopCoordinator() {
  workspaceManager?.stopWatcher();
  configWatcher?.stop();
  hotkeyManager?.dispose();
  sherpaModelManager?.dispose();
  sherpaManager?.dispose();
}
