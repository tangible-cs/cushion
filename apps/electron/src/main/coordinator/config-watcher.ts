import path from 'path';
import { watch, type FSWatcher } from 'chokidar';

const CONFIG_DIR_NAME = '.cushion';
const DEBOUNCE_MS = 500;
const SELF_WRITE_SUPPRESS_MS = 2_000;

export class ConfigWatcher {
  private watcher: FSWatcher | null = null;
  private onConfigChanged: ((file: string) => void) | null = null;
  private pendingFiles = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressions = new Map<string, number>();

  setOnConfigChanged(cb: (file: string) => void) {
    this.onConfigChanged = cb;
  }

  suppressNext(filename: string) {
    this.suppressions.set(filename, Date.now());
  }

  start(workspacePath: string) {
    this.stop();

    const configDir = path.join(workspacePath, CONFIG_DIR_NAME);

    this.watcher = watch(path.join(configDir, '*.json'), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher
      .on('add', (p) => this.enqueue(configDir, p))
      .on('change', (p) => this.enqueue(configDir, p))
      .on('error', (err) => console.error('[ConfigWatcher] Error:', err));
  }

  stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.flush();
    this.pendingFiles.clear();
    this.suppressions.clear();

    if (this.watcher) {
      const w = this.watcher;
      this.watcher = null;
      w.close().catch(() => {});
    }
  }

  private enqueue(configDir: string, absPath: string) {
    const filename = path.basename(absPath);

    const suppressedAt = this.suppressions.get(filename);
    if (suppressedAt && Date.now() - suppressedAt < SELF_WRITE_SUPPRESS_MS) {
      this.suppressions.delete(filename);
      return;
    }
    this.suppressions.delete(filename);

    this.pendingFiles.add(filename);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flush();
    }, DEBOUNCE_MS);
  }

  private flush() {
    if (this.pendingFiles.size === 0) return;
    const files = Array.from(this.pendingFiles);
    this.pendingFiles.clear();

    if (this.onConfigChanged) {
      for (const file of files) {
        this.onConfigChanged(file);
      }
    }
  }
}
