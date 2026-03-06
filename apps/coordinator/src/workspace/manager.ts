import fs from 'fs/promises';
import path from 'path';
import type { FileTreeNode, FileChange } from '@cushion/types';
import { IGNORED_PATTERNS } from './constants.js';
import { WorkspaceWatcher } from './watcher.js';
import { writeFileAtomicWithRetry, throwSaveFileError } from './atomic-write.js';

interface WorkspaceContext {
  projectPath: string;
}

const MAX_BASE64_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

export class WorkspaceManager {
  private currentWorkspace: WorkspaceContext | null = null;
  private watcher = new WorkspaceWatcher();

  setOnFilesChanged(cb: (changes: FileChange[]) => void) {
    this.watcher.setOnFilesChanged(cb);
  }

  setOnFileChangedOnDisk(cb: (filePath: string, mtime: number) => void) {
    this.watcher.setOnFileChangedOnDisk(cb);
  }

  async openWorkspace(projectPath: string): Promise<{
    projectName: string;
    gitRoot: string | null;
  }> {
    try {
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }
    } catch (error) {
      throw new Error(`Invalid path: ${projectPath}`);
    }

    await this.watcher.stop();

    const projectName = path.basename(projectPath);
    const gitRoot = await this.findGitRoot(projectPath);

    this.currentWorkspace = {
      projectPath,
    };

    this.watcher.start(projectPath);

