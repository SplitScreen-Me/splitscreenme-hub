import 'server-only';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { games, handlerVersions, handlers } from '@/db/schema';
import { cached, TAGS } from '@/server/cache';
import { listedSummaries, primaryOrder, toPublicHandler } from '@/server/public/handlers';
import type { PublicHandler } from '@/server/public/types';
import { listedHandler } from '@/server/public/visibility';

/**
 * "Play these next" on a game page (section 7, internal linking): the primary handler of other public
 * games, ranked by shared genres, then a close player count, then trend. Cached 10 minutes.
 */
export function getRelatedGames(
  game: { id: number; genres: readonly string[]; maxPlayers: number },
  limit = 6,
): Promise<PublicHandler[]> {
  const n = Math.min(24, Math.max(1, limit));
  return cached(
    `hub:related:${game.id}:${n}`,
    10 * 60_000,
    async () => {
      const primaryOfOtherGames = db
        .selectDistinctOn([handlers.gameId], { id: handlers.id })
        .from(handlers)
        .innerJoin(games, eq(games.id, handlers.gameId))
        .innerJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
        .where(and(listedHandler, ne(handlers.gameId, game.id)))
        .orderBy(handlers.gameId, ...primaryOrder);
      const genres = game.genres.length
        ? sql`array[${sql.join(
            game.genres.map((g) => sql`${g}`),
            sql`, `,
          )}]::text[]`
        : sql`array[]::text[]`;
      const rows = await listedSummaries(sql`${handlers.id} in (${primaryOfOtherGames})`)
        .orderBy(
          sql`cardinality(array(select unnest(${games.genres}) intersect select unnest(${genres}))) desc`,
          sql`abs(${handlers.maxPlayers} - ${game.maxPlayers}) asc`,
          desc(handlers.trendScore),
          desc(handlers.downloadCount),
        )
        .limit(n);
      return rows.map(toPublicHandler);
    },
    [TAGS.catalog],
  );
}
