import 'server-only';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  comments,
  gameSlugRedirects,
  games,
  handlerVersions,
  handlers,
  reports,
  sessions,
  users,
  type UserRole,
} from '@/db/schema';
import { audit } from '@/lib/audit';
import { can, type Actor } from '@/lib/auth/permissions';
import { invalidateUserSessions } from '@/lib/auth/session';
import { igdbEnabled } from '@/lib/env';
import { hit } from '@/lib/rate-limit';
import { RESERVED_GAME_SLUGS, SLUG_PATTERN } from '@/lib/slug';
import { invalidate, TAGS } from '@/server/cache';
import { upsertGameFromIgdb } from '@/server/games/upsert';
import { anonymiseUser } from '@/server/auth/account';
import { fail, ok, rateLimited, type Fail, type Result } from '@/server/auth/result';

/**
 * Moderator and admin writes (section 6.2). Every function checks `can()` itself, rate-limits with the
 * `admin-write` bucket and audits in the same transaction.
 */

const DENIED = fail('You are not allowed to do this.');

function guard(actor: Actor, action: Parameters<typeof can>[1]): Fail | null {
  if (!can(actor, action)) return DENIED;
  const limited = hit('admin-write', actor.id);
  return limited.ok ? null : rateLimited(limited.retryAfter);
}

const note = (s: string | null | undefined, max = 1000) => s?.trim().slice(0, max) || null;

async function handlerFacts(handlerId: string) {
  const [h] = await db
    .select({
      id: handlers.id,
      gameId: handlers.gameId,
      gameSlug: games.slug,
      ownerId: handlers.ownerId,
      approvedAt: handlers.approvedAt,
      deletedAt: handlers.deletedAt,
      currentVersionId: handlers.currentVersionId,
    })
    .from(handlers)
    .innerJoin(games, eq(games.id, handlers.gameId))
    .where(eq(handlers.id, handlerId))
    .limit(1);
  return h ?? null;
}

function invalidateHandler(h: { id: string; gameSlug: string }) {
  invalidate(
    TAGS.handler(h.id),
    TAGS.game(h.gameSlug),
    TAGS.catalog,
    TAGS.stats,
    TAGS.genres,
    TAGS.authors,
    TAGS.sitemap,
  );
}

// ---------- handlers ----------

export async function setHandlerApproval(
  actor: Actor,
  handlerId: string,
  approve: boolean,
  ip: string,
  reason?: string,
): Promise<Result> {
  const denied = guard(actor, 'handler.approve');
  if (denied) return denied;
  const h = await handlerFacts(handlerId);
  if (!h || h.deletedAt) return fail('Handler not found.');
  if (!!h.approvedAt === approve) return ok();
  await db.transaction(async (tx) => {
    await tx
      .update(handlers)
      .set(
        approve
          ? { approvedAt: new Date(), approvedById: actor.id }
          : { approvedAt: null, approvedById: null },
      )
      .where(eq(handlers.id, handlerId));
    await audit(tx, {
      actor,
      action: approve ? 'handler.approve' : 'handler.revoke',
      target: { type: 'handler', id: handlerId },
      details: note(reason) ? { reason: note(reason) } : {},
      ip,
    });
  });
  invalidateHandler(h);
  return ok();
}

export async function setVersionVerified(
  actor: Actor,
  versionId: string,
  verify: boolean,
  ip: string,
): Promise<Result> {
  const denied = guard(actor, 'version.verify');
  if (denied) return denied;
  const [v] = await db
    .select({
      id: handlerVersions.id,
      handlerId: handlerVersions.handlerId,
      verifiedAt: handlerVersions.verifiedAt,
      version: handlerVersions.version,
    })
    .from(handlerVersions)
    .where(and(eq(handlerVersions.id, versionId), isNull(handlerVersions.deletedAt)))
    .limit(1);
  if (!v) return fail('Version not found.');
  if (!!v.verifiedAt === verify) return ok();
  await db.transaction(async (tx) => {
    await tx
      .update(handlerVersions)
      .set(
        verify
          ? { verifiedAt: new Date(), verifiedById: actor.id }
          : { verifiedAt: null, verifiedById: null },
      )
      .where(eq(handlerVersions.id, versionId));
    await audit(tx, {
      actor,
      action: verify ? 'version.verify' : 'version.unverify',
      target: { type: 'version', id: versionId },
      details: { handlerId: v.handlerId, version: v.version },
      ip,
    });
  });
  const h = await handlerFacts(v.handlerId);
  if (h) invalidateHandler(h);
  return ok();
}

