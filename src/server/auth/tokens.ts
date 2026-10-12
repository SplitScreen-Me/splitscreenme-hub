import 'server-only';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, type Queryable } from '@/db';
import { authTokens } from '@/db/schema';
import { randomBase64Url, sha256Hex } from '@/lib/crypto';

/**
 * Single-use email tokens (verify, reset, change email): 32 random bytes, base64url in the link fragment,
 * only sha256(token) stored. docs/ARCHITECTURE.md section 4.3.
 */

export type TokenPurpose = 'verify_email' | 'reset_password' | 'change_email';

const HOUR = 60 * 60 * 1000;
export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  reset_password: HOUR,
  verify_email: 48 * HOUR,
  change_email: 48 * HOUR,
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function createAuthToken(
  userId: string,
  purpose: TokenPurpose,
  email: string | null,
  q: Queryable = db,
): Promise<string> {
  const token = randomBase64Url(32);
  // One live token per user and purpose: older ones stop working.
  await q
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  await q.insert(authTokens).values({
    id: sha256Hex(token),
    userId,
    purpose,
    email,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
  });
  return token;
}

export interface TokenRow {
  id: string;
  userId: string;
  purpose: TokenPurpose;
  email: string | null;
}

/** A live token of one of the purposes, without using it up. */
export async function peekAuthToken(
  token: unknown,
  purposes: readonly TokenPurpose[],
  q: Queryable = db,
): Promise<TokenRow | null> {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
  const [row] = await q
    .select({
      id: authTokens.id,
      userId: authTokens.userId,
      purpose: authTokens.purpose,
      email: authTokens.email,
    })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.id, sha256Hex(token)),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return row && purposes.includes(row.purpose) ? row : null;
}

/** Marks a token used; false when someone used it first (concurrent clicks). Call inside the transaction. */
export async function useAuthToken(id: string, q: Queryable): Promise<boolean> {
  const rows = await q
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, id), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id });
  return rows.length === 1;
}
