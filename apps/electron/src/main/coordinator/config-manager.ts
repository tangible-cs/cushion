import fs from 'fs/promises';
import path from 'path';
import { writeFileAtomicWithRetry } from './atomic-write';
import type { ConfigWatcher } from './config-watcher';

const CONFIG_DIR_NAME = '.cushion';

const GITIGNORE_CONTENT = `# Workspace layout changes frequently (device-specific)
workspace.json
`;

export class ConfigManager {
  private workspacePath: string | null = null;
  private configWatcher: ConfigWatcher | null = null;
  private gitignoreCreated = false;

  /**
   * Link a ConfigWatcher for self-write suppression.
   */
  setConfigWatcher(watcher: ConfigWatcher) {
    this.configWatcher = watcher;
  }

  /**
   * Update the workspace path. Called when a workspace is opened.
   */
  setWorkspacePath(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.gitignoreCreated = false;
  }

  /**
   * Clear workspace path. Called when workspace is closed.
   */
  clearWorkspacePath() {
    this.workspacePath = null;
    this.gitignoreCreated = false;
  }

  /**
   * Read a config file from `.cushion/`. Returns null content for missing files.
   * Permission errors are logged and treated as missing files to avoid crashes.
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
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        console.warn(`[ConfigManager] Permission denied reading ${filename}, treating as missing`);
        return { content: null, exists: false };
      }
      throw error;
    }
  }

  /**
   * Write a config file to `.cushion/`. Auto-creates the directory.
   * Permission errors are logged but don't crash (read-only filesystem).
   */
  async writeConfig(filename: string, content: string): Promise<void> {
    this.ensureWorkspace();
    this.validateConfigFilename(filename);

    try {
      await this.ensureConfigDir();
    } catch (error: any) {
      if (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'EROFS') {
        console.warn(`[ConfigManager] Cannot create .cushion/ directory (read-only?), skipping write of ${filename}`);
        return;
      }
      throw error;
    }

    this.configWatcher?.suppressNext(filename);
    const filePath = path.join(this.configDir, filename);
    await writeFileAtomicWithRetry(filePath, content, 'utf-8');
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
    await this.ensureGitignore();
  }

  private async ensureGitignore(): Promise<void> {
    if (this.gitignoreCreated) return;
    this.gitignoreCreated = true;

    const gitignorePath = path.join(this.configDir, '.gitignore');
    try {
      await fs.access(gitignorePath);
      // Already exists — don't overwrite
    } catch {
      await fs.writeFile(gitignorePath, GITIGNORE_CONTENT, 'utf-8');
    }
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

}
