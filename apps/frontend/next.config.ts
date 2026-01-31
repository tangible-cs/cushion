import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@cushion/types', '@opencode-ai/sdk'],
  turbopack: {
    resolveAlias: {
      '@cushion/types': '../../packages/types/src',
      '@opencode-ai/sdk/v2/client': './lib/opencode-sdk.ts',
      '@opencode-ai/sdk': '../../opencode/packages/sdk/js/src',
    },
  },
};

export default nextConfig;
