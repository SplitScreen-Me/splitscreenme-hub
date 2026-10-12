import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db';
import { sessions, users } from '@/db/schema';
import { dbAvailable, truncateAll } from '@/test/db';
import { base32LowerNoPadding, sha256Hex } from '../crypto';
import {
  createSession,
  generateSessionToken,
  invalidateUserSessions,
  SESSION_TTL_MS,
  sessionIdFromToken,
  validateSessionToken,
} from './session';

describe('session tokens', () => {
  it('base32 matches RFC 4648 (lower case, no padding)', () => {
    expect(base32LowerNoPadding(new TextEncoder().encode('foobar'))).toBe('mzxw6ytboi');
    expect(base32LowerNoPadding(new TextEncoder().encode('f'))).toBe('my');
  });

  it('are 32 base32 chars from 20 random bytes, stored only as sha256', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toMatch(/^[a-z2-7]{32}$/);
    expect(a).not.toBe(b);
    expect(sessionIdFromToken(a)).toBe(sha256Hex(a));
    expect(sessionIdFromToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe.runIf(dbAvailable())('sessions in the database', () => {
  beforeAll(async () => {
    await truncateAll();
    await getDb()
      .insert(users)
      .values([
        { id: 'sessUser000000001', username: 'session-user', email: 'session@example.test' },
        { id: 'sessBanned0000001', username: 'session-banned', bannedAt: new Date() },
      ]);
  });

  it('round-trips a token and never stores it', async () => {
    const { token, expiresAt } = await createSession('sessUser000000001', 'vitest');
    const [row] = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionIdFromToken(token)));
    expect(row?.userId).toBe('sessUser000000001');
    expect(row?.id).not.toBe(token);
    const valid = await validateSessionToken(token);
    expect(valid?.user.username).toBe('session-user');
    expect(valid?.user.hasOAuth).toBe(false);
    expect(Math.abs(expiresAt.getTime() - Date.now() - SESSION_TTL_MS)).toBeLessThan(5_000);
  });

  it('rejects garbage, expired sessions and banned users', async () => {
    expect(await validateSessionToken('not-a-token')).toBeNull();
    const { token } = await createSession('sessUser000000001', null);
    expect(await validateSessionToken(token, new Date(Date.now() + SESSION_TTL_MS + 1000))).toBeNull();
    const banned = await createSession('sessBanned0000001', null);
    expect(await validateSessionToken(banned.token)).toBeNull();
  });

  it('slides the expiry when less than 15 days remain', async () => {
    const { token } = await createSession('sessUser000000001', null);
    const later = new Date(Date.now() + 20 * 24 * 3600 * 1000);
    const v = await validateSessionToken(token, later);
    expect(v?.renewed).toBe(true);
    expect(v!.session.expiresAt.getTime()).toBeGreaterThan(later.getTime() + 29 * 24 * 3600 * 1000);
  });

  it('invalidates all sessions but the current one', async () => {
    const keep = await createSession('sessUser000000001', null);
    await createSession('sessUser000000001', null);
    await invalidateUserSessions('sessUser000000001', sessionIdFromToken(keep.token));
    const left = await getDb().select().from(sessions).where(eq(sessions.userId, 'sessUser000000001'));
    expect(left.map((s) => s.id)).toEqual([sessionIdFromToken(keep.token)]);
  });
});
