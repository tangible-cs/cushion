import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@cushion/types', '@opencode-ai/sdk', 'pdfjs-dist'],
};

export default nextConfig;
