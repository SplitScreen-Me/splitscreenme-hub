import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { UserRole } from '@/db/schema';
import { paths } from '../urls';
import { readSessionToken } from './cookies';
import { validateSessionToken, type SessionUser } from './session';

export type CurrentUser = SessionUser & { sessionId: string };

/**
 * The signed-in user of this request, or null. Cached per request with React `cache()`.
 * Rendering cannot write cookies; the proxy re-sends the session cookie with a fresh Max-Age on page
 * GETs, and the database expiry (slid here) stays the authority.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const result = await validateSessionToken(token);
  return result ? { ...result.user, sessionId: result.session.id } : null;
});

const ROLE_RANK: Record<UserRole, number> = { user: 0, moderator: 1, admin: 2 };

export const hasRole = (user: Pick<SessionUser, 'role'> | null, role: UserRole) =>
  !!user && ROLE_RANK[user.role] >= ROLE_RANK[role];

/** Current path + query, from the `x-pathname` header set by the proxy. */
async function currentPath(): Promise<string> {
  return (await headers()).get('x-pathname') ?? '/';
}

/** Redirects to /login?next=<current path> when nobody is signed in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(paths.login(await currentPath()));
  return user;
}

/** Signed-in users without the role get a 404: the backoffice does not reveal itself. */
export async function requireRole(role: Exclude<UserRole, 'user'>): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user, role)) notFound();
  return user;
}

/** Comments and handler creation: not banned (banned users have no session) and a proven address or an OAuth identity. */
export const canPost = (user: Pick<SessionUser, 'emailVerifiedAt' | 'hasOAuth'> | null) =>
  !!user && (!!user.emailVerifiedAt || user.hasOAuth);
