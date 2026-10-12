import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { SelectedFields } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { gameScreenshots, games, handlerVersions, handlers, users } from '@/db/schema';
import { genreFromSlug } from '@/lib/genres';
import { isValidId } from '@/lib/ids';
import { cached, TAGS } from '../cache';
import { listedHandler } from './visibility';
import {
  DELETED_USER_NAME,
  type Page,
  type PublicHandler,
  type PublicHandlerDetail,
  type PublicVersion,
  type PublicVersionDetail,
  type PublicVersionFile,
  type Screenshot,
  type SearchParams,
} from './types';

// ---------- shared select ----------

/** Columns of a handler summary: handler + game + author + current version. */
export const summaryColumns = {
  id: handlers.id,
  title: handlers.title,
  gameId: games.id,
  gameName: games.name,
  gameSlug: games.slug,
  igdbGameId: games.igdbId,
  coverImageId: games.coverImageId,
  genres: games.genres,
  ownerId: handlers.ownerId,
  ownerUsername: users.username,
  ownerDeletedAt: users.deletedAt,
  version: handlers.currentVersion,
  versionId: handlerVersions.id,
  verifiedAt: handlerVersions.verifiedAt,
  maxPlayers: handlers.maxPlayers,
  supportsControllers: handlers.supportsControllers,
  supportsKeyboardMouse: handlers.supportsKeyboardMouse,
  supportsMultiKeyboardMouse: handlers.supportsMultiKeyboardMouse,
  downloadCount: handlers.downloadCount,
  starCount: handlers.starCount,
  commentCount: handlers.commentCount,
  trendScore: handlers.trendScore,
  createdAt: handlers.createdAt,
  updatedAt: handlers.updatedAt,
  publishedAt: handlers.publishedAt,
};

/**
 * Listed handlers only: handlers ⋈ games ⋈ users ⋈ current version, where `listedHandler and <where>`.
 * `extra` adds columns to the summary ones. Chain `.orderBy()`, `.limit()`, `.offset()`, never `.where()`
 * (it would replace the listed predicate).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function listedSummaries<T extends SelectedFields = {}>(where?: SQL, extra?: T) {
  return db
    .select({ ...summaryColumns, ...(extra ?? ({} as T)) })
    .from(handlers)
    .innerJoin(games, eq(games.id, handlers.gameId))
    .innerJoin(users, eq(users.id, handlers.ownerId))
    .innerJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
    .where(where ? and(listedHandler, where) : listedHandler)
    .$dynamic();
}

export type SummaryRow = Awaited<ReturnType<typeof listedSummaries>>[number];

export function toPublicHandler(r: SummaryRow): PublicHandler {
  const deleted = r.ownerDeletedAt !== null;
  return {
    id: r.id,
    title: r.title,
    gameId: r.gameId,
    gameName: r.gameName,
    gameSlug: r.gameSlug,
    igdbGameId: r.igdbGameId,
    coverImageId: r.coverImageId,
    genres: r.genres,
    authorId: deleted ? null : r.ownerId,
    authorName: deleted ? DELETED_USER_NAME : r.ownerUsername,
    version: r.version,
    versionId: r.versionId,
    verified: r.verifiedAt !== null,
    maxPlayers: r.maxPlayers,
    inputs: {
      controllers: r.supportsControllers,
      keyboardMouse: r.supportsKeyboardMouse,
      multiKeyboardMouse: r.supportsMultiKeyboardMouse,
    },
    downloads: r.downloadCount,
    stars: r.starCount,
    comments: r.commentCount,
    trendScore: r.trendScore,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    publishedAt: r.publishedAt ?? r.createdAt,
  };
}

/** Primary handler order inside a game (section 2.3): featured, verified, trend, downloads, oldest. */
export const primaryOrder: SQL[] = [
  sql`(${handlers.id} = ${games.featuredHandlerId}) desc nulls last`,
  sql`(${handlerVersions.verifiedAt} is not null) desc`,
  desc(handlers.trendScore),
  desc(handlers.downloadCount),
  asc(handlers.createdAt),
];

// ---------- catalogue ----------

