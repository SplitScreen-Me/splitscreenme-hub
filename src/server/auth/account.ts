import 'server-only';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  authTokens,
  comments,
  handlerStars,
  handlers,
  oauthAccounts,
  reports,
  sessions,
  users,
} from '@/db/schema';
import { audit } from '@/lib/audit';
import { checkNewPassword, hashPassword, verifyPassword } from '@/lib/auth/password';
import { invalidateUserSessions } from '@/lib/auth/session';
import { check, hit, reset } from '@/lib/rate-limit';
import { invalidate, TAGS } from '@/server/cache';
import { fail, isUniqueViolation, ok, rateLimited, type Result } from './result';
import {
  PASSWORD_MESSAGES,
  USERNAME_CHANGE_COOLDOWN_DAYS,
  USERNAME_MESSAGES,
  usernameProblem,
} from './rules';
import { getUserById, usernameTaken } from './users';

/** Providers that can sign in (Facebook identities are imported but there is no Facebook login). */
export const LOGIN_PROVIDERS = ['discord', 'github', 'google'] as const;

const DAY = 24 * 60 * 60 * 1000;

/** Re-authentication for sensitive changes: the current password when the account has one. */
export async function confirmPassword(userId: string, password: string): Promise<Result> {
  const user = await getUserById(userId);
  if (!user) return fail('Account not found.');
  if (!user.passwordHash) return ok();
  const failures = check('login:account-failures', user.id);
  if (!failures.ok) return rateLimited(failures.retryAfter);
  const res = await verifyPassword(password, { hash: user.passwordHash, algo: user.passwordAlgo });
  if (!res.ok) {
    hit('login:account-failures', user.id);
    return fail('Your current password is wrong.', { currentPassword: ['Wrong password.'] });
  }
  reset('login:account-failures', user.id);
  return ok();
}

export async function changePassword(input: {
  userId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
  ip: string;
}): Promise<Result> {
  const user = await getUserById(input.userId);
  if (!user) return fail('Account not found.');
  const problem = checkNewPassword(input.newPassword, { username: user.username, email: user.email });
  if (problem) return fail('Please choose another password.', { newPassword: [PASSWORD_MESSAGES[problem]] });
  const confirmed = await confirmPassword(user.id, input.currentPassword);
  if (!confirmed.ok) return confirmed;
  const hash = await hashPassword(input.newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: hash, passwordAlgo: 'bcrypt' }).where(eq(users.id, user.id));
    await invalidateUserSessions(user.id, input.sessionId, tx);
    await audit(tx, {
      actor: { id: user.id, role: user.role },
      action: 'auth.password_changed',
      target: { type: 'user', id: user.id },
      details: { hadPassword: !!user.passwordHash },
      ip: input.ip,
    });
  });
  return ok();
}

export async function changeUsername(userId: string, raw: string): Promise<Result> {
  const username = raw.trim();
  const problem = usernameProblem(username);
  if (problem) return fail('Please choose another name.', { username: [USERNAME_MESSAGES[problem]] });
  const user = await getUserById(userId);
  if (!user) return fail('Account not found.');
  if (user.username === username) return ok();
  const caseOnly = user.username.toLowerCase() === username.toLowerCase();
  if (!caseOnly && user.usernameChangedAt) {
    const next = user.usernameChangedAt.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY;
    if (next > Date.now()) {
      const days = Math.ceil((next - Date.now()) / DAY);
      return fail(`You can change your name again in ${days} day${days > 1 ? 's' : ''}.`);
    }
  }
  if (!caseOnly && (await usernameTaken(username, user.id))) {
    return fail('Please choose another name.', { username: ['This name is taken.'] });
  }
  try {
    await db
      .update(users)
      .set({ username, ...(!caseOnly && { usernameChangedAt: new Date() }) })
      .where(eq(users.id, user.id));
  } catch (err) {
    if (isUniqueViolation(err))
      return fail('Please choose another name.', { username: ['This name is taken.'] });
    throw err;
  }
  invalidate(TAGS.authors, TAGS.catalog, TAGS.sitemap);
  return ok();
}

export async function setNotifyReplies(userId: string, on: boolean): Promise<void> {
  await db.update(users).set({ notifyReplies: on }).where(eq(users.id, userId));
}

export async function listLinkedProviders(userId: string) {
  return db
    .select({
      provider: oauthAccounts.provider,
      providerUsername: oauthAccounts.providerUsername,
      createdAt: oauthAccounts.createdAt,
      lastUsedAt: oauthAccounts.lastUsedAt,
    })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, userId))
    .orderBy(oauthAccounts.provider);
}

/** Allowed only if another way to sign in remains: a password or another login provider. */
export async function unlinkProvider(userId: string, provider: string, ip: string): Promise<Result> {
  const user = await getUserById(userId);
  if (!user) return fail('Account not found.');
  const linked = await listLinkedProviders(userId);
  const target = linked.find((l) => l.provider === provider);
  if (!target) return fail('This provider is not linked.');
  const othersThatLogIn = linked.filter(
    (l) => l.provider !== provider && (LOGIN_PROVIDERS as readonly string[]).includes(l.provider),
  );
  if (!user.passwordHash && othersThatLogIn.length === 0) {
    return fail('Set a password or link another provider first, or you could not sign in any more.');
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, target.provider)));
    await audit(tx, {
      actor: { id: user.id, role: user.role },
      action: 'auth.oauth_unlinked',
      target: { type: 'user', id: user.id },
      details: { provider: target.provider },
      ip,
    });
  });
  return ok();
}

