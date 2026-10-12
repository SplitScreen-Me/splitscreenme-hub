import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { gameScreenshots, gameSlugRedirects, games } from '@/db/schema';
import { SLUG_MAX } from '@/lib/slug';
import { cached, TAGS } from '../cache';
import { listedSummaries, primaryOrder, toPublicHandler } from './handlers';
import type { GameLookup } from './types';

const LOOKUP_SLUG = new RegExp(`^[a-z0-9-]{1,${SLUG_MAX}}$`);

/** Could be a current or old game slug (checked before any query or cache key). */
export const isLookupSlug = (slug: string): boolean => LOOKUP_SLUG.test(slug);

/**
 * A public game by slug: the game with its listed handlers (primary first), a redirect for an old slug,
 * or null (unknown, or no listed handler). Cached 60 s. A string that cannot be a slug is answered
 * without a query or a cache entry.
 */
export function getGameBySlug(slug: string): Promise<GameLookup> {
  if (!isLookupSlug(slug)) return Promise.resolve(null);
  return cached(
    `game:${slug}`,
    60_000,
    async (): Promise<GameLookup> => {
      const [game] = await db.select().from(games).where(eq(games.slug, slug)).limit(1);
      if (!game) {
        const [moved] = await db
          .select({ slug: games.slug })
          .from(gameSlugRedirects)
          .innerJoin(games, eq(games.id, gameSlugRedirects.gameId))
          .where(eq(gameSlugRedirects.oldSlug, slug))
          .limit(1);
        return moved ? { kind: 'redirect', slug: moved.slug } : null;
      }
      const rows = await listedSummaries(eq(games.id, game.id)).orderBy(...primaryOrder);
      if (rows.length === 0) return null;
      const screenshots = await db
        .select({
          imageId: gameScreenshots.imageId,
          width: gameScreenshots.width,
          height: gameScreenshots.height,
        })
        .from(gameScreenshots)
        .where(eq(gameScreenshots.gameId, game.id))
        .orderBy(asc(gameScreenshots.position), asc(gameScreenshots.imageId));
      const handlers = rows.map(toPublicHandler);
      return {
        kind: 'game',
        game: {
          id: game.id,
          slug: game.slug,
          name: game.name,
          igdbGameId: game.igdbId,
          igdbUrl: game.igdbUrl,
          summary: game.summary,
          coverImageId: game.coverImageId,
          steamAppId: game.steamAppId,
          releaseYear: game.releaseYear,
          genres: game.genres,
          screenshots,
          primaryHandlerId: handlers[0]!.id,
          handlers,
        },
      };
    },
    [TAGS.game(slug), TAGS.catalog],
  );
}