/** Every listed handler, trend order: the app's whole catalogue. Cached 5 minutes. */
export function getCatalog(): Promise<PublicHandler[]> {
  return cached(
    'catalog:all',
    5 * 60_000,
    async () => {
      const rows = await listedSummaries().orderBy(
        desc(handlers.trendScore),
        desc(handlers.downloadCount),
        asc(handlers.id),
      );
      return rows.map(toPublicHandler);
    },
    [TAGS.catalog],
  );
}

const PLAYERS: Record<NonNullable<SearchParams['players']>, SQL | undefined> = {
  '2': lte(handlers.maxPlayers, 2),
  '3-4': and(gte(handlers.maxPlayers, 3), lte(handlers.maxPlayers, 4)),
  '5-8': and(gte(handlers.maxPlayers, 5), lte(handlers.maxPlayers, 8)),
  '9+': gte(handlers.maxPlayers, 9),
};

const INPUT_COLUMNS = {
  controllers: handlers.supportsControllers,
  keyboardMouse: handlers.supportsKeyboardMouse,
  multiKeyboardMouse: handlers.supportsMultiKeyboardMouse,
} as const;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Normalised query words, at most 5. */
export const queryWords = (q: string) =>
  q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((w) => w.slice(0, 100));

function sortOrder(sort: SearchParams['sort']): SQL[] {
  switch (sort) {
    case 'downloads':
      return [desc(handlers.downloadCount), asc(handlers.id)];
    case 'updated':
      return [sql`coalesce(${handlers.publishedAt}, ${handlers.updatedAt}) desc`, asc(handlers.id)];
    case 'az':
      return [asc(games.name), asc(handlers.title), asc(handlers.id)];
    case 'stars':
      return [desc(handlers.starCount), desc(handlers.downloadCount), asc(handlers.id)];
    case 'newest':
      return [desc(handlers.createdAt), asc(handlers.id)];
    default:
      return [desc(handlers.trendScore), desc(handlers.downloadCount), asc(handlers.id)];
  }
}

/**
 * Catalogue search and filters, one implementation for the web catalogue and GET /api/v3/handlers.
 * Search rule (section 2.3): every word must appear in the game name, the handler title or the author name
 * (accents and case ignored); relevance first when there is a query; fuzzy game-name fallback when nothing
 * matches.
 */
export async function searchHandlers(params: SearchParams): Promise<Page<PublicHandler>> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 24)));
  const filters: SQL[] = [];

  if (params.genre) {
    const genre = genreFromSlug(params.genre, await getGenreNames());
    if (!genre) return { items: [], page, pageSize, total: 0 };
    filters.push(sql`${games.genres} @> array[${genre.name}]::text[]`);
  }
  if (params.players) {
    const p = PLAYERS[params.players];
    if (p) filters.push(p);
  }
  for (const input of params.inputs ?? []) filters.push(eq(INPUT_COLUMNS[input], true));
  if (params.verified) filters.push(isNotNull(handlerVersions.verifiedAt));

  const words = queryWords(params.q ?? '');
  const qNorm = sql`immutable_unaccent(lower(${words.join(' ')}))`;
  const wordFilters = words.map((w) => {
    const pattern = sql`'%' || immutable_unaccent(lower(${escapeLike(w)})) || '%'`;
    return sql`(${games.nameSearch} like ${pattern} or ${handlers.titleSearch} like ${pattern} or immutable_unaccent(lower(${users.username})) like ${pattern})`;
  });
  const relevance: SQL[] = words.length
    ? [
        sql`(${games.nameSearch} = ${qNorm}) desc`,
        sql`(${games.nameSearch} like ${qNorm} || '%') desc`,
        sql`greatest(similarity(${games.nameSearch}, ${qNorm}), similarity(${handlers.titleSearch}, ${qNorm})) desc`,
      ]
    : [];
  const order = [...relevance, ...sortOrder(params.sort)];

  const run = (where: SQL[], orderBy: SQL[], offset = (page - 1) * pageSize, limit = pageSize) =>
    listedSummaries(and(...where), { total: sql<number>`count(*) over()`.mapWith(Number) })
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

  const where = [...filters, ...wordFilters];
  let rows = await run(where, order);
  // count(*) over() only sees the rows of the page: past the last page, read the total from the first row.
  if (rows.length === 0 && page > 1) {
    const [first] = await run(where, order, 0, 1);
    return { items: [], page, pageSize, total: first?.total ?? 0 };
  }
  if (rows.length === 0 && words.length && page === 1) {
    rows = await run(
      [...filters, sql`${games.nameSearch} % ${qNorm}`],
      [sql`similarity(${games.nameSearch}, ${qNorm}) desc`, ...sortOrder(params.sort)],
    );
  }
  return { items: rows.map(toPublicHandler), page, pageSize, total: rows[0]?.total ?? 0 };
}

