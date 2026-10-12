import 'server-only';
import { headers } from 'next/headers';
import { readSessionToken, setSessionCookie } from '@/lib/auth/cookies';
import { createSession, invalidateSession, sessionIdFromToken } from '@/lib/auth/session';
import { clientIp, truncate } from '@/lib/request';

/** Client IP of the current Server Action or route handler (X-Real-IP behind our nginx only). */
export async function requestIp(): Promise<string> {
  return clientIp(await headers());
}

/**
 * Opens a fresh session (never reuses one: no fixation) and sets the cookie; the session the browser
 * held before, if any, is deleted. Actions and route handlers only.
 */
export async function startSession(userId: string): Promise<void> {
  const previous = await readSessionToken();
  if (previous) await invalidateSession(sessionIdFromToken(previous));
  const ua = truncate((await headers()).get('user-agent'), 200);
  const { token, expiresAt } = await createSession(userId, ua);
  await setSessionCookie(token, expiresAt);
}
