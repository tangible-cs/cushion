import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@cushion/types'],
  turbopack: {
    resolveAlias: {
      '@cushion/types': '../../packages/types/src',
    },
  },
};

export default nextConfig;
