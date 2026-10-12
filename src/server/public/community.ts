import 'server-only';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { comments, handlerStars, handlers, users } from '@/db/schema';
import { cached, TAGS } from '../cache';
import { listedSummaries, toPublicHandler } from './handlers';
import { DELETED_USER_NAME, type PublicAuthor, type PublicComment, type TopAuthor } from './types';
import { listedHandler } from './visibility';

const parent = alias(comments, 'parent');

/**
 * Comments of a listed handler, newest first, replies flat. Deleted comments are excluded; a reply whose
 * root is gone comes back with parentId null. null when the handler is not listed.
 */
export async function getComments(
  handlerId: string,
  options: { limit?: number; before?: Date } = {},
): Promise<{ items: PublicComment[]; nextCursor: string | null } | null> {
  const [h] = await db
    .select({ id: handlers.id })
    .from(handlers)
    .where(and(eq(handlers.id, handlerId), listedHandler));
  if (!h) return null;
  const limit = Math.min(200, Math.max(1, options.limit ?? 100));
  const rows = await db
    .select({
      id: comments.id,
      handlerId: comments.handlerId,
      parentId: sql<
        string | null
      >`case when ${parent.id} is not null and ${parent.deletedAt} is null then ${parent.id} end`,
      authorId: comments.authorId,
      authorName: users.username,
      authorDeletedAt: users.deletedAt,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .leftJoin(parent, eq(parent.id, comments.parentId))
    .where(
      and(
        eq(comments.handlerId, handlerId),
        isNull(comments.deletedAt),
        options.before ? lt(comments.createdAt, options.before) : undefined,
      ),
    )
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const items = page.map((r): PublicComment => {
    const gone = !r.authorId || !r.authorName || r.authorDeletedAt !== null;
    return {
      id: r.id,
      handlerId: r.handlerId,
      parentId: r.parentId,
      authorId: gone ? null : r.authorId,
      authorName: gone ? DELETED_USER_NAME : r.authorName!,
      body: r.body,
      createdAt: r.createdAt,
      editedAt: r.editedAt,
    };
  });
  const next = rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null;
  return { items, nextCursor: next };
}

/** Public author profile: not deleted, not banned, with listed handlers (possibly none). */
export async function getAuthor(username: string): Promise<PublicAuthor | null> {
  const [u] = await db
    .select({ id: users.id, username: users.username, createdAt: users.createdAt })
    .from(users)
    .where(
      and(
        sql`lower(${users.username}) = lower(${username})`,
        isNull(users.deletedAt),
        isNull(users.bannedAt),
      ),
    )
    .limit(1);
  if (!u) return null;
  const rows = await listedSummaries(eq(handlers.ownerId, u.id)).orderBy(
    desc(handlers.downloadCount),
    desc(handlers.trendScore),
  );
  return { id: u.id, username: u.username, joinedAt: u.createdAt, handlers: rows.map(toPublicHandler) };
}

/** Authors ranked by downloads of their listed handlers ("Made by players" on the landing). Cached 10 min. */
export function getTopAuthors(limit = 8): Promise<TopAuthor[]> {
  return cached(
    `authors:top:${limit}`,
    10 * 60_000,
    async () => {
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          handlers: sql<number>`count(*)`.mapWith(Number),
          downloads: sql<number>`sum(${handlers.downloadCount})`.mapWith(Number),
        })
        .from(handlers)
        .innerJoin(users, eq(users.id, handlers.ownerId))
        .where(and(listedHandler, isNull(users.deletedAt), isNull(users.bannedAt)))
        .groupBy(users.id, users.username)
        .orderBy(desc(sql`sum(${handlers.downloadCount})`))
        .limit(Math.min(50, Math.max(1, limit)));
      return rows;
    },
    [TAGS.authors, TAGS.catalog],
  );
}

/** Which of these handlers the viewer has starred (for StarButton state). */
export async function getViewerStars(userId: string, handlerIds: string[]): Promise<Set<string>> {
  if (handlerIds.length === 0) return new Set();
  const rows = await db
    .select({ handlerId: handlerStars.handlerId })
    .from(handlerStars)
    .where(and(eq(handlerStars.userId, userId), inArray(handlerStars.handlerId, handlerIds)));
  return new Set(rows.map((r) => r.handlerId));
}
