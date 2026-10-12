import createMDX from '@next/mdx';
import type { NextConfig } from 'next';
import { legacyRedirects } from './src/content/docs/legacy-redirects';
import { mdxOptions } from './src/content/mdx-options';
import { SAME_ORIGIN_RESOURCE_POLICY, STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

/**
 * A standalone build freezes this file (headers, redirects) at build time: nothing here may depend on the
 * environment. NOINDEX, SITE_URL and BETA are read at runtime (middleware, withApi, server components).
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Covers come from IGDB/Steam as is; no sharp, no image optimiser in the container.
  images: { unoptimized: true },
  // Hot data is cached in our own LRU (src/server/cache.ts).
  cacheMaxMemorySize: 0,
  pageExtensions: ['ts', 'tsx', 'mdx'],
  // OG images (next/og) read their TTF fonts from src/assets/og at runtime; file tracing cannot see paths
  // built from process.cwd(), so copy them into the standalone build of every opengraph-image route.
  outputFileTracingIncludes: { 'opengraph-image': ['./src/assets/og/*'] },
  // Lint is its own check (`npm run lint`); the build still type-checks.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: [...STATIC_SECURITY_HEADERS] }, SAME_ORIGIN_RESOURCE_POLICY];
  },
  async redirects() {
    return legacyRedirects.map((r) => ({ ...r, permanent: true }));
  },
};

const withMDX = createMDX({ options: mdxOptions as never });

export default withMDX(nextConfig);
