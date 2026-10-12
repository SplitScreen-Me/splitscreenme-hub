import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { games, handlerVersions, handlers, users } from '@/db/schema';
import { audit } from '@/lib/audit';
import { can, type Actor } from '@/lib/auth/permissions';
import { igdbEnabled } from '@/lib/env';
import { newId } from '@/lib/ids';
import { hit } from '@/lib/rate-limit';
import { invalidate, TAGS } from '@/server/cache';
import { upsertGameFromIgdb } from '@/server/games/upsert';
import { fail, ok, rateLimited, type Result } from '@/server/auth/result';
import { canPostAs, type Viewer } from './community';

/**
 * Handler writes by owners and moderators (dashboard), with the permission check of section 6.2 inside
 * every function. Approval and verification (moderators only) are in ./moderation.ts.
 */

export const TITLE_MIN = 3;
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 10_000;

const triState = z.enum(['yes', 'no', 'unknown']).transform((v) => (v === 'unknown' ? null : v === 'yes'));

export const HandlerMetaSchema = z.object({
  title: z
    .string()
    .trim()
    .min(TITLE_MIN, `At least ${TITLE_MIN} characters.`)
    .max(TITLE_MAX, `At most ${TITLE_MAX} characters.`),
  description: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, '\n'))
    .pipe(z.string().max(DESCRIPTION_MAX, `At most ${DESCRIPTION_MAX.toLocaleString('en')} characters.`)),
  maxPlayers: z.coerce.number().int('Whole number.').min(1, 'At least 1.').max(64, 'At most 64.'),
  controllers: triState,
  keyboardMouse: triState,
  multiKeyboardMouse: triState,
});

export type HandlerMeta = z.output<typeof HandlerMetaSchema>;

export function parseHandlerMeta(input: Record<string, unknown>): Result<HandlerMeta> {
  const parsed = HandlerMetaSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      'Please fix the fields below.',
      z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    );
  }
  return ok(parsed.data);
}

const metaColumns = (m: HandlerMeta) => ({
  title: m.title,
  description: m.description.trim(),
  maxPlayers: m.maxPlayers,
  supportsControllers: m.controllers,
  supportsKeyboardMouse: m.keyboardMouse,
  supportsMultiKeyboardMouse: m.multiKeyboardMouse,
});

/** Who may edit a handler, and its facts for the caches. null = not found or not allowed (404). */
export async function loadEditable(actor: Actor, handlerId: string, opts: { includeDeleted?: boolean } = {}) {
  const [h] = await db
    .select({
      id: handlers.id,
      ownerId: handlers.ownerId,
      isPublic: handlers.isPublic,
      approvedAt: handlers.approvedAt,
      currentVersionId: handlers.currentVersionId,
      deletedAt: handlers.deletedAt,
      gameSlug: games.slug,
      gameId: games.id,
    })
    .from(handlers)
    .innerJoin(games, eq(games.id, handlers.gameId))
    .where(eq(handlers.id, handlerId))
    .limit(1);
  if (!h || (h.deletedAt && !opts.includeDeleted)) return null;
  return can(actor, 'handler.edit', { ownerId: h.ownerId }) ? h : null;
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

export async function createHandler(
  viewer: Viewer & { trustedAuthor: boolean },
  input: { gameId?: number | null; igdbId?: number | null; meta: HandlerMeta; ip: string },
): Promise<Result<{ id: string }>> {
  if (!can(viewer, 'handler.create')) return fail('You cannot create handlers.');
  if (!canPostAs(viewer)) {
    return fail('Confirm your email address (or link Discord, GitHub or Google) before creating a handler.');
  }
  let gameId: number | null = null;
  if (input.gameId) {
    const [g] = await db.select({ id: games.id }).from(games).where(eq(games.id, input.gameId)).limit(1);
    gameId = g?.id ?? null;
  } else if (input.igdbId) {
    const [g] = await db.select({ id: games.id }).from(games).where(eq(games.igdbId, input.igdbId)).limit(1);
    if (g) gameId = g.id;
    else if (igdbEnabled()) {
      const limited = hit('igdb-search', viewer.id);
      if (!limited.ok) return rateLimited(limited.retryAfter);
      try {
        gameId = (await upsertGameFromIgdb(input.igdbId)).id;
      } catch {
        return fail('IGDB did not answer. Try again in a moment.');
      }
    }
  }
  if (!gameId) return fail('Pick the game this handler is for.', { game: ['Pick a game.'] });

  const id = newId();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(handlers).values({
      id,
      gameId: gameId!,
      ownerId: viewer.id,
      ...metaColumns(input.meta),
      isPublic: false,
      approvedAt: viewer.trustedAuthor ? now : null,
      approvedById: null,
    });
    await audit(tx, {
      actor: viewer,
      action: 'handler.create',
      target: { type: 'handler', id },
      details: { gameId, autoApproved: viewer.trustedAuthor },
      ip: input.ip,
    });
  });
  return ok({ id });
}

