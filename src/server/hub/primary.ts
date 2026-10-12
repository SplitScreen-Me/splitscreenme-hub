import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, handlerVersions, handlers } from '@/db/schema';
import { cached, TAGS } from '@/server/cache';
import { primaryOrder } from '@/server/public/handlers';
import { listedHandler } from '@/server/public/visibility';

/**
 * Ids of the primary handler of every public game (section 2.3), so that lists can link a handler to the
 * game page (primary) or to its own page (others) without a redirect. About one id per public game.
 * Cached 5 minutes, dropped with the catalogue.
 */
export function getPrimaryHandlerIds(): Promise<ReadonlySet<string>> {
  return cached(
    'hub:primary-ids',
    5 * 60_000,
    async () => {
      const rows = await db
        .selectDistinctOn([handlers.gameId], { id: handlers.id })
        .from(handlers)
        .innerJoin(games, eq(games.id, handlers.gameId))
        .innerJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
        .where(listedHandler)
        .orderBy(handlers.gameId, ...primaryOrder);
      return new Set(rows.map((r) => r.id));
    },
    [TAGS.catalog],
  );
}