/** Soft-deletes a version. If it was current, the newest remaining version becomes current (or none: draft). */
export async function softDeleteVersion(
  actor: Actor,
  versionId: string,
  ip: string,
  reason?: string,
): Promise<Result> {
  const denied = guard(actor, 'version.verify');
  if (denied) return denied;
  const [v] = await db
    .select({
      id: handlerVersions.id,
      handlerId: handlerVersions.handlerId,
      version: handlerVersions.version,
    })
    .from(handlerVersions)
    .where(and(eq(handlerVersions.id, versionId), isNull(handlerVersions.deletedAt)))
    .limit(1);
  if (!v) return fail('Version not found.');
  await db.transaction(async (tx) => {
    await tx.update(handlerVersions).set({ deletedAt: new Date() }).where(eq(handlerVersions.id, versionId));
    const [h] = await tx
      .select({ currentVersionId: handlers.currentVersionId })
      .from(handlers)
      .where(eq(handlers.id, v.handlerId))
      .for('update');
    if (h?.currentVersionId === versionId) {
      const [prev] = await tx
        .select({ id: handlerVersions.id, version: handlerVersions.version })
        .from(handlerVersions)
        .where(and(eq(handlerVersions.handlerId, v.handlerId), isNull(handlerVersions.deletedAt)))
        .orderBy(desc(handlerVersions.version))
        .limit(1);
      await tx
        .update(handlers)
        .set(
          prev
            ? { currentVersionId: prev.id, currentVersion: prev.version }
            : { currentVersionId: null, isPublic: false },
        )
        .where(eq(handlers.id, v.handlerId));
    }
    await audit(tx, {
      actor,
      action: 'version.delete',
      target: { type: 'version', id: versionId },
      details: { handlerId: v.handlerId, version: v.version, ...(note(reason) && { reason: note(reason) }) },
      ip,
    });
  });
  const h = await handlerFacts(v.handlerId);
  if (h) invalidateHandler(h);
  return ok();
}

export async function moderatorDeleteHandler(
  actor: Actor,
  handlerId: string,
  ip: string,
  reason?: string,
): Promise<Result> {
  const denied = guard(actor, 'handler.approve');
  if (denied) return denied;
  const h = await handlerFacts(handlerId);
  if (!h || h.deletedAt) return fail('Handler not found.');
  await db.transaction(async (tx) => {
    await tx
      .update(handlers)
      .set({ deletedAt: new Date(), deletedById: actor.id })
      .where(eq(handlers.id, handlerId));
    await tx
      .update(games)
      .set({ featuredHandlerId: null })
      .where(and(eq(games.id, h.gameId), eq(games.featuredHandlerId, handlerId)));
    await audit(tx, {
      actor,
      action: 'handler.delete',
      target: { type: 'handler', id: handlerId },
      details: note(reason) ? { reason: note(reason) } : {},
      ip,
    });
  });
  invalidateHandler(h);
  return ok();
}

export async function restoreHandler(actor: Actor, handlerId: string, ip: string): Promise<Result> {
  const denied = guard(actor, 'handler.restore');
  if (denied) return denied;
  const h = await handlerFacts(handlerId);
  if (!h?.deletedAt) return fail('This handler is not deleted.');
  await db.transaction(async (tx) => {
    await tx.update(handlers).set({ deletedAt: null, deletedById: null }).where(eq(handlers.id, handlerId));
    await audit(tx, { actor, action: 'handler.restore', target: { type: 'handler', id: handlerId }, ip });
  });
  invalidateHandler(h);
  return ok();
}

