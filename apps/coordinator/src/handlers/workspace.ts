import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { FileTreeNode } from '@cushion/types';
import type { WorkspaceManager } from '../workspace/manager.js';

const execFileAsync = promisify(execFile);

export async function handleOpenWorkspace(
  workspaceManager: WorkspaceManager,
  params: { projectPath: string }
): Promise<{ projectName: string; gitRoot: string | null }> {
  return workspaceManager.openWorkspace(params.projectPath);
}

export async function handleSelectFolder(
  binDir: string
): Promise<{ path: string | null }> {
  const platform = process.platform;

  if (platform === 'win32') {
    const pickerExe = path.join(binDir, 'folder-picker.exe');

    let stdout: string;
    try {
      const result = await execFileAsync(pickerExe, [], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 5 * 60 * 1000,
      });
      stdout = result.stdout;
    } catch (err: any) {
      if (err?.code === 1) {
        return { path: null };
      }
      throw err;
    }

    const out = String(stdout || '').trim();
    return { path: out.length > 0 ? out : null };
  }

  if (platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "Select workspace folder")'],
        { encoding: 'utf8' }
      );
      const out = String(stdout || '').trim().replace(/\/$/, '');
      return { path: out.length > 0 ? out : null };
    } catch {
      return { path: null };
    }
  }

  if (platform === 'linux') {
    try {
      const { stdout } = await execFileAsync(
        'zenity',
        ['--file-selection', '--directory', '--title=Select workspace folder'],
        { encoding: 'utf8' }
      );
      const out = String(stdout || '').trim();
      return { path: out.length > 0 ? out : null };
    } catch (err: any) {
      if (typeof err?.code === 'number') {
        return { path: null };
      }
      throw err;
    }
  }

  throw new Error(`Folder picker not supported on platform: ${platform}`);
}

export async function handleFsRoots(): Promise<{
  roots: Array<{ name: string; path: string }>;
}> {
  if (process.platform === 'win32') {
    const roots: Array<{ name: string; path: string }> = [];
    const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ';
    await Promise.all(
      letters.split('').map(async (letter) => {
        const drive = `${letter}:\\`;
        try {
          await fs.access(drive);
          roots.push({ name: `${letter}:`, path: drive });
        } catch {
          // ignore
        }
      })
    );
    roots.sort((a, b) => a.name.localeCompare(b.name));
    return { roots };
  }

  const home = os.homedir();
  return {
    roots: [
      { name: '/', path: '/' },
      { name: 'Home', path: home },
    ],
  };
}

export async function handleFsListDirs(params: { path: string }): Promise<{
  path: string;
  parent: string | null;
  dirs: Array<{ name: string; path: string }>;
}> {
  const absPath = params.path;

  const entries = await fs.readdir(absPath, { withFileTypes: true });
  const dirs: Array<{ name: string; path: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(absPath, entry.name);
    dirs.push({ name: entry.name, path: full });
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));

  const parent = path.dirname(absPath);
  const normalizedAbs = path.resolve(absPath);
  const normalizedParent = path.resolve(parent);

  return {
    path: absPath,
    parent: normalizedParent === normalizedAbs ? null : parent,
    dirs,
  };
}

export async function handleListFiles(
  workspaceManager: WorkspaceManager,
  params: { relativePath?: string }
): Promise<{ files: FileTreeNode[] }> {
  const relativePath = params.relativePath || '.';
  const files = await workspaceManager.listFiles(relativePath);
  return { files };
}

export async function handleReadFile(
  workspaceManager: WorkspaceManager,
  params: { filePath: string }
): Promise<{ content: string; encoding: string; lineEnding: string }> {
  return workspaceManager.readFile(params.filePath);
}

export async function handleSaveFile(
  workspaceManager: WorkspaceManager,
  params: {
    filePath: string;
    content: string;
    encoding?: string;
    lineEnding?: 'LF' | 'CRLF';
  }
): Promise<{ success: boolean }> {
  await workspaceManager.saveFile(params.filePath, params.content, {
    encoding: params.encoding as BufferEncoding,
    lineEnding: params.lineEnding,
  });
  return { success: true };
}

export async function handleRenameFile(
  workspaceManager: WorkspaceManager,
  params: { oldPath: string; newPath: string }
): Promise<{ success: boolean }> {
  await workspaceManager.renameFile(params.oldPath, params.newPath);
  return { success: true };
}

export async function handleDeleteFile(
  workspaceManager: WorkspaceManager,
  params: { path: string }
): Promise<{ success: boolean }> {
  await workspaceManager.deleteFile(params.path);
  return { success: true };
}

export async function handleDuplicateFile(
  workspaceManager: WorkspaceManager,
  params: { path: string; newPath: string }
): Promise<{ success: boolean }> {
  await workspaceManager.duplicateFile(params.path, params.newPath);
  return { success: true };
}

export async function handleCreateFolder(
  workspaceManager: WorkspaceManager,
  params: { path: string }
): Promise<{ success: boolean }> {
  await workspaceManager.createFolder(params.path);
  return { success: true };
}

export async function handleReadFileBase64(
  workspaceManager: WorkspaceManager,
  params: { filePath: string }
): Promise<{ base64: string; mimeType: string }> {
  return workspaceManager.readFileBase64(params.filePath);
}

export async function handleSaveFileBase64(
  workspaceManager: WorkspaceManager,
  params: { filePath: string; base64: string }
): Promise<{ success: boolean }> {
  await workspaceManager.saveFileBase64(params.filePath, params.base64);
  return { success: true };
}
