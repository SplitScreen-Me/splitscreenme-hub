import { and, eq, lt, ne, sql } from 'drizzle-orm';
import { db, type Queryable } from '@/db';
import { oauthAccounts, sessions, users, type UserRole } from '@/db/schema';
import { randomBase32, sha256Hex } from '../crypto';

/**
 * Database sessions (the Lucia reference model). The cookie holds a random token; the database holds only
 * sha256(token). docs/ARCHITECTURE.md section 4.2.
 */

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY;
/** Expiry slides back to 30 days once less than this remains. */
export const SESSION_RENEW_BELOW_MS = 15 * DAY;
/** last_seen_at is written at most this often. */
export const LAST_SEEN_EVERY_MS = 60 * 60 * 1000;

/** 20 random bytes, base32 lower case without padding (32 chars). */
export const generateSessionToken = () => randomBase32(20);

/** What the database stores for a token. */
export const sessionIdFromToken = (token: string) => sha256Hex(token);

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  role: UserRole;
  trustedAuthor: boolean;
  notifyReplies: boolean;
  createdAt: Date;
  hasPassword: boolean;
  hasOAuth: boolean;
}

export interface ValidSession {
  session: { id: string; userId: string; expiresAt: Date; createdAt: Date };
  user: SessionUser;
  /** The cookie must be re-sent with the new expiry. */
  renewed: boolean;
}

export async function createSession(
  userId: string,
  userAgent: string | null,
  q: Queryable = db,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await q.insert(sessions).values({
    id: sessionIdFromToken(token),
    userId,
    expiresAt,
    userAgent: userAgent ? userAgent.slice(0, 200) : null,
  });
  return { token, expiresAt };
}

/** One query joining users. Expired sessions, deleted and banned users are rejected. */
export async function validateSessionToken(token: string, now = new Date()): Promise<ValidSession | null> {
  if (!/^[a-z2-7]{32}$/.test(token)) return null;
  const id = sessionIdFromToken(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      username: users.username,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      role: users.role,
      trustedAuthor: users.trustedAuthor,
      notifyReplies: users.notifyReplies,
      userCreatedAt: users.createdAt,
      bannedAt: users.bannedAt,
      deletedAt: users.deletedAt,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
      hasOAuth: sql<boolean>`exists (select 1 from ${oauthAccounts} where ${oauthAccounts.userId} = ${users.id})`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime() || row.bannedAt || row.deletedAt) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  let expiresAt = row.expiresAt;
  const renewed = expiresAt.getTime() - now.getTime() < SESSION_RENEW_BELOW_MS;
  const seenStale = now.getTime() - row.lastSeenAt.getTime() > LAST_SEEN_EVERY_MS;
  if (renewed || seenStale) {
    if (renewed) expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt, lastSeenAt: now }).where(eq(sessions.id, id));
  }

  return {
    session: { id, userId: row.userId, expiresAt, createdAt: row.createdAt },
    user: {
      id: row.userId,
      username: row.username,
      email: row.email,
      emailVerifiedAt: row.emailVerifiedAt,
      role: row.role,
      trustedAuthor: row.trustedAuthor,
      notifyReplies: row.notifyReplies,
      createdAt: row.userCreatedAt,
      hasPassword: row.hasPassword,
      hasOAuth: row.hasOAuth,
    },
    renewed,
  };
}

export async function invalidateSession(sessionId: string, q: Queryable = db): Promise<void> {
  await q.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Password change keeps the current session (`exceptSessionId`); everything else drops them all. */
export async function invalidateUserSessions(
  userId: string,
  exceptSessionId?: string,
  q: Queryable = db,
): Promise<void> {
  await q
    .delete(sessions)
    .where(
      exceptSessionId
        ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
        : eq(sessions.userId, userId),
    );
}

export async function purgeExpiredSessions(now = new Date()): Promise<number> {
  const rows = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  return rows.length;
}
