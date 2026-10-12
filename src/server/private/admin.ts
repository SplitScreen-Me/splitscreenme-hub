import 'server-only';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import {
  auditLog,
  comments,
  gameSlugRedirects,
  games,
  handlerVersions,
  handlers,
  oauthAccounts,
  reports,
  users,
} from '@/db/schema';
import { handlerState } from '@/server/public';
import { listVersions } from './dashboard';

/** Backoffice reads (moderators and admins; the pages call requireRole first). */

export const PAGE_SIZE = 50;

const likeTerm = (q: string) =>
  `%${q
    .trim()
    .slice(0, 100)
    .replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export async function adminCounters() {
  const [row] = await db.execute<{
    awaiting: number;
    unverified: number;
    open_reports: number;
    comments_24h: number;
    users_24h: number;
    uploads_24h: number;
  }>(sql`
    select
      (select count(*) from handlers where deleted_at is null and is_public and approved_at is null and current_version_id is not null)::int as awaiting,
      (select count(*) from handlers h join handler_versions v on v.id = h.current_version_id
        where h.deleted_at is null and h.is_public and h.approved_at is not null and v.verified_at is null)::int as unverified,
      (select count(*) from reports where status = 'open')::int as open_reports,
      (select count(*) from comments where created_at > now() - interval '24 hours')::int as comments_24h,
      (select count(*) from users where created_at > now() - interval '24 hours')::int as users_24h,
      (select count(*) from handler_versions where created_at > now() - interval '24 hours')::int as uploads_24h`);
  return {
    awaiting: row?.awaiting ?? 0,
    unverified: row?.unverified ?? 0,
    openReports: row?.open_reports ?? 0,
    comments24h: row?.comments_24h ?? 0,
    users24h: row?.users_24h ?? 0,
    uploads24h: row?.uploads_24h ?? 0,
  };
}

export type HandlerQueue = 'awaiting' | 'unverified' | 'reported' | 'deleted' | 'all';

export async function listHandlersForReview(queue: HandlerQueue, q: string, page: number) {
  const conds: (SQL | undefined)[] = [];
  if (queue === 'awaiting') {
    conds.push(
      isNull(handlers.deletedAt),
      eq(handlers.isPublic, true),
      isNull(handlers.approvedAt),
      isNotNull(handlers.currentVersionId),
    );
  } else if (queue === 'unverified') {
    conds.push(
      isNull(handlers.deletedAt),
      isNotNull(handlers.currentVersionId),
      isNull(handlerVersions.verifiedAt),
      eq(handlers.isPublic, true),
    );
  } else if (queue === 'reported') {
    conds.push(sql`${handlers.openReportCount} > 0`);
  } else if (queue === 'deleted') {
    conds.push(isNotNull(handlers.deletedAt));
  }
  if (q.trim()) {
    const t = likeTerm(q);
    conds.push(
      or(ilike(handlers.title, t), ilike(games.name, t), ilike(users.username, t), eq(handlers.id, q.trim())),
    );
  }
  const where = and(...conds);
  const base = db
    .select({
      id: handlers.id,
      title: handlers.title,
      gameName: games.name,
      ownerName: users.username,
      ownerId: users.id,
      isPublic: handlers.isPublic,
      approvedAt: handlers.approvedAt,
      currentVersionId: handlers.currentVersionId,
      currentVersion: handlers.currentVersion,
      verifiedAt: handlerVersions.verifiedAt,
      deletedAt: handlers.deletedAt,
      openReportCount: handlers.openReportCount,
      downloadCount: handlers.downloadCount,
      updatedAt: handlers.updatedAt,
    })
    .from(handlers)
    .innerJoin(games, eq(games.id, handlers.gameId))
    .innerJoin(users, eq(users.id, handlers.ownerId))
    .leftJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
    .where(where);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    base
      .orderBy(queue === 'reported' ? desc(handlers.openReportCount) : desc(handlers.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(handlers)
      .innerJoin(games, eq(games.id, handlers.gameId))
      .innerJoin(users, eq(users.id, handlers.ownerId))
      .leftJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
      .where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r, state: handlerState(r) })), total };
}

export async function getHandlerForReview(handlerId: string) {
  const approver = alias(users, 'approver');
  const [h] = await db
    .select({
      id: handlers.id,
      title: handlers.title,
      description: handlers.description,
      maxPlayers: handlers.maxPlayers,
      isPublic: handlers.isPublic,
      approvedAt: handlers.approvedAt,
      approvedBy: approver.username,
      currentVersionId: handlers.currentVersionId,
      currentVersion: handlers.currentVersion,
      deletedAt: handlers.deletedAt,
      openReportCount: handlers.openReportCount,
      downloadCount: handlers.downloadCount,
      starCount: handlers.starCount,
      commentCount: handlers.commentCount,
      createdAt: handlers.createdAt,
      updatedAt: handlers.updatedAt,
      ownerId: users.id,
      ownerName: users.username,
      ownerTrusted: users.trustedAuthor,
      ownerBannedAt: users.bannedAt,
      gameId: games.id,
      gameName: games.name,
      gameSlug: games.slug,
    })
    .from(handlers)
    .innerJoin(games, eq(games.id, handlers.gameId))
    .innerJoin(users, eq(users.id, handlers.ownerId))
    .leftJoin(approver, eq(approver.id, handlers.approvedById))
    .where(eq(handlers.id, handlerId))
    .limit(1);
  if (!h) return null;
  const versions = await listVersions(handlerId, { includeDeleted: true });
  return { ...h, state: handlerState(h), versions };
}

/** One version's manifest and stamped script (moderator inspection). */
export async function getVersionInspection(handlerId: string, version: number) {
  const [v] = await db
    .select({
      id: handlerVersions.id,
      version: handlerVersions.version,
      manifest: handlerVersions.manifest,
      script: handlerVersions.script,
      sha256: handlerVersions.sha256,
      sizeBytes: handlerVersions.sizeBytes,
      verifiedAt: handlerVersions.verifiedAt,
      deletedAt: handlerVersions.deletedAt,
    })
    .from(handlerVersions)
    .where(and(eq(handlerVersions.handlerId, handlerId), eq(handlerVersions.version, version)))
    .limit(1);
  return v ?? null;
}

// ---------- reports ----------

export async function listReports(status: 'open' | 'resolved' | 'dismissed', page: number) {
  const reporter = alias(users, 'reporter');
  const resolver = alias(users, 'resolver');
  const commentAuthor = alias(users, 'comment_author');
  const rows = await db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      handlerId: reports.handlerId,
      commentId: reports.commentId,
      version: reports.version,
      reason: reports.reason,
      message: reports.message,
      source: reports.source,
      status: reports.status,
      resolutionNote: reports.resolutionNote,
      resolvedAt: reports.resolvedAt,
      createdAt: reports.createdAt,
      reporterName: reporter.username,
      resolverName: resolver.username,
      handlerTitle: handlers.title,
      gameName: games.name,
      commentBody: comments.body,
      commentDeletedAt: comments.deletedAt,
      commentAuthorName: commentAuthor.username,
    })
    .from(reports)
    .leftJoin(reporter, eq(reporter.id, reports.reporterId))
    .leftJoin(resolver, eq(resolver.id, reports.resolvedById))
    .leftJoin(comments, eq(comments.id, reports.commentId))
    .leftJoin(commentAuthor, eq(commentAuthor.id, comments.authorId))
    .leftJoin(handlers, eq(handlers.id, sql`coalesce(${reports.handlerId}, ${comments.handlerId})`))
    .leftJoin(games, eq(games.id, handlers.gameId))
    .where(eq(reports.status, status))
    .orderBy(status === 'open' ? desc(reports.createdAt) : desc(reports.resolvedAt))
    .limit(200)
    .offset((page - 1) * 200);
  // Grouped by target: a handler (and its comments' reports) or a lone comment.
  const groups = new Map<
    string,
    { key: string; handlerId: string | null; title: string; gameName: string | null; items: typeof rows }
  >();
  for (const r of rows) {
    const key = r.targetType === 'comment' ? `comment:${r.commentId}` : `handler:${r.handlerId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        handlerId: r.handlerId,
        title:
          r.targetType === 'comment'
            ? `Comment by ${r.commentAuthorName ?? 'a deleted user'}`
            : (r.handlerTitle ?? 'Deleted handler'),
        gameName: r.gameName,
        items: [],
      };
      groups.set(key, g);
    }
    g.items.push(r);
  }
  return [...groups.values()];
}

