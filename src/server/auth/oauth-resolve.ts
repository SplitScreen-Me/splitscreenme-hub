import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import { oauthAccounts, users } from '@/db/schema';
import { audit } from '@/lib/audit';
import type { OAuthProfile } from '@/lib/auth/oauth';
import { newId } from '@/lib/ids';
import { emailProven, sanitizeUsername } from './rules';
import { releaseUnprovenEmail, takeOverByProof } from './takeover';
import { uniqueUsername } from './users';

/**
 * Who an OAuth identity belongs to: docs/ARCHITECTURE.md section 4.4, rules 1 to 4, in one transaction.
 */

export type OAuthResolution =
  | { ok: true; userId: string; outcome: 'existing' | 'linked' | 'linked_by_email' | 'created' }
  | {
      ok: false;
      error:
        | 'suspended'
        | 'identity_taken'
        | 'provider_already_linked'
        | 'link_requires_session'
        | 'link_requires_verified_email';
    };

export const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  suspended: 'This account is suspended.',
  identity_taken: 'This account is already linked to another SplitScreen.Me user.',
  provider_already_linked:
    'Your account is already linked to another account of this provider. Use that one, or unlink it first.',
  link_requires_session: 'Your session expired. Log in again, then link the account.',
  link_requires_verified_email:
    'Confirm your email address first, or link an account whose verified email is the same as yours.',
  disabled: 'This sign-in method is not available.',
  state: 'The sign-in attempt expired or was tampered with. Try again.',
  exchange_failed: 'The provider refused the sign-in. Try again.',
  profile_failed: 'The provider did not return your profile. Try again.',
  invalid_token: 'The provider returned an invalid answer. Try again.',
  denied: 'Sign-in was cancelled.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
};

async function linkIdentity(tx: Tx, userId: string, profile: OAuthProfile): Promise<void> {
  await tx.insert(oauthAccounts).values({
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    userId,
    providerUsername: profile.username,
    lastUsedAt: new Date(),
  });
}

async function hasProvider(tx: Tx, userId: string, provider: OAuthProfile['provider']): Promise<boolean> {
  const [row] = await tx
    .select({ id: oauthAccounts.providerUserId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider)))
    .limit(1);
  return !!row;
}

export async function resolveOAuthUser(
  profile: OAuthProfile,
  ctx: { intent: 'login' | 'link'; sessionUserId: string | null; ip: string },
): Promise<OAuthResolution> {
  return db.transaction(async (tx): Promise<OAuthResolution> => {
    // Id of the account rule 4 may create (also the actor when rule 3 releases a squatted address).
    const newUserId = newId();

    // 1. Known identity.
    const [known] = await tx
      .select({ userId: oauthAccounts.userId, bannedAt: users.bannedAt, deletedAt: users.deletedAt })
      .from(oauthAccounts)
      .innerJoin(users, eq(users.id, oauthAccounts.userId))
      .where(
        and(
          eq(oauthAccounts.provider, profile.provider),
          eq(oauthAccounts.providerUserId, profile.providerUserId),
        ),
      )
      .limit(1);
    if (known) {
      if (ctx.intent === 'link' && known.userId !== ctx.sessionUserId)
        return { ok: false, error: 'identity_taken' };
      if (known.bannedAt || known.deletedAt) return { ok: false, error: 'suspended' };
      await tx
        .update(oauthAccounts)
        .set({
          lastUsedAt: new Date(),
          providerUsername: profile.username ?? sql`${oauthAccounts.providerUsername}`,
        })
        .where(
          and(
            eq(oauthAccounts.provider, profile.provider),
            eq(oauthAccounts.providerUserId, profile.providerUserId),
          ),
        );
      return { ok: true, userId: known.userId, outcome: 'existing' };
    }

    // 2. Linking from the account page. An unconfirmed address may belong to someone else: no new way in
    // until it is confirmed, unless the provider vouches for that very address.
    if (ctx.intent === 'link') {
      if (!ctx.sessionUserId) return { ok: false, error: 'link_requires_session' };
      const [me] = await tx.select().from(users).where(eq(users.id, ctx.sessionUserId)).limit(1);
      if (!me || me.deletedAt || me.bannedAt) return { ok: false, error: 'link_requires_session' };
      const sameVerifiedAddress =
        profile.emailVerified && !!profile.email && me.email?.toLowerCase() === profile.email;
      if (me.email && !me.emailVerifiedAt && !sameVerifiedAddress)
        return { ok: false, error: 'link_requires_verified_email' };
      if (await hasProvider(tx, me.id, profile.provider))
        return { ok: false, error: 'provider_already_linked' };
      await linkIdentity(tx, me.id, profile);
      if (sameVerifiedAddress && !emailProven(me)) {
        await tx
          .update(users)
          .set({ emailVerifiedAt: new Date(), emailVerifiedByModerator: false })
          .where(eq(users.id, me.id));
      }
      await audit(tx, {
        actor: { id: me.id, role: me.role },
        action: 'auth.oauth_linked',
        target: { type: 'user', id: me.id },
        details: { provider: profile.provider },
        ip: ctx.ip,
      });
      return { ok: true, userId: me.id, outcome: 'linked' };
    }

    // 3. A verified address that matches an account. Proven by its inbox: link and log in. Held without
    // proof (unconfirmed, or only marked by a moderator): whoever registered it may not own it, so the
    // prover takes the account over and everything the earlier holder attached goes (pre-hijacking).
    if (profile.emailVerified && profile.email) {
      const [owner] = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${profile.email}`)
        .limit(1);
      if (owner) {
        const proven = emailProven(owner);
        if (owner.bannedAt || owner.deletedAt) {
          if (proven) return { ok: false, error: 'suspended' };
          // A suspended account squatting the address: it loses the address, the prover gets an account.
          await releaseUnprovenEmail(tx, profile.email, { id: newUserId, role: 'user' }, ctx.ip);
        } else {
          if (proven) {
            if (await hasProvider(tx, owner.id, profile.provider))
              return { ok: false, error: 'provider_already_linked' };
          } else {
            await takeOverByProof(tx, owner, { via: 'oauth', provider: profile.provider, ip: ctx.ip });
          }
          await linkIdentity(tx, owner.id, profile);
          await audit(tx, {
            actor: { id: owner.id, role: owner.role },
            action: 'auth.oauth_linked',
            target: { type: 'user', id: owner.id },
            details: { provider: profile.provider, byEmail: true, ...(!proven && { takeover: true }) },
            ip: ctx.ip,
          });
          return { ok: true, userId: owner.id, outcome: 'linked_by_email' };
        }
      }
    }

    // 4. A new account.
    const localPart = profile.email?.split('@')[0] ?? null;
    const base = sanitizeUsername(profile.username ?? localPart, `${profile.provider}-player`);
    const username = await uniqueUsername(base, tx);
    let email: string | null = null;
    if (profile.emailVerified && profile.email) {
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${profile.email}`)
        .limit(1);
      if (!taken) email = profile.email;
    }
    const id = newUserId;
    await tx.insert(users).values({
      id,
      username,
      email,
      emailVerifiedAt: email ? new Date() : null,
      lastLoginAt: new Date(),
    });
    await linkIdentity(tx, id, profile);
    await audit(tx, {
      actor: { id, role: 'user' },
      action: 'auth.oauth_linked',
      target: { type: 'user', id },
      details: { provider: profile.provider, created: true },
      ip: ctx.ip,
    });
    return { ok: true, userId: id, outcome: 'created' };
  });
}
