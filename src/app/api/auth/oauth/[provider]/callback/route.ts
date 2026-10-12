import { NextResponse, type NextRequest } from 'next/server';
import { takeOAuthCookie } from '@/lib/auth/cookies';
import { getCurrentUser } from '@/lib/auth/current-user';
import { exchangeCode, fetchProfile, isProviderName, OAuthError } from '@/lib/auth/oauth';
import { safeEqual } from '@/lib/crypto';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { clientIp } from '@/lib/request';
import { safeNextPath } from '@/lib/urls';
import { resolveOAuthUser } from '@/server/auth/oauth-resolve';
import { startSession } from '@/server/auth/request-context';

export const dynamic = 'force-dynamic';

/**
 * OAuth callback: state check (constant time, cookie deleted), code exchange, profile, then the linking
 * rules of section 4.4 and a fresh session.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const site = env().SITE_URL;
  const cookie = await takeOAuthCookie();
  const intent = cookie?.intent === 'link' ? 'link' : 'login';
  const next = safeNextPath(cookie?.next, intent === 'link' ? '/account' : '/');
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, site), 303);
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Referrer-Policy', 'no-referrer');
    return res;
  };
  const fail = (code: string) =>
    go(
      intent === 'link'
        ? `/account?error=oauth_${code}`
        : `/login?error=oauth_${code}&next=${encodeURIComponent(next)}`,
    );

  const q = req.nextUrl.searchParams;
  if (q.get('error')) return fail('denied');
  const state = q.get('state') ?? '';
  const code = q.get('code') ?? '';
  if (
    !cookie ||
    !isProviderName(provider) ||
    cookie.provider !== provider ||
    !state ||
    !code ||
    !safeEqual(state, cookie.state)
  ) {
    return fail('state');
  }

  try {
    const tokens = await exchangeCode(provider, code, cookie.codeVerifier);
    const profile = await fetchProfile(provider, tokens);
    const me = intent === 'link' ? await getCurrentUser() : null;
    const result = await resolveOAuthUser(profile, {
      intent,
      sessionUserId: me?.id ?? null,
      ip: clientIp(req.headers),
    });
    if (!result.ok) return fail(result.error);
    if (intent === 'link') return go('/account?linked=1');
    await startSession(result.userId);
    return go(result.outcome === 'created' ? '/account?welcome=1' : next);
  } catch (err) {
    if (err instanceof OAuthError) {
      log.warn('oauth.failed', { provider, code: err.code });
      return fail(err.code);
    }
    log.error('oauth.error', { provider, err });
    return fail('exchange_failed');
  }
}