// ---------- users ----------

export async function searchUsers(input: {
  q: string;
  role?: string;
  banned?: boolean;
  byEmail: boolean;
  page: number;
}) {
  const conds: (SQL | undefined)[] = [];
  const q = input.q.trim();
  if (q) {
    const t = likeTerm(q);
    conds.push(
      or(
        ilike(users.username, t),
        eq(users.id, q),
        input.byEmail && q.includes('@') ? sql`lower(${users.email}) = lower(${q})` : undefined,
      ),
    );
  }
  if (input.role === 'user' || input.role === 'moderator' || input.role === 'admin')
    conds.push(eq(users.role, input.role));
  if (input.banned) conds.push(isNotNull(users.bannedAt));
  const where = and(...conds);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        trustedAuthor: users.trustedAuthor,
        emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
        hasEmail: sql<boolean>`${users.email} is not null`,
        bannedAt: users.bannedAt,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        handlers:
          sql<number>`(select count(*) from handlers h where h.owner_id = "users"."id" and h.deleted_at is null)`.mapWith(
            Number,
          ),
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((input.page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(users)
      .where(where),
  ]);
  return { rows, total };
}

export async function getUserForAdmin(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  const [providers, owned, recentComments, [counts]] = await Promise.all([
    db
      .select({
        provider: oauthAccounts.provider,
        providerUsername: oauthAccounts.providerUsername,
        createdAt: oauthAccounts.createdAt,
      })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, userId)),
    db
      .select({
        id: handlers.id,
        title: handlers.title,
        gameName: games.name,
        isPublic: handlers.isPublic,
        approvedAt: handlers.approvedAt,
        currentVersionId: handlers.currentVersionId,
        deletedAt: handlers.deletedAt,
        downloadCount: handlers.downloadCount,
      })
      .from(handlers)
      .innerJoin(games, eq(games.id, handlers.gameId))
      .where(eq(handlers.ownerId, userId))
      .orderBy(desc(handlers.updatedAt))
      .limit(100),
    db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        deletedAt: comments.deletedAt,
        handlerId: comments.handlerId,
        handlerTitle: handlers.title,
      })
      .from(comments)
      .innerJoin(handlers, eq(handlers.id, comments.handlerId))
      .where(eq(comments.authorId, userId))
      .orderBy(desc(comments.createdAt))
      .limit(20),
    db
      .select({
        comments:
          sql<number>`(select count(*) from ${comments} where ${comments.authorId} = ${userId})`.mapWith(
            Number,
          ),
        reportsFiled:
          sql<number>`(select count(*) from ${reports} where ${reports.reporterId} = ${userId})`.mapWith(
            Number,
          ),
      })
      .from(sql`(select 1) as one`),
  ]);
  return {
    user: u,
    providers,
    handlers: owned.map((h) => ({ ...h, state: handlerState(h) })),
    recentComments,
    counts: counts ?? { comments: 0, reportsFiled: 0 },
  };
}

