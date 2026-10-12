import { createHash, randomBytes } from 'node:crypto';
import { env } from '../env';

/**
 * OAuth 2.0 / OpenID Connect client for Discord, GitHub and Google: authorization URL (state, PKCE S256),
 * code exchange, normalised profile. Plain fetch + node:crypto, about what Arctic did, kept in-repo
 * because Arctic and @oslojs/crypto were deprecated on npm (2026-07-29). The flows that use it
 * (start, callback, linking rules) live in src/server/auth. docs/ARCHITECTURE.md section 4.4.
 */

export type ProviderName = 'discord' | 'github' | 'google';

interface ProviderSpec {
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce: boolean;
}

const SPECS: Record<ProviderName, ProviderSpec> = {
  discord: {
    label: 'Discord',
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    scopes: ['identify', 'email'],
    pkce: true,
  },
  github: {
    label: 'GitHub',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'user:email'],
    pkce: false,
  },
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'email'],
    pkce: true,
  },
};

export const PROVIDERS = Object.keys(SPECS) as ProviderName[];

export const isProviderName = (v: unknown): v is ProviderName =>
  typeof v === 'string' && (PROVIDERS as string[]).includes(v);

interface Credentials {
  clientId: string;
  clientSecret: string;
}

function credentials(provider: ProviderName): Credentials | null {
  const e = env();
  const pair = {
    discord: [e.DISCORD_CLIENT_ID, e.DISCORD_CLIENT_SECRET],
    github: [e.GITHUB_CLIENT_ID, e.GITHUB_CLIENT_SECRET],
    google: [e.GOOGLE_CLIENT_ID, e.GOOGLE_CLIENT_SECRET],
  }[provider];
  return pair[0] && pair[1] ? { clientId: pair[0], clientSecret: pair[1] } : null;
}

/** Providers with both client id and secret configured, for the login page. */
export function enabledProviders(): { name: ProviderName; label: string }[] {
  return PROVIDERS.filter((p) => credentials(p)).map((name) => ({ name, label: SPECS[name].label }));
}

export const redirectUri = (provider: ProviderName) =>
  `${env().SITE_URL}/api/auth/oauth/${provider}/callback`;

export const generateState = () => randomBytes(32).toString('base64url');
export const generateCodeVerifier = () => randomBytes(32).toString('base64url');
const codeChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

export const usesPkce = (provider: ProviderName) => SPECS[provider].pkce;

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'disabled' | 'exchange_failed' | 'profile_failed' | 'invalid_token',
  ) {
    super(message);
  }
}

function requireCredentials(provider: ProviderName): Credentials {
  const c = credentials(provider);
  if (!c) throw new OAuthError(`${provider} login is not configured`, 'disabled');
  return c;
}

export function createAuthorizationUrl(
  provider: ProviderName,
  state: string,
  codeVerifier: string | null,
): URL {
  const spec = SPECS[provider];
  const { clientId } = requireCredentials(provider);
  const url = new URL(spec.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri(provider));
  url.searchParams.set('scope', spec.scopes.join(' '));
  url.searchParams.set('state', state);
  if (spec.pkce) {
    if (!codeVerifier) throw new Error('PKCE code verifier required');
    url.searchParams.set('code_challenge', codeChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  if (provider === 'discord') url.searchParams.set('prompt', 'none');
  if (provider === 'google') url.searchParams.set('prompt', 'select_account');
  return url;
}

export interface OAuthTokens {
  accessToken: string;
  idToken: string | null;
}

/** Exchanges the authorization code (client_secret_post, JSON response). */
export async function exchangeCode(
  provider: ProviderName,
  code: string,
  codeVerifier: string | null,
): Promise<OAuthTokens> {
  const spec = SPECS[provider];
  const { clientId, clientSecret } = requireCredentials(provider);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(provider),
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (spec.pkce && codeVerifier) body.set('code_verifier', codeVerifier);
  const res = await fetch(spec.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== 'string') {
    throw new OAuthError(`${provider} code exchange failed (${res.status})`, 'exchange_failed');
  }
  return {
    accessToken: json.access_token,
    idToken: typeof json.id_token === 'string' ? json.id_token : null,
  };
}

/** What the linking rules need from any provider. */
export interface OAuthProfile {
  provider: ProviderName;
  providerUserId: string;
  /** Provider username or display handle, for new account names and the account page. */
  username: string | null;
  /** Lower-cased; null when the provider gives none. */
  email: string | null;
  /** True only when the provider says the address is verified. */
  emailVerified: boolean;
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'SplitScreen.Me',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new OAuthError(`profile request failed (${res.status})`, 'profile_failed');
  return (await res.json()) as T;
}

/**
 * Google ID token claims. The token comes straight from Google's token endpoint over verified TLS, so per
 * OpenID Connect Core 3.1.3.7 the signature check may be skipped; issuer, audience and expiry are checked.
 */
export function readGoogleIdToken(
  idToken: string,
  clientId: string,
  now = Date.now(),
): Record<string, unknown> {
  const part = idToken.split('.')[1];
  if (!part) throw new OAuthError('malformed ID token', 'invalid_token');
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new OAuthError('malformed ID token', 'invalid_token');
  }
  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  const audOk = claims.aud === clientId;
  const expOk = typeof claims.exp === 'number' && claims.exp * 1000 > now;
  if (!issOk || !audOk || !expOk || typeof claims.sub !== 'string') {
    throw new OAuthError('ID token rejected', 'invalid_token');
  }
  return claims;
}

const lower = (v: unknown) => (typeof v === 'string' && v.includes('@') ? v.trim().toLowerCase() : null);

export async function fetchProfile(provider: ProviderName, tokens: OAuthTokens): Promise<OAuthProfile> {
  if (provider === 'discord') {
    const me = await getJson<{ id: string; username?: string; email?: string | null; verified?: boolean }>(
      'https://discord.com/api/users/@me',
      tokens.accessToken,
    );
    return {
      provider,
      providerUserId: String(me.id),
      username: me.username ?? null,
      email: lower(me.email),
      emailVerified: me.verified === true && !!lower(me.email),
    };
  }
  if (provider === 'github') {
    const user = await getJson<{ id: number; login?: string }>(
      'https://api.github.com/user',
      tokens.accessToken,
    );
    const emails = await getJson<{ email: string; primary: boolean; verified: boolean }[]>(
      'https://api.github.com/user/emails',
      tokens.accessToken,
    ).catch(() => []);
    const primary = emails.find((e) => e.primary && e.verified);
    return {
      provider,
      providerUserId: String(user.id),
      username: user.login ?? null,
      email: lower(primary?.email),
      emailVerified: !!primary,
    };
  }
  if (!tokens.idToken) throw new OAuthError('Google returned no ID token', 'invalid_token');
  const claims = readGoogleIdToken(tokens.idToken, requireCredentials('google').clientId);
  return {
    provider,
    providerUserId: String(claims.sub),
    username: null,
    email: lower(claims.email),
    emailVerified: claims.email_verified === true && !!lower(claims.email),
  };
}