export async function updateHandlerMeta(
  actor: Actor,
  handlerId: string,
  meta: HandlerMeta,
  ip: string,
): Promise<Result> {
  const h = await loadEditable(actor, handlerId);
  if (!h) return fail('Handler not found.');
  const [before] = await db.select().from(handlers).where(eq(handlers.id, handlerId)).limit(1);
  const next = metaColumns(meta);
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => before?.[k] !== next[k]);
  if (!changed.length) return ok();
  await db.transaction(async (tx) => {
    await tx.update(handlers).set(next).where(eq(handlers.id, handlerId));
    await audit(tx, {
      actor,
      action: 'handler.update',
      target: { type: 'handler', id: handlerId },
      details: { fields: changed },
      ip,
    });
  });
  invalidateHandler(h);
  return ok();
}

/** Owner intent public/private. A draft (no version) cannot go public. */
export async function setHandlerPublic(
  actor: Actor,
  handlerId: string,
  makePublic: boolean,
  ip: string,
): Promise<Result> {
  const h = await loadEditable(actor, handlerId);
  if (!h) return fail('Handler not found.');
  if (makePublic && !h.currentVersionId) return fail('Upload a first version before publishing.');
  if (h.isPublic === makePublic) return ok();
  await db.transaction(async (tx) => {
    await tx
      .update(handlers)
      .set({ isPublic: makePublic, ...(makePublic && { publishedAt: new Date() }) })
      .where(eq(handlers.id, handlerId));
    await audit(tx, {
      actor,
      action: makePublic ? 'handler.publish' : 'handler.unpublish',
      target: { type: 'handler', id: handlerId },
      details: { approved: !!h.approvedAt },
      ip,
    });
  });
  invalidateHandler(h);
  return ok();
}

export async function softDeleteHandler(actor: Actor, handlerId: string, ip: string): Promise<Result> {
  const h = await loadEditable(actor, handlerId);
  if (!h) return fail('Handler not found.');
  await db.transaction(async (tx) => {
    await tx
      .update(handlers)
      .set({ deletedAt: new Date(), deletedById: actor.id })
      .where(and(eq(handlers.id, handlerId), isNull(handlers.deletedAt)));
    await tx
      .update(games)
      .set({ featuredHandlerId: null })
      .where(and(eq(games.id, h.gameId), eq(games.featuredHandlerId, handlerId)));
    await audit(tx, { actor, action: 'handler.delete', target: { type: 'handler', id: handlerId }, ip });
  });
  invalidateHandler(h);
  return ok();
}

/** Owner or moderator: a version's facts and storage key (downloads of own versions, never counted). */
export async function getVersionForOwner(actor: Actor, handlerId: string, version: number) {
  const h = await loadEditable(actor, handlerId, { includeDeleted: can(actor, 'handler.approve') });
  if (!h) return null;
  const [v] = await db
    .select({
      id: handlerVersions.id,
      version: handlerVersions.version,
      storageKey: handlerVersions.storageKey,
      fileName: handlerVersions.fileName,
      sizeBytes: handlerVersions.sizeBytes,
      sha256: handlerVersions.sha256,
      deletedAt: handlerVersions.deletedAt,
    })
    .from(handlerVersions)
    .where(and(eq(handlerVersions.handlerId, handlerId), eq(handlerVersions.version, version)))
    .limit(1);
  return v && (!v.deletedAt || can(actor, 'handler.approve')) ? v : null;
}

/** For the "create" page: games already on the hub whose name matches (trigram). */
export async function searchLocalGames(q: string, limit = 10) {
  // LIKE wildcards in user input are matched literally.
  const term = q
    .trim()
    .toLowerCase()
    .slice(0, 100)
    .replace(/[%_\\]/g, (c) => `\\${c}`);
  if (term.length < 2) return [];
  return db
    .select({
      id: games.id,
      name: games.name,
      slug: games.slug,
      releaseYear: games.releaseYear,
      coverImageId: games.coverImageId,
      igdbId: games.igdbId,
      handlers:
        sql<number>`(select count(*) from handlers h where h.game_id = "games"."id" and h.deleted_at is null)`.mapWith(
          Number,
        ),
    })
    .from(games)
    .where(sql`${games.nameSearch} like '%' || immutable_unaccent(${term}) || '%'`)
    .orderBy(sql`similarity(${games.nameSearch}, immutable_unaccent(${term})) desc`, desc(games.id))
    .limit(limit);
}

export async function ownerName(userId: string): Promise<string | null> {
  const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.username ?? null;
}
