/**
 * ConfigSync — reads/writes `.cushion/*.json` config files via the coordinator.
 *
 * Provides debounced writes (1 s per file) so rapid preference changes
 * don't flood the coordinator with write requests.
 */

import type { CoordinatorClient } from './coordinator-client';

const WRITE_DEBOUNCE_MS = 1_000;

export class ConfigSync {
  private pendingWrites = new Map<
    string,
    { data: unknown; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private client: CoordinatorClient) {}

  /**
   * Read a config file and parse as JSON.
   * Returns null if the file doesn't exist or contains invalid JSON.
   */
  async read<T>(file: string): Promise<T | null> {
    try {
      const { content, exists } = await this.client.readConfig(file);
      if (!exists || content === null) return null;
      return JSON.parse(content) as T;
    } catch (err) {
      console.warn(`[ConfigSync] Failed to read ${file}:`, err);
      return null;
    }
  }

  /**
   * Schedule a debounced write for a config file.
   * Calling again for the same file resets the timer.
   */
  scheduleWrite(file: string, data: unknown): void {
    const existing = this.pendingWrites.get(file);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      this.pendingWrites.delete(file);
      this._writeNow(file, data);
    }, WRITE_DEBOUNCE_MS);

    this.pendingWrites.set(file, { data, timer });
  }

  /**
   * Flush all pending writes immediately.
   * Safe to call during beforeunload — the underlying WS sends are synchronous.
   */
  async flush(): Promise<void> {
    const writes: Promise<void>[] = [];
    for (const [file, { data, timer }] of this.pendingWrites) {
      clearTimeout(timer);
      writes.push(this._writeNow(file, data));
    }
    this.pendingWrites.clear();
    await Promise.allSettled(writes);
  }

  /**
   * Cancel all pending timers. Call on teardown.
   */
  destroy(): void {
    for (const { timer } of this.pendingWrites.values()) {
      clearTimeout(timer);
    }
    this.pendingWrites.clear();
  }

  private async _writeNow(file: string, data: unknown): Promise<void> {
    try {
      await this.client.writeConfig(file, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`[ConfigSync] Failed to write ${file}:`, err);
    }
  }
}