/** IGDB genre names in use by public games (cached), to resolve genre slugs. */
export function getGenreNames(): Promise<string[]> {
  return cached(
    'genres:names',
    10 * 60_000,
    async () => {
      const rows = await db.execute<{ name: string }>(sql`
        select distinct unnest(${games.genres}) as name from ${games}
        where exists (select 1 from ${handlers} where ${handlers.gameId} = ${games.id} and ${listedHandler})`);
      return rows.map((r) => r.name);
    },
    [TAGS.genres, TAGS.catalog],
  );
}

// ---------- one handler ----------

async function screenshotsOf(gameId: number): Promise<Screenshot[]> {
  return db
    .select({
      imageId: gameScreenshots.imageId,
      width: gameScreenshots.width,
      height: gameScreenshots.height,
    })
    .from(gameScreenshots)
    .where(eq(gameScreenshots.gameId, gameId))
    .orderBy(asc(gameScreenshots.position), asc(gameScreenshots.imageId));
}

/** Id of the primary (listed) handler of a game, or null when the game has none. */
export async function getPrimaryHandlerId(gameId: number): Promise<string | null> {
  const rows = await db
    .select({ id: handlers.id })
    .from(handlers)
    .innerJoin(games, eq(games.id, handlers.gameId))
    .innerJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
    .where(and(eq(handlers.gameId, gameId), listedHandler))
    .orderBy(...primaryOrder)
    .limit(1);
  return rows[0]?.id ?? null;
}

/** The primary handler of a game, as a summary. */
export async function getPrimaryHandler(gameId: number): Promise<PublicHandler | null> {
  const rows = await listedSummaries(eq(handlers.gameId, gameId))
    .orderBy(...primaryOrder)
    .limit(1);
  return rows[0] ? toPublicHandler(rows[0]) : null;
}

const versionColumns = {
  id: handlerVersions.id,
  version: handlerVersions.version,
  releaseNotes: handlerVersions.releaseNotes,
  createdAt: handlerVersions.createdAt,
  verifiedAt: handlerVersions.verifiedAt,
  sizeBytes: handlerVersions.sizeBytes,
  sha256: handlerVersions.sha256,
  fileName: handlerVersions.fileName,
  downloadCount: handlerVersions.downloadCount,
};

const toPublicVersion = (v: {
  id: string;
  version: number;
  releaseNotes: string;
  createdAt: Date;
  verifiedAt: Date | null;
  sizeBytes: number;
  sha256: string;
  fileName: string;
  downloadCount: number;
}): PublicVersion => ({
  id: v.id,
  version: v.version,
  releaseNotes: v.releaseNotes,
  createdAt: v.createdAt,
  verified: v.verifiedAt !== null,
  sizeBytes: v.sizeBytes,
  sha256: v.sha256,
  fileName: v.fileName,
  downloads: v.downloadCount,
});

