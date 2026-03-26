import fs from 'fs/promises';
import path from 'path';
import { watch, type FSWatcher } from 'chokidar';
import type { Ignore } from 'ignore';
import type { FileChange } from '@cushion/types';
import { IGNORED_PATTERNS, DEFAULT_ALLOWED_EXTENSIONS } from './constants.js';

const WATCHER_ONLY_IGNORED = ['.cushion'];
const WATCHER_WARN_DIR_THRESHOLD = 2500;
const WATCHER_WARN_ENTRY_THRESHOLD = 25000;
const IS_WINDOWS = process.platform === 'win32';

function normalizePathSeparators(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

function normalizeForComparison(inputPath: string): string {
  const normalized = normalizePathSeparators(inputPath);
  return IS_WINDOWS ? normalized.toLowerCase() : normalized;
}

export function createIgnoredPathMatcher(projectPath: string): (watchPath: string) => boolean {
  const ignoredSegmentSet = new Set(
    [...IGNORED_PATTERNS, ...WATCHER_ONLY_IGNORED].map((segment) =>
      IS_WINDOWS ? segment.toLowerCase() : segment
    )
  );

  const workspaceRoot = normalizeForComparison(path.resolve(projectPath));
  const workspaceRootPrefix = workspaceRoot.endsWith('/') ? workspaceRoot : `${workspaceRoot}/`;

  return (watchPath: string): boolean => {
    if (!watchPath) {
      return false;
    }

    const normalizedWatchPath = normalizeForComparison(watchPath);
    if (normalizedWatchPath === workspaceRoot) {
      return false;
    }

    let relativePath = '';
    if (normalizedWatchPath.startsWith(workspaceRootPrefix)) {
      relativePath = normalizedWatchPath.slice(workspaceRootPrefix.length);
    } else {
      const fallbackRelativePath = normalizeForComparison(path.relative(projectPath, watchPath));
      if (
        fallbackRelativePath === '' ||
        fallbackRelativePath === '.' ||
        fallbackRelativePath.startsWith('..')
      ) {
        return false;
      }
      relativePath = fallbackRelativePath;
    }

    const segments = relativePath.split('/').filter(Boolean);
    for (const segment of segments) {
      if (ignoredSegmentSet.has(segment)) {
        return true;
      }
    }

    return false;
  };
}

export class WorkspaceWatcher {
  private watcher: FSWatcher | null = null;
  private pendingChanges: FileChange[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private onFilesChanged: ((changes: FileChange[]) => void) | null = null;
  private onFileChangedOnDisk: ((filePath: string, mtime: number) => void) | null = null;
  private respectGitignore = true;
  private allowedExtensions: Set<string> = new Set(
    DEFAULT_ALLOWED_EXTENSIONS.map((e) => e.toLowerCase())
  );
  private gitignore: Ignore | null = null;
  private projectPath: string | null = null;

  setFileFilter(respectGitignore: boolean, extensions: string[], gitignore: Ignore | null) {
    this.respectGitignore = respectGitignore;
    this.allowedExtensions = new Set(extensions.map((e) => e.toLowerCase()));
    this.gitignore = gitignore;
  }

  private isFileAllowed(absPath: string): boolean {
    if (this.respectGitignore && this.gitignore && this.projectPath) {
      const relative = path.relative(this.projectPath, absPath).replace(/\\/g, '/');
      if (this.gitignore.ignores(relative)) return false;
    }
    if (this.allowedExtensions.size === 0) return true;
    const ext = path.extname(absPath).toLowerCase();
    return this.allowedExtensions.has(ext);
  }

  setOnFilesChanged(cb: (changes: FileChange[]) => void) {
    this.onFilesChanged = cb;
  }

  setOnFileChangedOnDisk(cb: (filePath: string, mtime: number) => void) {
    this.onFileChangedOnDisk = cb;
  }

  start(projectPath: string) {
    this.projectPath = projectPath;
    const ignored = createIgnoredPathMatcher(projectPath);

    this.watcher = watch(projectPath, {
      ignored,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    const enqueue = (type: FileChange['type'], absPath: string, isDirectory?: boolean) => {
      if (!this.watcher) return;
      const relative = path.relative(projectPath, absPath).replace(/\\/g, '/');
      this.pendingChanges.push({ type, path: relative, ...(isDirectory && { isDirectory }) });
      this.scheduleFlush();
    };

    this.watcher
      .on('add', (p) => { if (this.isFileAllowed(p)) enqueue('created', p); })
      .on('addDir', (p) => enqueue('created', p, true))
      .on('change', (p) => { if (this.isFileAllowed(p)) this.handleExternalChange(projectPath, p); })
      .on('unlink', (p) => { if (this.isFileAllowed(p)) enqueue('deleted', p); })
      .on('unlinkDir', (p) => enqueue('deleted', p, true))
      .on('ready', () => this.logWatcherLoad(projectPath))
      .on('error', (err) => console.error('[Watcher] Error:', err));
  }

  /**
   * Handle an external file modification.
   * Enqueues a 'modified' change for the tree AND fires onFileChangedOnDisk
   * so the server can notify the client about open-file conflicts.
   */
  private async handleExternalChange(projectPath: string, absPath: string) {
    if (!this.watcher) return;
    const relative = path.relative(projectPath, absPath).replace(/\\/g, '/');

    this.pendingChanges.push({ type: 'modified', path: relative });
    this.scheduleFlush();

    if (this.onFileChangedOnDisk) {
      try {
        const stat = await fs.stat(absPath);
        this.onFileChangedOnDisk(relative, stat.mtimeMs);
      } catch {
        // File may have been deleted between change and stat
      }
    }
  }

  private scheduleFlush() {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.flushChanges();
    }, 300);
  }

  private flushChanges() {
    this.debounceTimer = null;
    if (this.pendingChanges.length === 0) return;

    const changes = this.pendingChanges;
    this.pendingChanges = [];

    if (this.onFilesChanged) {
      this.onFilesChanged(changes);
    }
  }

  private logWatcherLoad(projectPath: string) {
    if (!this.watcher) {
      return;
    }

    const watched = this.watcher.getWatched();
    const dirCount = Object.keys(watched).length;
    const entryCount = Object.values(watched).reduce((total, entries) => total + entries.length, 0);

    console.log(
      `[Watcher] Ready for "${projectPath}" (watchedDirs=${dirCount}, watchedEntries=${entryCount})`
    );

    if (dirCount >= WATCHER_WARN_DIR_THRESHOLD || entryCount >= WATCHER_WARN_ENTRY_THRESHOLD) {
      console.warn(
        `[Watcher] High watch load detected (watchedDirs=${dirCount}, watchedEntries=${entryCount}). ` +
          'Consider narrowing workspace scope or expanding ignore rules.'
      );
    }
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.flushChanges();

    if (this.watcher) {
      const w = this.watcher;
      this.watcher = null;
      await w.close();
    }
  }
}
