import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',          // image Docker légère
  poweredByHeader: false,        // ne pas révéler la technologie utilisée
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