/** A listed handler with everything its page needs, or null (not found or not listed). Cached 60 s. */
export function getHandler(id: string): Promise<PublicHandlerDetail | null> {
  if (!isValidId(id)) return Promise.resolve(null);
  return cached(
    `handler:${id}`,
    60_000,
    async () => {
      const rows = await listedSummaries(eq(handlers.id, id), {
        description: handlers.description,
        gameSummary: games.summary,
        igdbUrl: games.igdbUrl,
        steamAppId: games.steamAppId,
        releaseYear: games.releaseYear,
        vReleaseNotes: handlerVersions.releaseNotes,
        vCreatedAt: handlerVersions.createdAt,
        vSizeBytes: handlerVersions.sizeBytes,
        vSha256: handlerVersions.sha256,
        vFileName: handlerVersions.fileName,
        vDownloadCount: handlerVersions.downloadCount,
      }).limit(1);
      const r = rows[0];
      if (!r) return null;
      const [screenshots, primaryId] = await Promise.all([
        screenshotsOf(r.gameId),
        getPrimaryHandlerId(r.gameId),
      ]);
      return {
        ...toPublicHandler(r),
        description: r.description,
        gameSummary: r.gameSummary,
        igdbUrl: r.igdbUrl,
        steamAppId: r.steamAppId,
        releaseYear: r.releaseYear,
        screenshots,
        currentVersion: toPublicVersion({
          id: r.versionId,
          version: r.version,
          releaseNotes: r.vReleaseNotes,
          createdAt: r.vCreatedAt,
          verifiedAt: r.verifiedAt,
          sizeBytes: r.vSizeBytes,
          sha256: r.vSha256,
          fileName: r.vFileName,
          downloadCount: r.vDownloadCount,
        }),
        isPrimary: primaryId === r.id,
      };
    },
    [TAGS.handler(id), TAGS.catalog],
  );
}

/** Is this id a listed handler? (cheap check before version or comment queries) */
async function listedHandlerExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: handlers.id })
    .from(handlers)
    .where(and(eq(handlers.id, id), listedHandler))
    .limit(1);
  return rows.length > 0;
}

/** Non-deleted versions of a listed handler, newest first; null when the handler is not listed. */
export async function getVersions(handlerId: string): Promise<PublicVersion[] | null> {
  if (!(await listedHandlerExists(handlerId))) return null;
  const rows = await db
    .select(versionColumns)
    .from(handlerVersions)
    .where(and(eq(handlerVersions.handlerId, handlerId), isNull(handlerVersions.deletedAt)))
    .orderBy(desc(handlerVersions.version));
  return rows.map(toPublicVersion);
}

/** One version (default: current) with its storage key, for downloads. Listed handlers only. */
export async function getVersionFile(handlerId: string, version?: number): Promise<PublicVersionFile | null> {
  const rows = await db
    .select({
      ...versionColumns,
      handlerId: handlerVersions.handlerId,
      storageKey: handlerVersions.storageKey,
    })
    .from(handlerVersions)
    .innerJoin(handlers, eq(handlers.id, handlerVersions.handlerId))
    .where(
      and(
        eq(handlerVersions.handlerId, handlerId),
        isNull(handlerVersions.deletedAt),
        version === undefined
          ? eq(handlerVersions.id, handlers.currentVersionId)
          : eq(handlerVersions.version, version),
        listedHandler,
      ),
    )
    .limit(1);
  const r = rows[0];
  return r ? { ...toPublicVersion(r), handlerId: r.handlerId, storageKey: r.storageKey } : null;
}

/** One version with its manifest and stamped script, for the version page and the script endpoint. */
export async function getVersionDetail(
  handlerId: string,
  version: number,
): Promise<PublicVersionDetail | null> {
  const rows = await db
    .select({ ...versionColumns, manifest: handlerVersions.manifest, script: handlerVersions.script })
    .from(handlerVersions)
    .innerJoin(handlers, eq(handlers.id, handlerVersions.handlerId))
    .where(
      and(
        eq(handlerVersions.handlerId, handlerId),
        eq(handlerVersions.version, version),
        isNull(handlerVersions.deletedAt),
        listedHandler,
      ),
    )
    .limit(1);
  const r = rows[0];
  return r ? { ...toPublicVersion(r), manifest: r.manifest, script: r.script } : null;
}

/** Listed handlers by ids (keeps only listed ones), e.g. for collections. */
export async function getHandlersByIds(ids: string[]): Promise<PublicHandler[]> {
  if (ids.length === 0) return [];
  const rows = await listedSummaries(inArray(handlers.id, ids));
  return rows.map(toPublicHandler);
}