export async function transferHandler(
  actor: Actor,
  handlerId: string,
  newOwner: string,
  ip: string,
): Promise<Result> {
  const denied = guard(actor, 'handler.transfer');
  if (denied) return denied;
  const h = await handlerFacts(handlerId);
  if (!h) return fail('Handler not found.');
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.username}) = lower(${newOwner.trim()})`, isNull(users.deletedAt)))
    .limit(1);
  if (!u) return fail('No live user has this username.', { username: ['Unknown user.'] });
  if (u.id === h.ownerId) return ok();
  await db.transaction(async (tx) => {
    await tx.update(handlers).set({ ownerId: u.id }).where(eq(handlers.id, handlerId));
    await audit(tx, {
      actor,
      action: 'handler.transfer',
      target: { type: 'handler', id: handlerId },
      details: { fromUserId: h.ownerId, toUserId: u.id },
      ip,
    });
  });
  invalidateHandler(h);
  return ok();
}

// ---------- reports ----------

/** open_report_count counts open reports that target the handler itself (as the daily reconcile does). */
async function recountOpenReports(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  handlerId: string,
) {
  await tx.execute(sql`
    update handlers set open_report_count = (
      select count(*) from reports where handler_id = ${handlerId} and target_type = 'handler' and status = 'open'
    ) where id = ${handlerId}`);
}

export async function closeReports(
  actor: Actor,
  reportIds: number[],
  outcome: 'resolved' | 'dismissed',
  resolution: string | null,
  ip: string,
): Promise<Result<{ closed: number }>> {
  const denied = guard(actor, 'report.resolve');
  if (denied) return denied;
  const ids = [...new Set(reportIds.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 200);
  if (!ids.length) return fail('Pick at least one report.');
  const closed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(reports)
      .set({
        status: outcome,
        resolutionNote: note(resolution),
        resolvedById: actor.id,
        resolvedAt: new Date(),
      })
      .where(and(inArray(reports.id, ids), eq(reports.status, 'open')))
      .returning({ id: reports.id, handlerId: reports.handlerId });
    const touched = new Set(rows.map((r) => r.handlerId).filter((x): x is string => !!x));
    for (const handlerId of touched) await recountOpenReports(tx, handlerId);
    for (const r of rows) {
      await audit(tx, {
        actor,
        action: outcome === 'resolved' ? 'report.resolve' : 'report.dismiss',
        target: { type: 'report', id: r.id },
        details: { handlerId: r.handlerId, ...(note(resolution) && { note: note(resolution, 200) }) },
        ip,
      });
    }
    return rows.length;
  });
  return ok({ closed });
}

// ---------- users ----------

async function userFacts(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}

export async function changeRole(actor: Actor, userId: string, role: UserRole, ip: string): Promise<Result> {
  const denied = guard(actor, 'user.role');
  if (denied) return denied;
  if (!['user', 'moderator', 'admin'].includes(role)) return fail('Unknown role.');
  if (userId === actor.id) return fail('You cannot change your own role.');
  const u = await userFacts(userId);
  if (!u || u.deletedAt) return fail('User not found.');
  if (u.role === role) return ok();
  const result = await db.transaction(async (tx): Promise<Result> => {
    if (u.role === 'admin') {
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(users)
        .where(
          and(eq(users.role, 'admin'), isNull(users.deletedAt), isNull(users.bannedAt), ne(users.id, userId)),
        );
      if (n === 0) return fail('The last admin cannot be demoted.');
    }
    await tx.update(users).set({ role }).where(eq(users.id, userId));
    await invalidateUserSessions(userId, undefined, tx);
    await audit(tx, {
      actor,
      action: 'user.role_change',
      target: { type: 'user', id: userId },
      details: { from: u.role, to: role },
      ip,
    });
    return ok();
  });
  return result;
}

export async function setBan(
  actor: Actor,
  userId: string,
  ban: boolean,
  opts: { reason?: string; unpublishHandlers?: boolean },
  ip: string,
): Promise<Result<{ unpublished: number }>> {
  const denied = guard(actor, 'user.ban');
  if (denied) return denied;
  if (userId === actor.id) return fail('You cannot ban yourself.');
  const u = await userFacts(userId);
  if (!u || u.deletedAt) return fail('User not found.');
  if (ban && u.role === 'admin') return fail('Demote this admin before banning them.');
  if (!!u.bannedAt === ban) return ok({ unpublished: 0 });
  const unpublished = await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set(
        ban
          ? { bannedAt: new Date(), banReason: note(ban ? opts.reason : null, 500) }
          : { bannedAt: null, banReason: null },
      )
      .where(eq(users.id, userId));
    let n = 0;
    if (ban) {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      if (opts.unpublishHandlers) {
        const rows = await tx
          .update(handlers)
          .set({ isPublic: false })
          .where(and(eq(handlers.ownerId, userId), eq(handlers.isPublic, true)))
          .returning({ id: handlers.id });
        n = rows.length;
      }
    }
    await audit(tx, {
      actor,
      action: ban ? 'user.ban' : 'user.unban',
      target: { type: 'user', id: userId },
      details: ban ? { reason: note(opts.reason, 500), unpublishedHandlers: n } : {},
      ip,
    });
    return n;
  });
  invalidate(TAGS.catalog, TAGS.authors, TAGS.stats, TAGS.sitemap, TAGS.genres);
  return ok({ unpublished });
}

export async function markEmailVerified(actor: Actor, userId: string, ip: string): Promise<Result> {
  const denied = guard(actor, 'user.verify_email');
  if (denied) return denied;
  const u = await userFacts(userId);
  if (!u || u.deletedAt) return fail('User not found.');
  if (!u.email) return fail('This user has no email address.');
  if (u.emailVerifiedAt) return ok();
  await db.transaction(async (tx) => {
    // Lets the account post, but is no inbox proof: OAuth linking by email does not trust it (4.4).
    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), emailVerifiedByModerator: true })
      .where(eq(users.id, userId));
    await audit(tx, { actor, action: 'user.verify_email', target: { type: 'user', id: userId }, ip });
  });
  return ok();
}

export async function setTrustedAuthor(
  actor: Actor,
  userId: string,
  trusted: boolean,
  ip: string,
): Promise<Result> {
  const denied = guard(actor, 'user.trusted');
  if (denied) return denied;
  const u = await userFacts(userId);
  if (!u || u.deletedAt) return fail('User not found.');
  if (u.trustedAuthor === trusted) return ok();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ trustedAuthor: trusted }).where(eq(users.id, userId));
    await audit(tx, {
      actor,
      action: 'user.trusted',
      target: { type: 'user', id: userId },
      details: { trusted },
      ip,
    });
  });
  return ok();
}

export async function adminDeleteUser(actor: Actor, userId: string, ip: string): Promise<Result> {
  const denied = guard(actor, 'user.delete');
  if (denied) return denied;
  if (userId === actor.id) return fail('Delete your own account from your account page.');
  const u = await userFacts(userId);
  if (!u || u.deletedAt) return fail('User not found.');
  if (u.role === 'admin') return fail('Demote this admin first.');
  return anonymiseUser(userId, actor, ip);
}

// ---------- comments ----------

export async function hideComments(
  actor: Actor,
  ids: string[],
  reason: string | null,
  ip: string,
): Promise<Result<{ hidden: number }>> {
  const denied = guard(actor, 'comment.hide');
  if (denied) return denied;
  const unique = [...new Set(ids)].slice(0, 100);
  const touched = await db.transaction(async (tx) => {
    const rows = await tx
      .update(comments)
      .set({ deletedAt: new Date(), deletedById: actor.id, deleteReason: note(reason, 500) })
      .where(and(inArray(comments.id, unique.length ? unique : ['']), isNull(comments.deletedAt)))
      .returning({ id: comments.id, handlerId: comments.handlerId });
    for (const r of rows) {
      await tx
        .update(handlers)
        .set({ commentCount: sql`greatest(${handlers.commentCount} - 1, 0)` })
        .where(eq(handlers.id, r.handlerId));
      await audit(tx, {
        actor,
        action: 'comment.delete',
        target: { type: 'comment', id: r.id },
        details: { handlerId: r.handlerId, own: false, ...(note(reason) && { reason: note(reason, 200) }) },
        ip,
      });
    }
    return rows;
  });
  for (const r of touched) invalidate(TAGS.comments(r.handlerId), TAGS.handler(r.handlerId));
  if (touched.length) invalidate(TAGS.stats);
  return ok({ hidden: touched.length });
}

// ---------- games ----------

export async function updateGame(
  actor: Actor,
  gameId: number,
  input: { slug: string; steamAppId: number | null; featuredHandlerId: string | null },
  ip: string,
): Promise<Result> {
  const denied = guard(actor, 'game.edit');
  if (denied) return denied;
  const [g] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!g) return fail('Game not found.');
  const slug = input.slug.trim().toLowerCase();
  const fields: Record<string, string[]> = {};
  if (!SLUG_PATTERN.test(slug) || slug.length > 80)
    fields.slug = ['Lower-case letters, digits and single dashes, 80 max.'];
  else if (RESERVED_GAME_SLUGS.has(slug)) fields.slug = ['This slug is reserved.'];
  if (input.steamAppId !== null && !(Number.isSafeInteger(input.steamAppId) && input.steamAppId > 0)) {
    fields.steamAppId = ['A positive number, or empty.'];
  }
  if (Object.keys(fields).length) return fail('Please fix the fields below.', fields);

  if (slug !== g.slug) {
    const [clash] = await db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.slug, slug), ne(games.id, gameId)))
      .limit(1);
    const [redirect] = await db
      .select({ gameId: gameSlugRedirects.gameId })
      .from(gameSlugRedirects)
      .where(eq(gameSlugRedirects.oldSlug, slug))
      .limit(1);
    if (clash || (redirect && redirect.gameId !== gameId)) {
      return fail('Please fix the fields below.', { slug: ['Another game uses this slug.'] });
    }
  }
  if (input.featuredHandlerId) {
    const [h] = await db
      .select({ id: handlers.id })
      .from(handlers)
      .where(
        and(
          eq(handlers.id, input.featuredHandlerId),
          eq(handlers.gameId, gameId),
          isNull(handlers.deletedAt),
        ),
      )
      .limit(1);
    if (!h)
      return fail('Please fix the fields below.', { featuredHandlerId: ['Not a handler of this game.'] });
  }

  const changed: string[] = [];
  if (slug !== g.slug) changed.push('slug');
  if (input.steamAppId !== g.steamAppId) changed.push('steamAppId');
  if (input.featuredHandlerId !== g.featuredHandlerId) changed.push('featuredHandlerId');
  if (!changed.length) return ok();

  await db.transaction(async (tx) => {
    if (slug !== g.slug) {
      // The new slug may be one of this game's old slugs: it stops being a redirect.
      await tx.delete(gameSlugRedirects).where(eq(gameSlugRedirects.oldSlug, slug));
      await tx.insert(gameSlugRedirects).values({ oldSlug: g.slug, gameId }).onConflictDoNothing();
    }
    await tx
      .update(games)
      .set({ slug, steamAppId: input.steamAppId, featuredHandlerId: input.featuredHandlerId })
      .where(eq(games.id, gameId));
    await audit(tx, {
      actor,
      action: 'game.update',
      target: { type: 'game', id: gameId },
      details: { fields: changed, ...(slug !== g.slug && { fromSlug: g.slug, toSlug: slug }) },
      ip,
    });
  });
  invalidate(TAGS.game(g.slug), TAGS.game(slug), TAGS.catalog, TAGS.sitemap, TAGS.genres);
  return ok();
}

export async function refreshGame(actor: Actor, gameId: number, ip: string): Promise<Result> {
  const denied = guard(actor, 'game.edit');
  if (denied) return denied;
  if (!igdbEnabled()) return fail('IGDB credentials are not configured on this server.');
  const limited = hit('igdb-search', actor.id);
  if (!limited.ok) return rateLimited(limited.retryAfter);
  const [g] = await db
    .select({ igdbId: games.igdbId, slug: games.slug })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  if (!g?.igdbId) return fail('This game has no IGDB id.');
  try {
    await upsertGameFromIgdb(g.igdbId);
  } catch {
    return fail('IGDB did not answer. Try again in a moment.');
  }
  await audit(db, { actor, action: 'game.refresh', target: { type: 'game', id: gameId }, ip });
  invalidate(TAGS.game(g.slug));
  return ok();
}