export async function listSessions(userId: string) {
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastSeenAt));
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)));
}

export async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)));
}

/**
 * Anonymises an account (section 2.3): sessions, identities, tokens and stars go; the comments are
 * soft-deleted with their bodies cleared; handlers stay, shown as "Deleted user". Self-service and admin.
 */
export async function anonymiseUser(
  userId: string,
  actor: { id: string; role: string },
  ip: string,
): Promise<Result> {
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return fail('Account not found.');
  const self = actor.id === userId;
  const touched = await db.transaction(async (tx) => {
    // Stars: counters first, then rows.
    const starred = await tx
      .delete(handlerStars)
      .where(eq(handlerStars.userId, userId))
      .returning({ handlerId: handlerStars.handlerId });
    if (starred.length) {
      await tx
        .update(handlers)
        .set({ starCount: sql`greatest(${handlers.starCount} - 1, 0)` })
        .where(
          inArray(
            handlers.id,
            starred.map((s) => s.handlerId),
          ),
        );
    }
    // Comments: soft-delete the live ones (counters), clear every body.
    const live = await tx
      .update(comments)
      .set({ deletedAt: new Date(), deletedById: actor.id, deleteReason: 'account deleted', body: '' })
      .where(and(eq(comments.authorId, userId), isNull(comments.deletedAt)))
      .returning({ handlerId: comments.handlerId });
    await tx.update(comments).set({ body: '' }).where(eq(comments.authorId, userId));
    const perHandler = new Map<string, number>();
    for (const c of live) perHandler.set(c.handlerId, (perHandler.get(c.handlerId) ?? 0) + 1);
    for (const [handlerId, n] of perHandler) {
      await tx
        .update(handlers)
        .set({ commentCount: sql`greatest(${handlers.commentCount} - ${n}, 0)` })
        .where(eq(handlers.id, handlerId));
    }
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId));
    await tx.delete(authTokens).where(eq(authTokens.userId, userId));

    const short = `deleted-${userId.slice(0, 6)}`;
    const [clash] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.username}) = lower(${short})`, ne(users.id, userId)))
      .limit(1);
    await tx
      .update(users)
      .set({
        username: clash ? `deleted-${userId}` : short,
        email: null,
        emailVerifiedAt: null,
        emailVerifiedByModerator: false,
        passwordHash: null,
        passwordAlgo: null,
        notifyReplies: false,
        deletedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await audit(tx, {
      actor,
      action: self ? 'auth.account_deleted' : 'user.delete',
      target: { type: 'user', id: userId },
      details: { comments: live.length, stars: starred.length },
      ip,
    });
    return [...new Set([...starred.map((s) => s.handlerId), ...perHandler.keys()])];
  });
  invalidate(
    TAGS.catalog,
    TAGS.authors,
    TAGS.stats,
    TAGS.sitemap,
    ...touched.flatMap((id) => [TAGS.handler(id), TAGS.comments(id)]),
  );
  return ok();
}

/** Self-service deletion: the password when the account has one, else the username typed back. */
export async function deleteOwnAccount(input: {
  userId: string;
  password: string;
  confirmUsername: string;
  ip: string;
}): Promise<Result> {
  const user = await getUserById(input.userId);
  if (!user) return fail('Account not found.');
  if (user.passwordHash) {
    const confirmed = await confirmPassword(user.id, input.password);
    if (!confirmed.ok) return fail(confirmed.error, { password: ['Wrong password.'] });
  } else if (input.confirmUsername.trim() !== user.username) {
    return fail('Type your username exactly to confirm.', { confirmUsername: ['Does not match.'] });
  }
  return anonymiseUser(user.id, { id: user.id, role: user.role }, input.ip);
}

/** Everything we keep about the user, as JSON (GDPR access/portability). No hashes, no tokens. */
export async function exportUserData(userId: string) {
  const user = await getUserById(userId);
  if (!user) return null;
  const [identities, sessionRows, handlerRows, commentRows, starRows, reportRows] = await Promise.all([
    listLinkedProviders(userId),
    listSessions(userId),
    db
      .select({
        id: handlers.id,
        title: handlers.title,
        isPublic: handlers.isPublic,
        createdAt: handlers.createdAt,
        deletedAt: handlers.deletedAt,
      })
      .from(handlers)
      .where(eq(handlers.ownerId, userId)),
    db
      .select({
        id: comments.id,
        handlerId: comments.handlerId,
        parentId: comments.parentId,
        body: comments.body,
        createdAt: comments.createdAt,
        editedAt: comments.editedAt,
        deletedAt: comments.deletedAt,
      })
      .from(comments)
      .where(eq(comments.authorId, userId)),
    db
      .select({ handlerId: handlerStars.handlerId, createdAt: handlerStars.createdAt })
      .from(handlerStars)
      .where(eq(handlerStars.userId, userId)),
    db
      .select({
        id: reports.id,
        targetType: reports.targetType,
        handlerId: reports.handlerId,
        commentId: reports.commentId,
        reason: reports.reason,
        message: reports.message,
        status: reports.status,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.reporterId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      hasPassword: !!user.passwordHash,
      role: user.role,
      trustedAuthor: user.trustedAuthor,
      notifyReplies: user.notifyReplies,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      usernameChangedAt: user.usernameChangedAt,
    },
    linkedAccounts: identities,
    sessions: sessionRows.map(({ id: _id, ...s }) => s),
    handlers: handlerRows,
    comments: commentRows,
    stars: starRows,
    reports: reportRows,
  };
}
