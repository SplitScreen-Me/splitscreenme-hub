import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { comments, games, handlerStars, handlers, users } from '@/db/schema';
import { audit } from '@/lib/audit';
import { can } from '@/lib/auth/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { newId } from '@/lib/ids';
import { hit, hitAll } from '@/lib/rate-limit';
import { invalidate, TAGS } from '@/server/cache';
import { listedHandler } from '@/server/public';
import { notifyReply } from '@/server/notify/replies';
import { fail, ok, rateLimited, type Result } from '@/server/auth/result';
import { normalizeCommentBody } from '@/server/auth/rules';

/**
 * Comment and star writes (docs/ARCHITECTURE.md sections 2.3, 6.2, 6.5). Counters move in the same
 * transaction as the row; the public caches are invalidated after commit.
 */

export type Viewer = Pick<SessionUser, 'id' | 'role' | 'emailVerifiedAt' | 'hasOAuth' | 'createdAt'>;

const DAY = 24 * 60 * 60 * 1000;

export const canPostAs = (v: Viewer) => !!v.emailVerifiedAt || v.hasOAuth;

const NEEDS_PROOF =
  'Confirm your email address (or link Discord, GitHub or Google) on your account page before posting.';

function commentLimits(viewer: Viewer, now: number) {
  const young = now - viewer.createdAt.getTime() < DAY;
  return hitAll(
    [
      ['comment:burst', viewer.id],
      [young ? 'comment:day-new-account' : 'comment:day', viewer.id],
    ],
    now,
  );
}

function invalidateComments(handlerId: string) {
  invalidate(TAGS.comments(handlerId), TAGS.handler(handlerId), TAGS.stats);
}

/** A comment, or a reply (`parentId`; the handler then comes from the parent). */
export async function postComment(
  viewer: Viewer,
  input: { handlerId?: string | null; parentId?: string | null; body: unknown },
  now: number = Date.now(),
): Promise<Result<{ id: string }>> {
  if (!can(viewer, 'comment.create')) return fail('You cannot comment.');
  if (!canPostAs(viewer)) return fail(NEEDS_PROOF);
  const parsed = normalizeCommentBody(input.body);
  if ('problem' in parsed) return fail(parsed.problem, { body: [parsed.problem] });

  let handlerId = input.handlerId ?? null;
  let parentId: string | null = null;
  if (input.parentId) {
    const [parent] = await db
      .select({ id: comments.id, parentId: comments.parentId, handlerId: comments.handlerId })
      .from(comments)
      .where(and(eq(comments.id, input.parentId), isNull(comments.deletedAt)))
      .limit(1);
    if (!parent || (handlerId && parent.handlerId !== handlerId))
      return fail('The comment you reply to is gone.');
    handlerId = parent.handlerId;
    // Threads are one level deep: a reply to a reply hangs on the root.
    parentId = parent.parentId ?? parent.id;
  }
  if (!handlerId) return fail('This handler is not available.');

  const [h] = await db
    .select({ id: handlers.id })
    .from(handlers)
    .where(and(eq(handlers.id, handlerId), listedHandler))
    .limit(1);
  if (!h) return fail('This handler is not available.');

  const limited = commentLimits(viewer, now);
  if (!limited.ok) return rateLimited(limited.retryAfter);

  const id = newId();
  await db.transaction(async (tx) => {
    await tx
      .insert(comments)
      .values({ id, handlerId: h.id, authorId: viewer.id, parentId, body: parsed.body });
    await tx
      .update(handlers)
      .set({ commentCount: sql`${handlers.commentCount} + 1` })
      .where(eq(handlers.id, h.id));
  });
  invalidateComments(h.id);
  if (parentId) void notifyReply(id);
  return ok({ id });
}

export async function editComment(viewer: Viewer, commentId: string, body: unknown): Promise<Result> {
  const parsed = normalizeCommentBody(body);
  if ('problem' in parsed) return fail(parsed.problem, { body: [parsed.problem] });
  const [c] = await db
    .select({ authorId: comments.authorId, handlerId: comments.handlerId, deletedAt: comments.deletedAt })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  // Only the author edits; moderators hide instead.
  if (!c || c.deletedAt || c.authorId !== viewer.id) return fail('This comment cannot be edited.');
  const limited = hit('comment:burst', viewer.id);
  if (!limited.ok) return rateLimited(limited.retryAfter);
  await db
    .update(comments)
    .set({ body: parsed.body, editedAt: new Date() })
    .where(eq(comments.id, commentId));
  invalidateComments(c.handlerId);
  return ok();
}

