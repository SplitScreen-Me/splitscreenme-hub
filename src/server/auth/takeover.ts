import 'server-only';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { Tx } from '@/db';
import { authTokens, oauthAccounts, sessions, users } from '@/db/schema';
import { audit } from '@/lib/audit';
import { emailProven } from './rules';

/**
 * Account pre-hijacking defences (docs/ARCHITECTURE.md section 4.4). Registering, or moving to, an
 * address proves nothing; only the inbox does. When someone proves the inbox of an address that an
 * account held without proof, whatever the earlier holder attached to that account cannot be trusted.
 */

type Who = { id: string; role: string };

/**
 * Takeover by inbox proof (a provider's verified address, or a reset link): every OAuth link, session
 * and pending token of the account goes, and the password too (replaced by `password` for a reset). The
 * address becomes verified. Call inside the transaction that then links or signs in the prover.
 */
export async function takeOverByProof(
  tx: Tx,
  user: Who & { passwordHash: string | null },
  opts: {
    via: 'oauth' | 'reset';
    provider?: string;
    password?: { hash: string; algo: 'bcrypt' };
    ip: string;
  },
): Promise<void> {
  const links = await tx
    .delete(oauthAccounts)
    .where(eq(oauthAccounts.userId, user.id))
    .returning({ provider: oauthAccounts.provider });
  await tx.delete(sessions).where(eq(sessions.userId, user.id));
  await tx.delete(authTokens).where(eq(authTokens.userId, user.id));
  await tx
    .update(users)
    .set({
      passwordHash: opts.password?.hash ?? null,
      passwordAlgo: opts.password?.algo ?? null,
      emailVerifiedAt: new Date(),
      emailVerifiedByModerator: false,
    })
    .where(eq(users.id, user.id));
  await audit(tx, {
    actor: { id: user.id, role: user.role },
    action: 'auth.email_takeover',
    target: { type: 'user', id: user.id },
    details: {
      via: opts.via,
      ...(opts.provider && { provider: opts.provider }),
      removedLinks: links.map((l) => l.provider),
      hadLocalLogin: !!user.passwordHash,
    },
    ip: opts.ip,
  });
}

/**
 * A verified claimant (`claimant`, about to take `email`) and another account holding that address
 * without proof: the holder loses the address and its pending links for it, and keeps its other ways to
 * sign in. Returns false, changing nothing, when the holder proved the address.
 */
export async function releaseUnprovenEmail(
  tx: Tx,
  email: string,
  claimant: Who,
  ip: string,
): Promise<boolean> {
  const [holder] = await tx
    .select({
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      emailVerifiedByModerator: users.emailVerifiedByModerator,
    })
    .from(users)
    .where(and(sql`lower(${users.email}) = lower(${email})`, ne(users.id, claimant.id)))
    .limit(1);
  if (!holder) return true;
  if (emailProven(holder)) return false;
  await tx
    .update(users)
    .set({ email: null, emailVerifiedAt: null, emailVerifiedByModerator: false })
    .where(eq(users.id, holder.id));
  await tx
    .delete(authTokens)
    .where(and(eq(authTokens.userId, holder.id), sql`lower(${authTokens.email}) = lower(${email})`));
  await audit(tx, {
    actor: claimant,
    action: 'auth.email_released',
    target: { type: 'user', id: holder.id },
    ip,
  });
  return true;
}
