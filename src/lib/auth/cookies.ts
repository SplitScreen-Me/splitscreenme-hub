import { cookies } from 'next/headers';
import { env } from '../env';

/**
 * Cookie names and attributes. `__Host-` prefix in production (https SITE_URL): Secure, Path=/, no Domain.
 * Plain names on http://localhost, where browsers refuse Secure cookies.
 */
const secure = () => env().SITE_URL.startsWith('https://');

export const sessionCookieName = () => (secure() ? '__Host-ssm_session' : 'ssm_session');
export const oauthCookieName = () => (secure() ? '__Host-ssm_oauth' : 'ssm_oauth');

const base = () => ({ httpOnly: true, secure: secure(), sameSite: 'lax' as const, path: '/' });

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(sessionCookieName())?.value ?? null;
}

/** Server Actions and route handlers only (cookies cannot be set while rendering a page). */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, {
    ...base(),
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

export async function deleteSessionCookie(): Promise<void> {
  (await cookies()).set(sessionCookieName(), '', { ...base(), maxAge: 0 });
}

/** OAuth round-trip state, 10 minutes. */
export interface OAuthCookie {
  provider: string;
  state: string;
  codeVerifier: string | null;
  next: string;
  intent: 'login' | 'link';
}

export async function setOAuthCookie(value: OAuthCookie): Promise<void> {
  (await cookies()).set(oauthCookieName(), JSON.stringify(value), { ...base(), maxAge: 600 });
}

export async function takeOAuthCookie(): Promise<OAuthCookie | null> {
  const jar = await cookies();
  const raw = jar.get(oauthCookieName())?.value;
  jar.set(oauthCookieName(), '', { ...base(), maxAge: 0 });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthCookie;
  } catch {
    return null;
  }
}
