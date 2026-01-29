/**
 * Workspace Manager
 *
 * Handles file system operations for the current workspace
 */

import fs from 'fs/promises';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';
import type { FileTreeNode } from '@cushion/types';

/**
 * Workspace context (lightweight, local to coordinator)
 */
interface WorkspaceContext {
  projectPath: string;
}

/**
 * Workspace Manager class
 */
export class WorkspaceManager {
  private currentWorkspace: WorkspaceContext | null = null;

  /**
   * Open a workspace
   */
  async openWorkspace(projectPath: string): Promise<{
    projectName: string;
    gitRoot: string | null;
  }> {
    // Validate path exists
    try {
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }
    } catch (error) {
      throw new Error(`Invalid path: ${projectPath}`);
    }

    // Extract project name from path
    const projectName = path.basename(projectPath);

    // Check for git root
    const gitRoot = await this.findGitRoot(projectPath);

    // Set current workspace
    this.currentWorkspace = {
      projectPath,
    };

    return {
      projectName,
      gitRoot,
    };
  }

  /**
   * Get current workspace
   */
  getWorkspace(): WorkspaceContext | null {
    return this.currentWorkspace;
  }

  /**
   * Close workspace
   */
  closeWorkspace(): void {
    this.currentWorkspace = null;
  }

  /**
   * List files in a directory
   */
  async listFiles(relativePath: string = '.'): Promise<FileTreeNode[]> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolveFilePath(relativePath);
    const ignoredPatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      'coverage',
      '.nyc_output',
    ];

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const nodes: FileTreeNode[] = [];

      for (const entry of entries) {
        // Skip ignored patterns
        if (ignoredPatterns.includes(entry.name)) {
          continue;
        }

        const entryPath = path.join(relativePath, entry.name);
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

      // Sort: directories first, then alphabetically
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

  /**
   * Read a file
   */
  async readFile(
    relativePath: string
  ): Promise<{ content: string; encoding: string; lineEnding: string }> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolveFilePath(relativePath);

    // Validate path is within workspace
    this.validatePath(fullPath);

    try {
      // Read file
      const content = await fs.readFile(fullPath, 'utf-8');

      // Detect line ending
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

  /**
   * Save a file
   */
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

    const fullPath = this.resolveFilePath(relativePath);

    // Validate path is within workspace
    this.validatePath(fullPath);

    const { encoding = 'utf-8', lineEnding = 'LF' } = options || {};

    try {
      // Normalize line endings if needed
      let finalContent = content;
      if (lineEnding === 'CRLF' && !content.includes('\r\n')) {
        finalContent = content.replace(/\n/g, '\r\n');
      } else if (lineEnding === 'LF' && content.includes('\r\n')) {
        finalContent = content.replace(/\r\n/g, '\n');
      }

      // Write atomically
      await writeFileAtomic(fullPath, finalContent, { encoding });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Create parent directories if they don't exist
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        // Retry write
        await writeFileAtomic(fullPath, content, { encoding });
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${relativePath}`);
      } else if (error.code === 'ENOSPC') {
        throw new Error('Disk full');
      }
      throw error;
    }
  }

  /**
   * Create a directory
   */
  async createFolder(relativePath: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolveFilePath(relativePath);
    this.validatePath(fullPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  /**
   * Check if a file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    if (!this.currentWorkspace) {
      return false;
    }

    const fullPath = this.resolveFilePath(relativePath);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Rename a file or directory
   */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullOldPath = this.resolveFilePath(oldPath);
    const fullNewPath = this.resolveFilePath(newPath);

    // Validate both paths are within workspace
    this.validatePath(fullOldPath);
    this.validatePath(fullNewPath);

    try {
      // Check if old path exists
      await fs.access(fullOldPath);

      // Check if new path already exists
      try {
        await fs.access(fullNewPath);
        throw new Error(`Destination already exists: ${newPath}`);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }

      // Rename the file/directory
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

  /**
   * Delete a file or directory
   */
  async deleteFile(relativePath: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolveFilePath(relativePath);

    // Validate path is within workspace
    this.validatePath(fullPath);

    try {
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        // Remove directory recursively
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        // Remove file
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

  /**
   * Duplicate a file or directory
   */
  async duplicateFile(sourcePath: string, destPath: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullSourcePath = this.resolveFilePath(sourcePath);
    const fullDestPath = this.resolveFilePath(destPath);

    // Validate both paths are within workspace
    this.validatePath(fullSourcePath);
    this.validatePath(fullDestPath);

    try {
      const stats = await fs.stat(fullSourcePath);

      // Check if destination already exists
      try {
        await fs.access(fullDestPath);
        throw new Error(`Destination already exists: ${destPath}`);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }

      if (stats.isDirectory()) {
        // Copy directory recursively
        await fs.cp(fullSourcePath, fullDestPath, { recursive: true });
      } else {
        // Copy file
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

  /**
   * Read a file as base64 (for binary files like PDFs)
   */
  async readFileBase64(relativePath: string): Promise<{ base64: string; mimeType: string }> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolveFilePath(relativePath);
    this.validatePath(fullPath);

    const buffer = await fs.readFile(fullPath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(relativePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };
    return { base64, mimeType: mimeMap[ext] || 'application/octet-stream' };
  }

  /**
   * Save a file from base64 data (for binary files like PDFs)
   */
  async saveFileBase64(relativePath: string, base64: string): Promise<void> {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const fullPath = this.resolveFilePath(relativePath);
    this.validatePath(fullPath);

    const buffer = Buffer.from(base64, 'base64');
    await fs.writeFile(fullPath, buffer);
  }

  /**
   * Resolve relative path to absolute path
   */
  private resolveFilePath(relativePath: string): string {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    return path.join(this.currentWorkspace.projectPath, relativePath);
  }

  /**
   * Validate path is within workspace (prevent directory traversal)
   */
  private validatePath(fullPath: string): void {
    if (!this.currentWorkspace) {
      throw new Error('No workspace open');
    }

    const normalized = path.normalize(fullPath);
    const workspacePath = path.normalize(this.currentWorkspace.projectPath);

    if (!normalized.startsWith(workspacePath)) {
      throw new Error('Path outside workspace');
    }
  }

  /**
   * Detect line ending type
   */
  private detectLineEnding(content: string): 'LF' | 'CRLF' {
    const hasCRLF = content.includes('\r\n');

    if (hasCRLF) {
      return 'CRLF';
    }

    // Default to LF
    return 'LF';
  }

  /**
   * Find git root directory
   */
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

      // Move up one directory
      const parentPath = path.dirname(currentPath);

      // Reached root without finding .git
      if (parentPath === currentPath) {
        return null;
      }

      currentPath = parentPath;
    }
  }
}
