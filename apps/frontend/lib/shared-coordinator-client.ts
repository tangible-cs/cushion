/**
 * Shared CoordinatorClient instance
 *
 * This ensures only ONE WebSocket connection is created for the entire app,
 * preventing duplicate connections when multiple components mount.
 */

import { CoordinatorClient } from './coordinator-client';

let sharedClient: CoordinatorClient | null = null;
let connectionPromise: Promise<void> | null = null;

/**
 * Get the shared CoordinatorClient instance
 * Creates it if it doesn't exist, otherwise returns the existing one
 */
export async function getSharedCoordinatorClient(): Promise<CoordinatorClient> {
  // If we already have a connected client, return it
  if (sharedClient && sharedClient['ws']?.readyState === WebSocket.OPEN) {
    return sharedClient;
  }

  // If connection is in progress, wait for it
  if (connectionPromise) {
    await connectionPromise;
    return sharedClient!;
  }

  // Create new client and connect
  sharedClient = new CoordinatorClient();

  connectionPromise = sharedClient.connect().then(() => {
    console.log('[SharedClient] Shared coordinator client connected');
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
  return sharedClient !== null && sharedClient['ws']?.readyState === WebSocket.OPEN;
}

/**
 * Disconnect and clear the shared client
 * Use this when intentionally disconnecting (e.g., logout)
 */
export function disconnectSharedClient(): void {
  if (sharedClient) {
    console.log('[SharedClient] Disconnecting shared coordinator client');
    sharedClient = null;
    connectionPromise = null;
  }
}