    return {
      projectName,
      gitRoot,
    };
  }

  getWorkspace(): WorkspaceContext | null {
    return this.currentWorkspace;
  }

  async closeWorkspace(): Promise<void> {
    await this.watcher.stop();
    this.currentWorkspace = null;
  }

  async listFiles(relativePath: string = '.'): Promise<FileTreeNode[]> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolvePath(relativePath);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const nodes: FileTreeNode[] = [];

      for (const entry of entries) {
        if (IGNORED_PATTERNS.includes(entry.name)) {
          continue;
        }

        const entryPath = path.join(relativePath, entry.name).replace(/\\/g, '/');
        const isHidden = entry.name.startsWith('.');

        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            path: entryPath,
            type: 'directory',
            isHidden,
          });
        } else if (entry.isFile()) {
          const stats = await fs.stat(path.join(fullPath, entry.name));
          const extension = path.extname(entry.name).slice(1);

          nodes.push({
            name: entry.name,
            path: entryPath,
            type: 'file',
            size: stats.size,
            extension,
            isHidden,
          });
        }
      }

      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return nodes;
    } catch (error) {
      throw new Error(
        `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async readFile(
    relativePath: string
  ): Promise<{ content: string; encoding: string; lineEnding: string }> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolvePath(relativePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lineEnding = this.detectLineEnding(content);

      return {
        content,
        encoding: 'utf-8',
        lineEnding,
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${relativePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${relativePath}`);
      } else if (error.code === 'EISDIR') {
        throw new Error(`Cannot read directory as file: ${relativePath}`);
      }
      throw error;
    }
  }

  async saveFile(
    relativePath: string,
    content: string,
    options?: {
      encoding?: BufferEncoding;
      lineEnding?: 'LF' | 'CRLF';
    }
  ): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolvePath(relativePath);

    const { encoding = 'utf-8', lineEnding = 'LF' } = options || {};

    let finalContent = content;
    if (lineEnding === 'CRLF' && !content.includes('\r\n')) {
      finalContent = content.replace(/\n/g, '\r\n');
    } else if (lineEnding === 'LF' && content.includes('\r\n')) {
      finalContent = content.replace(/\r\n/g, '\n');
    }

    try {
      await writeFileAtomicWithRetry(fullPath, finalContent, encoding);
      return;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        throwSaveFileError(error, relativePath);
      }
    }

    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    try {
      await writeFileAtomicWithRetry(fullPath, finalContent, encoding);
    } catch (error) {
      throwSaveFileError(error, relativePath);
    }
  }

  async createFolder(relativePath: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolvePath(relativePath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  async fileExists(relativePath: string): Promise<boolean> {
    if (!this.currentWorkspace) {
      return false;
    }

    const fullPath = this.resolvePath(relativePath);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullOldPath = this.resolvePath(oldPath);
    const fullNewPath = this.resolvePath(newPath);

    try {
      await fs.access(fullOldPath);

      try {
        await fs.access(fullNewPath);
        throw new Error(`Destination already exists: ${newPath}`);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }

      await fs.rename(fullOldPath, fullNewPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${oldPath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied`);
      }
      throw error;
    }
  }

  async deleteFile(relativePath: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolvePath(relativePath);

    try {
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${relativePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${relativePath}`);
      }
      throw error;
    }
  }

  async duplicateFile(sourcePath: string, destPath: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullSourcePath = this.resolvePath(sourcePath);
    const fullDestPath = this.resolvePath(destPath);

    try {
      const stats = await fs.stat(fullSourcePath);

      try {
        await fs.access(fullDestPath);
        throw new Error(`Destination already exists: ${destPath}`);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }

      if (stats.isDirectory()) {
        await fs.cp(fullSourcePath, fullDestPath, { recursive: true });
      } else {
        await fs.copyFile(fullSourcePath, fullDestPath);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${sourcePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied`);
      }
      throw error;
    }
  }

  async readFileBase64(relativePath: string): Promise<{ base64: string; mimeType: string }> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolvePath(relativePath);

    const buffer = await fs.readFile(fullPath);
    const base64 = buffer.toString('base64');
    return { base64, mimeType: this.getMimeType(relativePath) };
  }

  async readFileBase64Chunk(
    relativePath: string,
    offset: number,
    length: number,
  ): Promise<{
    base64: string;
    mimeType: string;
    offset: number;
    bytesRead: number;
    totalBytes: number;
  }> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('Invalid chunk offset');
    }

    if (!Number.isInteger(length) || length <= 0) {
      throw new Error('Invalid chunk length');
    }

    const fullPath = this.resolvePath(relativePath);

    try {
      const stats = await fs.stat(fullPath);

      if (!stats.isFile()) {
        throw new Error(`Cannot read directory as file: ${relativePath}`);
      }

      if (offset >= stats.size) {
        return {
          base64: '',
          mimeType: this.getMimeType(relativePath),
          offset,
          bytesRead: 0,
          totalBytes: stats.size,
        };
      }

      const boundedLength = Math.min(length, MAX_BASE64_CHUNK_SIZE_BYTES);
      const bytesToRead = Math.min(boundedLength, stats.size - offset);
      const handle = await fs.open(fullPath, 'r');

      try {
        const buffer = Buffer.allocUnsafe(bytesToRead);
        const { bytesRead } = await handle.read(buffer, 0, bytesToRead, offset);
        const chunk = bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead);

        return {
          base64: chunk.toString('base64'),
          mimeType: this.getMimeType(relativePath),
          offset,
          bytesRead,
          totalBytes: stats.size,
        };
      } finally {
        await handle.close();
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${relativePath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${relativePath}`);
      }
      throw error;
    }
  }

  async saveFileBase64(relativePath: string, base64: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolvePath(relativePath);

    const buffer = Buffer.from(base64, 'base64');
    await fs.writeFile(fullPath, buffer);
  }

  async stopWatcher(): Promise<void> {
    await this.watcher.stop();
  }

  /**
   * Resolve a relative path to an absolute path and validate it stays
   * inside the workspace boundary.  Every file-system operation MUST go
   * through this method so traversal checks cannot be accidentally skipped.
   */
  private resolvePath(relativePath: string): string {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = path.resolve(
      this.currentWorkspace.projectPath,
      relativePath
    );

    let normalized = path.normalize(fullPath);
    let workspacePath = path.normalize(this.currentWorkspace.projectPath);

    if (process.platform === 'win32') {
      normalized = normalized.toLowerCase();
      workspacePath = workspacePath.toLowerCase();
    }

    const boundary = workspacePath.endsWith(path.sep)
      ? workspacePath
      : workspacePath + path.sep;

    if (normalized !== workspacePath && !normalized.startsWith(boundary)) {
      throw new Error('Path outside workspace');
    }

    return fullPath;
  }

  private detectLineEnding(content: string): 'LF' | 'CRLF' {
    return content.includes('\r\n') ? 'CRLF' : 'LF';
  }

  private getMimeType(relativePath: string): string {
    const ext = path.extname(relativePath).toLowerCase();
    return MIME_TYPES_BY_EXTENSION[ext] || 'application/octet-stream';
  }

  private async findGitRoot(startPath: string): Promise<string | null> {
    let currentPath = startPath;

    while (true) {
      const gitPath = path.join(currentPath, '.git');

      try {
        const stats = await fs.stat(gitPath);
        if (stats.isDirectory()) {
          return currentPath;
        }
      } catch {
        // .git not found, continue
      }

      const parentPath = path.dirname(currentPath);

      if (parentPath === currentPath) {
        return null;
      }

      currentPath = parentPath;
    }
  }
}