// ---------- comments ----------

export async function listCommentsForModeration(input: {
  q: string;
  status: 'live' | 'deleted' | 'all';
  handlerId?: string;
  page: number;
}) {
  const author = alias(users, 'author');
  const deleter = alias(users, 'deleter');
  const conds: (SQL | undefined)[] = [];
  if (input.status === 'live') conds.push(isNull(comments.deletedAt));
  if (input.status === 'deleted') conds.push(isNotNull(comments.deletedAt));
  if (input.handlerId) conds.push(eq(comments.handlerId, input.handlerId));
  if (input.q.trim()) {
    const t = likeTerm(input.q);
    conds.push(or(ilike(comments.body, t), ilike(author.username, t)));
  }
  const where = and(...conds);
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      deletedAt: comments.deletedAt,
      deleteReason: comments.deleteReason,
      deletedByName: deleter.username,
      deletedById: comments.deletedById,
      parentId: comments.parentId,
      authorId: comments.authorId,
      authorName: author.username,
      authorDeletedAt: author.deletedAt,
      handlerId: comments.handlerId,
      handlerTitle: handlers.title,
      gameSlug: games.slug,
    })
    .from(comments)
    .leftJoin(author, eq(author.id, comments.authorId))
    .leftJoin(deleter, eq(deleter.id, comments.deletedById))
    .innerJoin(handlers, eq(handlers.id, comments.handlerId))
    .innerJoin(games, eq(games.id, handlers.gameId))
    .where(where)
    .orderBy(desc(comments.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset((input.page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

// ---------- games ----------

export async function listGamesForAdmin(q: string, page: number) {
  const where = q.trim() ? or(ilike(games.name, likeTerm(q)), ilike(games.slug, likeTerm(q))) : undefined;
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: games.id,
        name: games.name,
        slug: games.slug,
        igdbId: games.igdbId,
        steamAppId: games.steamAppId,
        releaseYear: games.releaseYear,
        igdbSyncedAt: games.igdbSyncedAt,
        handlers:
          sql<number>`(select count(*) from handlers h where h.game_id = "games"."id" and h.deleted_at is null)`.mapWith(
            Number,
          ),
      })
      .from(games)
      .where(where)
      .orderBy(games.name)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(games)
      .where(where),
  ]);
  return { rows, total };
}

