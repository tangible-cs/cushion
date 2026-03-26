import { CoordinatorClient } from './coordinator-client';

let sharedClient: CoordinatorClient | null = null;

export async function getSharedCoordinatorClient(): Promise<CoordinatorClient> {
  if (sharedClient) return sharedClient;

  sharedClient = new CoordinatorClient();
  await sharedClient.connect();
  return sharedClient;
}

export function disconnectSharedClient(): void {
  if (sharedClient) {
    sharedClient.disconnect();
    sharedClient = null;
  }
}
