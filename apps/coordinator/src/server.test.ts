import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CoordinatorServer } from './server';

const TEST_PORT = 9876;

/**
 * Helper: attempt a WebSocket connection with a given origin header.
 * Uses the ws library (not Bun's native WebSocket) so we can set custom headers.
 */
function connectWithOrigin(port: number, origin?: string): Promise<import('ws').default> {
  return new Promise((resolve, reject) => {
    import('ws').then(({ default: WS }) => {
      const headers: Record<string, string> = {};
      if (origin) headers['Origin'] = origin;

      const ws = new WS(`ws://localhost:${port}`, { headers });

      ws.on('open', () => resolve(ws));
      ws.on('error', (err: Error) => reject(err));
    });
  });
}

// ---------------------------------------------------------------------------
// Origin enforcement — verifyClient rejects bad / missing origins
// ---------------------------------------------------------------------------

describe('CoordinatorServer origin enforcement (explicit allowedOrigins)', () => {
  let server: CoordinatorServer;

  beforeEach(() => {
    server = new CoordinatorServer(TEST_PORT, ['http://localhost:3000']);
  });

  afterEach(() => {
    server.close();
  });

  test('rejects connection with no origin header', async () => {
    await expect(connectWithOrigin(TEST_PORT)).rejects.toThrow();
  });

  test('rejects connection with wrong origin', async () => {
    await expect(connectWithOrigin(TEST_PORT, 'http://evil.com')).rejects.toThrow();
  });

  test('rejects connection with similar-but-wrong origin', async () => {
    await expect(connectWithOrigin(TEST_PORT, 'http://localhost:3001')).rejects.toThrow();
  });

  test('accepts connection with correct origin', async () => {
    const ws = await connectWithOrigin(TEST_PORT, 'http://localhost:3000');
    expect(ws.readyState).toBe(1);
    ws.close();
  });
});

describe('CoordinatorServer multiple allowed origins', () => {
  let server: CoordinatorServer;

  beforeEach(() => {
    server = new CoordinatorServer(TEST_PORT + 1, [
      'http://localhost:3000',
      'http://localhost:4000',
    ]);
  });

  afterEach(() => {
    server.close();
  });

  test('accepts any of the configured origins', async () => {
    const ws1 = await connectWithOrigin(TEST_PORT + 1, 'http://localhost:3000');
    expect(ws1.readyState).toBe(1);
    ws1.close();

    const ws2 = await connectWithOrigin(TEST_PORT + 1, 'http://localhost:4000');
    expect(ws2.readyState).toBe(1);
    ws2.close();
  });

  test('still rejects unlisted origins', async () => {
    await expect(connectWithOrigin(TEST_PORT + 1, 'http://localhost:5000')).rejects.toThrow();
  });
});

describe('CoordinatorServer no origin restriction (default)', () => {
  let server: CoordinatorServer;

  beforeEach(() => {
    // No allowedOrigins passed — accepts any connection
    server = new CoordinatorServer(TEST_PORT + 2);
  });

  afterEach(() => {
    server.close();
  });

  test('accepts connection with no origin header', async () => {
    const ws = await connectWithOrigin(TEST_PORT + 2);
    expect(ws.readyState).toBe(1);
    ws.close();
  });

  test('accepts connection with any origin', async () => {
    const ws = await connectWithOrigin(TEST_PORT + 2, 'http://anything.example.com');
    expect(ws.readyState).toBe(1);
    ws.close();
  });
});
