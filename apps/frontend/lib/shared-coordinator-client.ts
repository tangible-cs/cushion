/**
 * Shared CoordinatorClient instance
 *
 * This ensures only ONE WebSocket connection is created for the entire app,
 * preventing duplicate connections when multiple components mount.
 * The client handles reconnection internally — callers keep the same reference.
 */

import { CoordinatorClient } from './coordinator-client';

let sharedClient: CoordinatorClient | null = null;
let connectionPromise: Promise<void> | null = null;

/**
 * Get the shared CoordinatorClient instance.
 * Creates and connects it on first call; subsequent calls return the same instance.
 * The instance handles reconnection internally so the reference stays valid.
 */
export async function getSharedCoordinatorClient(): Promise<CoordinatorClient> {
  // Already have an instance — it reconnects internally, just return it
  if (sharedClient) {
    if (sharedClient.isConnected()) return sharedClient;

    // If initial connection is still in progress, wait for it
    if (connectionPromise) {
      await connectionPromise;
      return sharedClient!;
    }

    // Instance exists but is reconnecting (or disconnected and retrying).
    // Return it — callers subscribe to onReconnected / onConnectionStateChanged.
    return sharedClient;
  }

  // First-time: resolve URL (Electron IPC or default), create and connect
  const url = await CoordinatorClient.resolveUrl();
  sharedClient = new CoordinatorClient(url);

  connectionPromise = sharedClient.connect().then(() => {
    connectionPromise = null;
  }).catch((error) => {
    console.error('[SharedClient] Failed to connect:', error);
    connectionPromise = null;
    sharedClient = null;
    throw error;
  });

  await connectionPromise;
  return sharedClient!;
}

/**
 * Check if the shared client exists and is connected
 */
export function hasSharedClient(): boolean {
  return sharedClient !== null && sharedClient.isConnected();
}

/**
 * Disconnect and clear the shared client.
 * This is an intentional disconnect — stops auto-reconnect.
 */
export function disconnectSharedClient(): void {
  if (sharedClient) {
    sharedClient.disconnect();
    sharedClient = null;
    connectionPromise = null;
  }
}
