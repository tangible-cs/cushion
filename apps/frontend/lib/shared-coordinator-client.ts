/**
 * Shared CoordinatorClient instance (IPC transport — always connected).
 */

import { CoordinatorClient } from './coordinator-client';

let sharedClient: CoordinatorClient | null = null;

/**
 * Get the shared CoordinatorClient instance.
 * Creates and connects it on first call; subsequent calls return the same instance.
 */
export async function getSharedCoordinatorClient(): Promise<CoordinatorClient> {
  if (sharedClient) return sharedClient;

  sharedClient = new CoordinatorClient();
  await sharedClient.connect();
  return sharedClient;
}

/**
 * Check if the shared client exists and is connected
 */
export function hasSharedClient(): boolean {
  return sharedClient !== null;
}

/**
 * Disconnect and clear the shared client.
 */
export function disconnectSharedClient(): void {
  if (sharedClient) {
    sharedClient.disconnect();
    sharedClient = null;
  }
}
