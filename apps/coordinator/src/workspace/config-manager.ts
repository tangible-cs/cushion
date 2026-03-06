import fs from 'fs/promises';
import path from 'path';
import { writeFileAtomicWithRetry } from './atomic-write.js';

const CONFIG_DIR_NAME = '.cushion';
const SNIPPETS_DIR_NAME = 'snippets';

export class ConfigManager {
  private workspacePath: string | null = null;

  /**
   * Update the workspace path. Called when a workspace is opened.
   */
  setWorkspacePath(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Clear workspace path. Called when workspace is closed.
   */
  clearWorkspacePath() {
    this.workspacePath = null;
  }

  /**
   * Read a config file from `.cushion/`. Returns null content for missing files.
   */
  async readConfig(filename: string): Promise<{ content: string | null; exists: boolean }> {
    this.ensureWorkspace();
    this.validateConfigFilename(filename);

    const filePath = path.join(this.configDir, filename);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { content, exists: true };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { content: null, exists: false };
      }
      throw error;
    }
  }

  /**
   * Write a config file to `.cushion/`. Auto-creates the directory.
   */
  async writeConfig(filename: string, content: string): Promise<void> {
    this.ensureWorkspace();
    this.validateConfigFilename(filename);

    await this.ensureConfigDir();
    const filePath = path.join(this.configDir, filename);
    await writeFileAtomicWithRetry(filePath, content, 'utf-8');
  }

  /**
   * List CSS snippet filenames in `.cushion/snippets/`.
   */
  async listSnippets(): Promise<string[]> {
    this.ensureWorkspace();

    const snippetsDir = path.join(this.configDir, SNIPPETS_DIR_NAME);

    try {
      const entries = await fs.readdir(snippetsDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith('.css'))
        .map((e) => e.name)
        .sort();
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read a CSS snippet from `.cushion/snippets/`.
   */
  async readSnippet(name: string): Promise<string> {
    this.ensureWorkspace();
    this.validateSnippetName(name);

    const filePath = path.join(this.configDir, SNIPPETS_DIR_NAME, name);

    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Snippet not found: ${name}`);
      }
      throw error;
    }
  }

  /**
   * Write a CSS snippet to `.cushion/snippets/`.
   */
  async writeSnippet(name: string, content: string): Promise<void> {
    this.ensureWorkspace();
    this.validateSnippetName(name);

    const snippetsDir = path.join(this.configDir, SNIPPETS_DIR_NAME);
    await fs.mkdir(snippetsDir, { recursive: true });
    const filePath = path.join(snippetsDir, name);
    await writeFileAtomicWithRetry(filePath, content, 'utf-8');
  }

  /**
   * Delete a CSS snippet from `.cushion/snippets/`.
   */
  async deleteSnippet(name: string): Promise<void> {
    this.ensureWorkspace();
    this.validateSnippetName(name);

    const filePath = path.join(this.configDir, SNIPPETS_DIR_NAME, name);

    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Snippet not found: ${name}`);
      }
      throw error;
    }
  }

  // -- Internals --

  private get configDir(): string {
    return path.join(this.workspacePath!, CONFIG_DIR_NAME);
  }

  private ensureWorkspace(): void {
    if (!this.workspacePath) {
      throw new Error('No workspace open');
    }
  }

  private async ensureConfigDir(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
  }

  /**
   * Validate config filename: must be a plain `.json` filename with no path separators.
   */
  private validateConfigFilename(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Invalid config filename');
    }
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      throw new Error('Invalid config filename: path traversal not allowed');
    }
    if (!name.endsWith('.json')) {
      throw new Error('Invalid config filename: must end with .json');
    }
  }

  /**
   * Validate snippet name: must be a plain `.css` filename with no path separators.
   */
  private validateSnippetName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Invalid snippet name');
    }
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      throw new Error('Invalid snippet name: path traversal not allowed');
    }
    if (!name.endsWith('.css')) {
      throw new Error('Invalid snippet name: must end with .css');
    }
  }
}
