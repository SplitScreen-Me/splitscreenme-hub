import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { comments, games, handlers, users } from '@/db/schema';
import { genreInfo } from '@/lib/genres';
import { cached, TAGS } from '../cache';
import { listedSummaries, toPublicHandler } from './handlers';
import type { GenreCount, HubStats, PublicHandler } from './types';
import { listedHandler } from './visibility';

/** Hub counters. Cached 10 minutes. */
export function getStats(): Promise<HubStats> {
  return cached(
    'stats',
    10 * 60_000,
    async () => {
      const [h] = await db
        .select({
          publicHandlers: sql<number>`count(*) filter (where ${listedHandler})`.mapWith(Number),
          games: sql<number>`count(distinct ${handlers.gameId}) filter (where ${listedHandler})`.mapWith(
            Number,
          ),
          downloads: sql<number>`coalesce(sum(${handlers.downloadCount}), 0)`.mapWith(Number),
        })
        .from(handlers)
        .where(isNull(handlers.deletedAt));
      const [m] = await db
        .select({ members: sql<number>`count(*)`.mapWith(Number) })
        .from(users)
        .where(isNull(users.deletedAt));
      const [c] = await db
        .select({ comments: sql<number>`count(*)`.mapWith(Number) })
        .from(comments)
        .innerJoin(handlers, eq(handlers.id, comments.handlerId))
        .where(and(isNull(comments.deletedAt), listedHandler));
      return {
        publicHandlers: h?.publicHandlers ?? 0,
        games: h?.games ?? 0,
        downloads: h?.downloads ?? 0,
        members: m?.members ?? 0,
        comments: c?.comments ?? 0,
        generatedAt: new Date(),
      };
    },
    [TAGS.stats],
  );
}

/** Genres of public games, most games first. Cached 10 minutes. */
export function getGenres(): Promise<GenreCount[]> {
  return cached(
    'genres:counts',
    10 * 60_000,
    async () => {
      const rows = await db.execute<{ name: string; count: number }>(sql`
        select g.name, count(*)::int as count
        from ${games}, unnest(${games.genres}) as g(name)
        where exists (select 1 from ${handlers} where ${handlers.gameId} = ${games.id} and ${listedHandler})
        group by g.name
        order by count desc, g.name asc`);
      return rows.map((r) => ({ ...genreInfo(r.name), count: Number(r.count) }));
    },
    [TAGS.genres, TAGS.catalog],
  );
}

/** Trending games: the best-trending listed handler of each game, `limit` games. Cached 5 minutes. */
export function getTrending(limit = 8): Promise<PublicHandler[]> {
  return cached(
    `trending:${limit}`,
    5 * 60_000,
    async () => {
      const best = db
        .selectDistinctOn([handlers.gameId], { id: handlers.id })
        .from(handlers)
        .where(listedHandler)
        .orderBy(handlers.gameId, desc(handlers.trendScore), desc(handlers.downloadCount));
      const rows = await listedSummaries(sql`${handlers.id} in (${best})`)
        .orderBy(desc(handlers.trendScore), desc(handlers.downloadCount))
        .limit(Math.min(48, Math.max(1, limit)));
      return rows.map(toPublicHandler);
    },
    [TAGS.catalog],
  );
}
