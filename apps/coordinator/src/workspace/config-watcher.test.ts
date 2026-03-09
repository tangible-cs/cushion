import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigWatcher } from './config-watcher';

/**
 * These tests verify the ConfigWatcher's debounce, suppression, and lifecycle
 * logic by calling the internal `enqueue` method directly (via a subclass).
 *
 * Real chokidar integration (file events on disk) is covered by manual tests
 * in test_notes.md, since chokidar's behavior in short-lived test processes
 * on Windows is unreliable.
 */

// Expose the private `enqueue` and `flush` for testing
class TestableConfigWatcher extends ConfigWatcher {
  simulateFileChange(filename: string) {
    // Call enqueue with a fake configDir — the method only uses path.basename(absPath)
    // so we can pass the filename directly as if it were an absolute path
    (this as any).enqueue('/fake/.cushion', `/fake/.cushion/${filename}`);
  }

  flushNow() {
    (this as any).flush();
  }

  getPendingCount(): number {
    return (this as any).pendingFiles.size;
  }
}

let watcher: TestableConfigWatcher;

beforeEach(() => {
  watcher = new TestableConfigWatcher();
});

afterEach(() => {
  watcher.stop();
});

// ---------------------------------------------------------------------------
// Self-write suppression
// ---------------------------------------------------------------------------

describe('suppressNext', () => {
  test('suppresses a single change event', () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.suppressNext('settings.json');
    watcher.simulateFileChange('settings.json');
    watcher.flushNow();

    expect(changes).toEqual([]);
  });

  test('suppression is consumed after one use', () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.suppressNext('settings.json');
    watcher.simulateFileChange('settings.json'); // consumed
    watcher.simulateFileChange('settings.json'); // not suppressed
    watcher.flushNow();

    expect(changes).toEqual(['settings.json']);
  });

  test('does not suppress a different file', () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.suppressNext('settings.json');
    watcher.simulateFileChange('appearance.json');
    watcher.flushNow();

    expect(changes).toEqual(['appearance.json']);
  });

  test('suppression expires after 2 seconds', async () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.suppressNext('settings.json');

    // Wait longer than SELF_WRITE_SUPPRESS_MS (2000ms)
    await new Promise((r) => setTimeout(r, 2100));

    watcher.simulateFileChange('settings.json');
    watcher.flushNow();

    expect(changes).toEqual(['settings.json']);
  });

  test('multiple files can be suppressed independently', () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.suppressNext('settings.json');
    watcher.suppressNext('appearance.json');

    watcher.simulateFileChange('settings.json');
    watcher.simulateFileChange('appearance.json');
    watcher.simulateFileChange('hotkeys.json'); // not suppressed
    watcher.flushNow();

    expect(changes).toEqual(['hotkeys.json']);
  });
});

// ---------------------------------------------------------------------------
// Debounce & batching
// ---------------------------------------------------------------------------

describe('debounce', () => {
  test('enqueue adds to pending set', () => {
    watcher.simulateFileChange('settings.json');
    expect(watcher.getPendingCount()).toBe(1);
  });

  test('duplicate file changes are deduplicated', () => {
    watcher.simulateFileChange('settings.json');
    watcher.simulateFileChange('settings.json');
    watcher.simulateFileChange('settings.json');
    expect(watcher.getPendingCount()).toBe(1);
  });

  test('different files accumulate in pending set', () => {
    watcher.simulateFileChange('settings.json');
    watcher.simulateFileChange('appearance.json');
    watcher.simulateFileChange('hotkeys.json');
    expect(watcher.getPendingCount()).toBe(3);
  });

  test('flush fires callback for each pending file', () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.simulateFileChange('settings.json');
    watcher.simulateFileChange('appearance.json');
    watcher.flushNow();

    expect(changes.sort()).toEqual(['appearance.json', 'settings.json']);
  });

  test('flush clears pending set', () => {
    watcher.setOnConfigChanged(() => {});

    watcher.simulateFileChange('settings.json');
    watcher.flushNow();

    expect(watcher.getPendingCount()).toBe(0);
  });

  test('flush is a no-op when nothing is pending', () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.flushNow();

    expect(changes).toEqual([]);
  });

  test('debounce timer fires after 500ms', async () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.simulateFileChange('settings.json');

    // Not yet fired
    expect(changes).toEqual([]);

    await new Promise((r) => setTimeout(r, 600));

    expect(changes).toEqual(['settings.json']);
  });
});

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------

describe('callback', () => {
  test('no callback set — flush does not throw', () => {
    watcher.simulateFileChange('settings.json');
    // No callback set, should not throw
    expect(() => watcher.flushNow()).not.toThrow();
  });

  test('callback receives correct filenames', () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.simulateFileChange('chat.json');
    watcher.flushNow();

    expect(changes).toEqual(['chat.json']);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe('lifecycle', () => {
  test('stop clears pending and suppressions', () => {
    watcher.suppressNext('settings.json');
    watcher.simulateFileChange('appearance.json');

    watcher.stop();

    expect(watcher.getPendingCount()).toBe(0);
  });

  test('stop flushes before clearing', () => {
    const changes: string[] = [];
    watcher.setOnConfigChanged((file) => changes.push(file));

    watcher.simulateFileChange('settings.json');
    watcher.stop();

    // stop() calls flush() first, so the pending change should have been emitted
    expect(changes).toEqual(['settings.json']);
  });

  test('stop can be called multiple times safely', () => {
    watcher.stop();
    watcher.stop();
    // No throw
  });
});
