import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @myfinance/shared ships TypeScript-compiled CJS from the workspace.
  transpilePackages: ['@myfinance/shared'],
};

export default nextConfig;
