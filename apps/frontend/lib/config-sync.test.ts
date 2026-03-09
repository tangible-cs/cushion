import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigSync } from './config-sync';

// ---------------------------------------------------------------------------
// Mock CoordinatorClient
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    readConfig: vi.fn(),
    writeConfig: vi.fn(),
  } as any; // only the methods ConfigSync uses
}

let client: ReturnType<typeof createMockClient>;
let sync: ConfigSync;

beforeEach(() => {
  vi.useFakeTimers();
  client = createMockClient();
  sync = new ConfigSync(client);
});

afterEach(() => {
  sync.destroy();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// read()
// ---------------------------------------------------------------------------

describe('read', () => {
  it('returns parsed JSON when file exists', async () => {
    client.readConfig.mockResolvedValue({
      content: '{"theme":"dark","baseFontSize":18}',
      exists: true,
    });

    const result = await sync.read<{ theme: string; baseFontSize: number }>('appearance.json');

    expect(result).toEqual({ theme: 'dark', baseFontSize: 18 });
    expect(client.readConfig).toHaveBeenCalledWith('appearance.json');
  });

  it('returns null when file does not exist', async () => {
    client.readConfig.mockResolvedValue({ content: null, exists: false });

    const result = await sync.read('settings.json');

    expect(result).toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    client.readConfig.mockResolvedValue({
      content: '{not valid json!!!',
      exists: true,
    });

    const result = await sync.read('settings.json');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    client.readConfig.mockRejectedValue(new Error('WebSocket closed'));

    const result = await sync.read('settings.json');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scheduleWrite()
// ---------------------------------------------------------------------------

describe('scheduleWrite', () => {
  it('writes after debounce period', async () => {
    client.writeConfig.mockResolvedValue({ success: true });

    sync.scheduleWrite('settings.json', { spellcheck: false });

    // Not written yet
    expect(client.writeConfig).not.toHaveBeenCalled();

    // Advance past debounce (1000ms)
    await vi.advanceTimersByTimeAsync(1000);

    expect(client.writeConfig).toHaveBeenCalledWith(
      'settings.json',
      JSON.stringify({ spellcheck: false }, null, 2)
    );
  });

  it('resets timer on repeated calls for same file', async () => {
    client.writeConfig.mockResolvedValue({ success: true });

    sync.scheduleWrite('settings.json', { v: 1 });
    await vi.advanceTimersByTimeAsync(500);

    sync.scheduleWrite('settings.json', { v: 2 });
    await vi.advanceTimersByTimeAsync(500);

    // Only 1000ms total but timer was reset at 500ms, so not fired yet
    expect(client.writeConfig).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    // Now 1000ms after the second call
    expect(client.writeConfig).toHaveBeenCalledTimes(1);
    expect(client.writeConfig).toHaveBeenCalledWith(
      'settings.json',
      JSON.stringify({ v: 2 }, null, 2)
    );
  });

  it('handles independent files separately', async () => {
    client.writeConfig.mockResolvedValue({ success: true });

    sync.scheduleWrite('settings.json', { a: 1 });
    await vi.advanceTimersByTimeAsync(500);

    sync.scheduleWrite('appearance.json', { theme: 'dark' });
    await vi.advanceTimersByTimeAsync(500);

    // settings.json should have fired (1000ms elapsed)
    expect(client.writeConfig).toHaveBeenCalledWith(
      'settings.json',
      JSON.stringify({ a: 1 }, null, 2)
    );

    await vi.advanceTimersByTimeAsync(500);

    // appearance.json should have fired (1000ms after its schedule)
    expect(client.writeConfig).toHaveBeenCalledWith(
      'appearance.json',
      JSON.stringify({ theme: 'dark' }, null, 2)
    );
  });

  it('does not throw on write failure', async () => {
    client.writeConfig.mockRejectedValue(new Error('disk full'));

    sync.scheduleWrite('settings.json', { a: 1 });
    await vi.advanceTimersByTimeAsync(1000);

    // Should not throw — error is caught and logged
    expect(client.writeConfig).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// flush()
// ---------------------------------------------------------------------------

describe('flush', () => {
  it('writes all pending files immediately', async () => {
    client.writeConfig.mockResolvedValue({ success: true });

    sync.scheduleWrite('settings.json', { a: 1 });
    sync.scheduleWrite('appearance.json', { theme: 'light' });

    await sync.flush();

    expect(client.writeConfig).toHaveBeenCalledTimes(2);
    expect(client.writeConfig).toHaveBeenCalledWith(
      'settings.json',
      JSON.stringify({ a: 1 }, null, 2)
    );
    expect(client.writeConfig).toHaveBeenCalledWith(
      'appearance.json',
      JSON.stringify({ theme: 'light' }, null, 2)
    );
  });

  it('clears pending writes after flush', async () => {
    client.writeConfig.mockResolvedValue({ success: true });

    sync.scheduleWrite('settings.json', { a: 1 });
    await sync.flush();

    client.writeConfig.mockClear();

    // Advance timers — nothing should fire (already flushed)
    await vi.advanceTimersByTimeAsync(2000);

    expect(client.writeConfig).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing is pending', async () => {
    await sync.flush();
    expect(client.writeConfig).not.toHaveBeenCalled();
  });

  it('handles partial write failures gracefully', async () => {
    client.writeConfig
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('fail'));

    sync.scheduleWrite('a.json', {});
    sync.scheduleWrite('b.json', {});

    // Should not throw even though one write fails
    await sync.flush();

    expect(client.writeConfig).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------

describe('destroy', () => {
  it('cancels all pending timers', async () => {
    client.writeConfig.mockResolvedValue({ success: true });

    sync.scheduleWrite('settings.json', { a: 1 });
    sync.destroy();

    await vi.advanceTimersByTimeAsync(2000);

    expect(client.writeConfig).not.toHaveBeenCalled();
  });

  it('can be called multiple times safely', () => {
    sync.destroy();
    sync.destroy();
    // No throw
  });
});
