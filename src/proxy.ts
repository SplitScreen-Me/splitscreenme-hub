import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, generateNonce } from '@/lib/security-headers';

/**
 * Pages only (see matcher): per-request CSP nonce, noindex flag, current path for login redirects, and a
 * sliding session cookie. Proxy always runs in the Node.js runtime (Next 16 rejects a `runtime` option here),
 * so the environment is read at runtime, not inlined at build.
 */
export const config = {
  matcher: [
    {
      source:
        '/((?!api/v3|api/me|api/auth|_next/static|_next/image|api-docs|doc/img|favicon.ico|icon.svg|icons|robots.txt|sitemap.xml).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};

const SESSION_COOKIES = ['__Host-ssm_session', 'ssm_session'];
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export function proxy(req: NextRequest) {
  const nonce = generateNonce();
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search);
  // Next reads the CSP from the request to put the nonce on its own scripts.
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  // Indexing is off unless NOINDEX is exactly "0" (beta default).
  if (process.env.NOINDEX !== '0') res.headers.set('X-Robots-Tag', 'noindex, nofollow');

  // The database expiry slides on validation; keep the browser cookie alive with it on page views.
  if (req.method === 'GET') {
    for (const name of SESSION_COOKIES) {
      const value = req.cookies.get(name)?.value;
      if (value) {
        res.cookies.set(name, value, {
          httpOnly: true,
          secure: name.startsWith('__Host-'),
          sameSite: 'lax',
          path: '/',
          maxAge: SESSION_MAX_AGE,
        });
      }
    }
  }
  return res;
}