export async function getGameForAdmin(gameId: number) {
  const [g] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!g) return null;
  const [gameHandlers, redirects] = await Promise.all([
    db
      .select({
        id: handlers.id,
        title: handlers.title,
        ownerName: users.username,
        isPublic: handlers.isPublic,
        approvedAt: handlers.approvedAt,
        currentVersionId: handlers.currentVersionId,
        deletedAt: handlers.deletedAt,
        downloadCount: handlers.downloadCount,
      })
      .from(handlers)
      .innerJoin(users, eq(users.id, handlers.ownerId))
      .where(and(eq(handlers.gameId, gameId), isNull(handlers.deletedAt)))
      .orderBy(desc(handlers.downloadCount)),
    db
      .select({ oldSlug: gameSlugRedirects.oldSlug })
      .from(gameSlugRedirects)
      .where(eq(gameSlugRedirects.gameId, gameId)),
  ]);
  return { game: g, handlers: gameHandlers.map((h) => ({ ...h, state: handlerState(h) })), redirects };
}

// ---------- audit ----------

export async function listAudit(input: {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  before?: number;
}) {
  const actor = alias(users, 'actor');
  const conds: (SQL | undefined)[] = [];
  if (input.actor?.trim()) {
    const a = input.actor.trim();
    conds.push(or(eq(auditLog.actorId, a), sql`lower(${actor.username}) = lower(${a})`));
  }
  if (input.action?.trim())
    conds.push(sql`${auditLog.action} like ${`${input.action.trim().replace(/[%_\\]/g, '')}%`}`);
  if (input.targetType?.trim()) conds.push(eq(auditLog.targetType, input.targetType.trim()));
  if (input.targetId?.trim()) conds.push(eq(auditLog.targetId, input.targetId.trim()));
  if (input.from && /^\d{4}-\d{2}-\d{2}$/.test(input.from))
    conds.push(gte(auditLog.at, new Date(`${input.from}T00:00:00Z`)));
  if (input.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to))
    conds.push(lte(auditLog.at, new Date(`${input.to}T23:59:59.999Z`)));
  if (input.before) conds.push(lt(auditLog.id, input.before));
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      actorId: auditLog.actorId,
      actorRole: auditLog.actorRole,
      actorName: actor.username,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      details: auditLog.details,
    })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorId))
    .where(and(...conds))
    .orderBy(desc(auditLog.id))
    .limit(PAGE_SIZE + 1);
  return {
    rows: rows.slice(0, PAGE_SIZE),
    nextBefore: rows.length > PAGE_SIZE ? rows[PAGE_SIZE - 1]!.id : null,
  };
}

/** Usernames of a set of ids (audit details). */
export async function usernamesOf(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.username]));
}
