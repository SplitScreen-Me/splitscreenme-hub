/**
 * Security headers: docs/ARCHITECTURE.md section 6.4. The static set is applied to every route by
 * next.config.ts (frozen at build, so nothing here may depend on the environment); the CSP needs a
 * per-request nonce and is set by the proxy (src/proxy.ts) on pages.
 */

export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // No includeSubDomains, no preload: other subdomains are not ours to decide.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
];

/**
 * Everything but the public API, whose responses are `cross-origin` (set by withApi): config headers win
 * over route handler headers in Next, so the API path is excluded here rather than overridden there.
 */
export const SAME_ORIGIN_RESOURCE_POLICY = {
  source: '/:path((?!api/v3/).*)',
  headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }],
};

export const IMAGE_HOSTS = [
  'https://images.igdb.com',
  'https://cdn.akamai.steamstatic.com',
  'https://shared.akamai.steamstatic.com',
  'https://cdn.cloudflare.steamstatic.com',
] as const;

/** Page CSP. `'unsafe-eval'` only in development (React refresh). */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${IMAGE_HOSTS.join(' ')}`,
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    'frame-src https://www.youtube-nocookie.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/** 16 random bytes, base64. Works in both the Node.js and Edge runtimes. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
