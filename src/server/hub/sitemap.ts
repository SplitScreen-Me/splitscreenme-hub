import 'server-only';
import { and, eq, isNull, max, sql } from 'drizzle-orm';
import { db } from '@/db';
import { games, handlerVersions, handlers, users } from '@/db/schema';
import { cached, TAGS } from '@/server/cache';
import { getGenres } from '@/server/public';
import { listedHandler } from '@/server/public/visibility';
import { getPrimaryHandlerIds } from './primary';

export interface SitemapData {
  /** public games, lastModified = newest current version of their listed handlers */
  games: { slug: string; lastModified: Date }[];
  /** listed handlers that are not the primary one of their game (they have their own page) */
  handlers: { id: string; gameSlug: string; lastModified: Date }[];
  /** genre URL slugs of public games */
  genres: string[];
  /** authors (not deleted, not banned) with at least one listed handler */
  authors: { username: string; lastModified: Date }[];
}

/** Everything of the hub that goes into the sitemap (section 7). Listed handlers only. Cached 1 hour. */
export function getSitemapData(): Promise<SitemapData> {
  return cached(
    'hub:sitemap',
    60 * 60_000,
    async (): Promise<SitemapData> => {
      const [rows, primary, genres, authors] = await Promise.all([
        db
          .select({
            id: handlers.id,
            gameSlug: games.slug,
            versionAt: handlerVersions.createdAt,
          })
          .from(handlers)
          .innerJoin(games, eq(games.id, handlers.gameId))
          .innerJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
          .where(listedHandler)
          .orderBy(games.slug, handlers.id),
        getPrimaryHandlerIds(),
        getGenres(),
        db
          .select({ username: users.username, lastModified: max(handlerVersions.createdAt) })
          .from(handlers)
          .innerJoin(users, eq(users.id, handlers.ownerId))
          .innerJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
          .where(and(listedHandler, isNull(users.deletedAt), isNull(users.bannedAt)))
          .groupBy(users.id, users.username)
          .orderBy(sql`lower(${users.username})`),
      ]);

      const byGame = new Map<string, Date>();
      for (const r of rows) {
        const prev = byGame.get(r.gameSlug);
        if (!prev || r.versionAt > prev) byGame.set(r.gameSlug, r.versionAt);
      }
      return {
        games: [...byGame].map(([slug, lastModified]) => ({ slug, lastModified })),
        handlers: rows
          .filter((r) => !primary.has(r.id))
          .map((r) => ({ id: r.id, gameSlug: r.gameSlug, lastModified: r.versionAt })),
        genres: genres.map((g) => g.slug),
        authors: authors.map((a) => ({ username: a.username, lastModified: a.lastModified ?? new Date(0) })),
      };
    },
    [TAGS.sitemap, TAGS.catalog],
  );
}
