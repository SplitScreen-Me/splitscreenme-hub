import 'server-only';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { games, handlerVersions, handlers, users } from '@/db/schema';
import type { LinkContext } from '@/lib/api/dto';
import { cached, TAGS } from '@/server/cache';
import { listedHandler } from '@/server/public';
import { primaryOrder } from '@/server/public/handlers';

/**
 * Facts the API needs to build canonical links in handler lists, for every listed handler at once:
 * the primary handler of each game (its URL is the game page) and the owners whose profile is not public
 * (suspended). Two small queries, cached 5 minutes with the catalogue.
 */
export function getLinkContext(): Promise<LinkContext> {
  return cached(
    'api:link-context',
    5 * 60_000,
    async (): Promise<LinkContext> => {
      const [primary, suspended] = await Promise.all([
        db
          .selectDistinctOn([handlers.gameId], { id: handlers.id })
          .from(handlers)
          .innerJoin(games, eq(games.id, handlers.gameId))
          .innerJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
          .where(listedHandler)
          .orderBy(handlers.gameId, ...primaryOrder),
        db
          .selectDistinct({ id: users.id })
          .from(users)
          .innerJoin(handlers, eq(handlers.ownerId, users.id))
          .where(and(isNotNull(users.bannedAt), isNull(users.deletedAt), listedHandler)),
      ]);
      return {
        primaryIds: new Set(primary.map((r) => r.id)),
        hiddenAuthorIds: new Set(suspended.map((r) => r.id)),
      };
    },
    [TAGS.catalog, TAGS.authors],
  );
}
