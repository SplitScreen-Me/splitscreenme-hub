import { NextResponse, type NextRequest } from 'next/server';
import { setOAuthCookie } from '@/lib/auth/cookies';
import { getCurrentUser } from '@/lib/auth/current-user';
import {
  createAuthorizationUrl,
  enabledProviders,
  generateCodeVerifier,
  generateState,
  isProviderName,
  usesPkce,
} from '@/lib/auth/oauth';
import { env } from '@/lib/env';
import { hit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';
import { safeNextPath } from '@/lib/urls';

export const dynamic = 'force-dynamic';

/**
 * Starts an OAuth sign-in (`?next=`, `?intent=login|link`): state and PKCE verifier in a 10-minute
 * cookie, then a redirect to the provider. docs/ARCHITECTURE.md section 4.4.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const site = env().SITE_URL;
  const back = (path: string) => NextResponse.redirect(new URL(path, site), 303);
  const intent = req.nextUrl.searchParams.get('intent') === 'link' ? 'link' : 'login';
  const next = safeNextPath(req.nextUrl.searchParams.get('next'), intent === 'link' ? '/account' : '/');
  const errorPath = (code: string) =>
    intent === 'link'
      ? `/account?error=oauth_${code}`
      : `/login?error=oauth_${code}&next=${encodeURIComponent(next)}`;

  if (!isProviderName(provider) || !enabledProviders().some((p) => p.name === provider)) {
    return back(errorPath('disabled'));
  }
  if (!hit('oauth-start', clientIp(req.headers)).ok) return back(errorPath('rate_limited'));
  if (intent === 'link' && !(await getCurrentUser()))
    return back(`/login?next=${encodeURIComponent('/account')}`);

  const state = generateState();
  const codeVerifier = usesPkce(provider) ? generateCodeVerifier() : null;
  await setOAuthCookie({ provider, state, codeVerifier, next, intent });
  const res = NextResponse.redirect(createAuthorizationUrl(provider, state, codeVerifier), 302);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
