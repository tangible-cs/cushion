import type { FileTreeNode, TrashItem } from '@cushion/types';
import type { WorkspaceManager } from '../workspace-manager';

export async function handleOpenWorkspace(
  workspaceManager: WorkspaceManager,
  params: { projectPath: string }
): Promise<{ projectName: string; gitRoot: string | null }> {
  return workspaceManager.openWorkspace(params.projectPath);
}

export async function handleListFiles(
  workspaceManager: WorkspaceManager,
  params: { relativePath?: string }
): Promise<{ files: FileTreeNode[] }> {
  const relativePath = params.relativePath || '.';
  const files = await workspaceManager.listFiles(relativePath);
  return { files };
}

export async function handleListAllFiles(
  workspaceManager: WorkspaceManager
): Promise<{ paths: string[] }> {
  const paths = await workspaceManager.listAllFilePaths();
  return { paths };
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
  workspaceManager.updateWikiLinksAfterRename(params.oldPath, params.newPath).catch(() => {});
  return { success: true };
}

export async function handleDeleteFile(
  workspaceManager: WorkspaceManager,
  params: { path: string }
): Promise<{ success: boolean; trashItem?: TrashItem }> {
  const trashItem = await workspaceManager.deleteFile(params.path);
  return { success: true, trashItem };
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

export async function handleReadFileBase64Chunk(
  workspaceManager: WorkspaceManager,
  params: { filePath: string; offset: number; length: number }
): Promise<{
  base64: string;
  mimeType: string;
  offset: number;
  bytesRead: number;
  totalBytes: number;
}> {
  return workspaceManager.readFileBase64Chunk(params.filePath, params.offset, params.length);
}

export async function handleSaveFileBase64(
  workspaceManager: WorkspaceManager,
  params: { filePath: string; base64: string }
): Promise<{ success: boolean }> {
  await workspaceManager.saveFileBase64(params.filePath, params.base64);
  return { success: true };
}
