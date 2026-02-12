export * from '../../../opencode/packages/sdk/js/dist/v2/gen/types.gen';

import { createClient } from '../../../opencode/packages/sdk/js/dist/v2/gen/client/client.gen';
import type { Config } from '../../../opencode/packages/sdk/js/dist/v2/gen/client/types.gen';
import { OpencodeClient } from '../../../opencode/packages/sdk/js/dist/v2/gen/sdk.gen';

export { OpencodeClient };
export type { Config as OpencodeClientConfig };

export function createOpencodeClient(config?: Config & { directory?: string }) {
  if (!config?.fetch) {
    // @hey-api/client-fetch uses non-standard `timeout` property on Request
    const customFetch: typeof fetch = (input, init) => {
      if (input instanceof Request) {
        (input as Request & { timeout?: boolean }).timeout = false;
      }
      return fetch(input, init);
    };
    config = {
      ...config,
      fetch: customFetch,
    };
  }

  if (config?.directory) {
    const isNonASCII = /[^\x00-\x7F]/.test(config.directory);
    const encodedDirectory = isNonASCII ? encodeURIComponent(config.directory) : config.directory;
    config.headers = {
      ...config.headers,
      'x-opencode-directory': encodedDirectory,
    };
  }

  const client = createClient(config);
  return new OpencodeClient({ client });
}