/** Own comment, or a moderator hiding one (with a reason). Soft delete; the body stays for moderators. */
export async function deleteComment(
  viewer: Pick<Viewer, 'id' | 'role'>,
  commentId: string,
  reason: string | null,
  ip: string,
): Promise<Result> {
  const [c] = await db
    .select({ authorId: comments.authorId, handlerId: comments.handlerId, deletedAt: comments.deletedAt })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!c || c.deletedAt) return fail('This comment is already gone.');
  const own = c.authorId === viewer.id;
  if (!can(viewer, 'comment.delete', { authorId: c.authorId }))
    return fail('You cannot delete this comment.');
  const cleanReason = own ? null : reason?.trim().slice(0, 500) || null;
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(comments)
      .set({
        deletedAt: new Date(),
        deletedById: viewer.id,
        deleteReason: cleanReason ?? (own ? 'deleted by author' : null),
      })
      .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
      .returning({ id: comments.id });
    if (!rows.length) return;
    await tx
      .update(handlers)
      .set({ commentCount: sql`greatest(${handlers.commentCount} - 1, 0)` })
      .where(eq(handlers.id, c.handlerId));
    await audit(tx, {
      actor: viewer,
      action: 'comment.delete',
      target: { type: 'comment', id: commentId },
      details: { handlerId: c.handlerId, own, ...(cleanReason && { reason: cleanReason }) },
      ip,
    });
  });
  invalidateComments(c.handlerId);
  return ok();
}

/** Moderators restore a hidden comment (not one its author deleted, nor one of a deleted account). */
export async function restoreComment(
  viewer: Pick<Viewer, 'id' | 'role'>,
  commentId: string,
  ip: string,
): Promise<Result> {
  if (!can(viewer, 'comment.hide')) return fail('Moderators only.');
  const [c] = await db
    .select({
      authorId: comments.authorId,
      handlerId: comments.handlerId,
      deletedAt: comments.deletedAt,
      deletedById: comments.deletedById,
      body: comments.body,
      authorDeletedAt: users.deletedAt,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!c?.deletedAt) return fail('This comment is not deleted.');
  if (!c.body || c.authorDeletedAt) return fail('The author deleted their account: nothing to restore.');
  if (c.deletedById && c.deletedById === c.authorId) return fail('The author deleted this comment themself.');
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(comments)
      .set({ deletedAt: null, deletedById: null, deleteReason: null })
      .where(eq(comments.id, commentId))
      .returning({ id: comments.id });
    if (!rows.length) return;
    await tx
      .update(handlers)
      .set({ commentCount: sql`${handlers.commentCount} + 1` })
      .where(eq(handlers.id, c.handlerId));
    await audit(tx, {
      actor: viewer,
      action: 'comment.restore',
      target: { type: 'comment', id: commentId },
      details: { handlerId: c.handlerId },
      ip,
    });
  });
  invalidateComments(c.handlerId);
  return ok();
}

/** The body of the viewer's own live comment (for the edit form), else null. */
export async function getOwnCommentBody(viewerId: string, commentId: string): Promise<string | null> {
  const [c] = await db
    .select({ body: comments.body })
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.authorId, viewerId), isNull(comments.deletedAt)))
    .limit(1);
  return c?.body ?? null;
}

/** Star or unstar a listed handler. Returns the new state and count. */
export async function toggleStar(
  viewer: Pick<Viewer, 'id' | 'role'>,
  handlerId: string,
  want?: boolean,
): Promise<Result<{ starred: boolean; count: number }>> {
  if (!can(viewer, 'star')) return fail('You cannot star handlers.');
  const limited = hit('star', viewer.id);
  if (!limited.ok) return rateLimited(limited.retryAfter);
  const [h] = await db
    .select({ id: handlers.id, gameSlug: games.slug })
    .from(handlers)
    .innerJoin(games, eq(games.id, handlers.gameId))
    .where(and(eq(handlers.id, handlerId), listedHandler))
    .limit(1);
  if (!h) return fail('This handler is not available.');
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ userId: handlerStars.userId })
      .from(handlerStars)
      .where(and(eq(handlerStars.userId, viewer.id), eq(handlerStars.handlerId, h.id)))
      .limit(1);
    const target = want ?? !existing;
    if (target && !existing) {
      const ins = await tx
        .insert(handlerStars)
        .values({ userId: viewer.id, handlerId: h.id })
        .onConflictDoNothing()
        .returning({ userId: handlerStars.userId });
      if (ins.length) {
        await tx
          .update(handlers)
          .set({ starCount: sql`${handlers.starCount} + 1` })
          .where(eq(handlers.id, h.id));
      }
    } else if (!target && existing) {
      const del = await tx
        .delete(handlerStars)
        .where(and(eq(handlerStars.userId, viewer.id), eq(handlerStars.handlerId, h.id)))
        .returning({ userId: handlerStars.userId });
      if (del.length) {
        await tx
          .update(handlers)
          .set({ starCount: sql`greatest(${handlers.starCount} - 1, 0)` })
          .where(eq(handlers.id, h.id));
      }
    }
    const [row] = await tx.select({ count: handlers.starCount }).from(handlers).where(eq(handlers.id, h.id));
    return { starred: target, count: row?.count ?? 0 };
  });
  // Only this handler and its game page: the catalogue's star counts catch up on their own TTL, so a
  // stream of stars cannot flush the whole public cache.
  invalidate(TAGS.handler(h.id), TAGS.game(h.gameSlug));
  return ok(result);
}
