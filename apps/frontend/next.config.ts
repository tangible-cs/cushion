import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@cushion/types', '@opencode-ai/sdk', 'pdfjs-dist'],
  turbopack: {
    resolveAlias: {
      '@cushion/types': '../../packages/types/src',
    },
  },
};

export default nextConfig;
