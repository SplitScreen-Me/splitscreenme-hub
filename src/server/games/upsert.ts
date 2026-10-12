import 'server-only';
import { eq, or, sql } from 'drizzle-orm';
import { db, type Queryable } from '@/db';
import { gameScreenshots, gameSlugRedirects, games, type Game } from '@/db/schema';
import { fetchGamesByIds, releaseYearOf, steamAppIdOf, type IgdbGame } from '@/lib/igdb';
import { uniqueGameSlug } from '@/lib/slug';
import { invalidate, TAGS } from '../cache';

const MAX_SCREENSHOTS = 12;
const MAX_GENRES = 3;

/** Is a slug used by another game, as its slug or as an old slug? */
async function slugTaken(q: Queryable, slug: string, exceptGameId?: number): Promise<boolean> {
  const [row] = await q
    .select({ id: games.id })
    .from(games)
    .leftJoin(gameSlugRedirects, eq(gameSlugRedirects.gameId, games.id))
    .where(or(eq(games.slug, slug), eq(gameSlugRedirects.oldSlug, slug)))
    .limit(1);
  return !!row && row.id !== exceptGameId;
}

/** Game columns from an IGDB record (slug excluded). */
export function gameFieldsFromIgdb(g: IgdbGame) {
  return {
    name: g.name,
    igdbId: g.id,
    igdbUrl: g.url ?? null,
    summary: g.summary ?? null,
    coverImageId: g.cover?.image_id ?? null,
    steamAppId: steamAppIdOf(g),
    releaseYear: releaseYearOf(g),
    genres: (g.genres ?? []).map((x) => x.name).slice(0, MAX_GENRES),
    igdbSyncedAt: new Date(),
  };
}

async function replaceScreenshots(q: Queryable, gameId: number, g: IgdbGame): Promise<void> {
  await q.delete(gameScreenshots).where(eq(gameScreenshots.gameId, gameId));
  const shots = (g.screenshots ?? []).slice(0, MAX_SCREENSHOTS);
  if (shots.length === 0) return;
  await q
    .insert(gameScreenshots)
    .values(
      shots.map((s, position) => ({
        gameId,
        imageId: s.image_id,
        width: s.width ?? null,
        height: s.height ?? null,
        position,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Creates the game of an IGDB id, or refreshes it from IGDB (name, cover, summary, genres, screenshots,
 * Steam id). The slug is chosen once at creation and only changed by an admin.
 */
export async function upsertGameFromIgdb(igdbId: number): Promise<Game> {
  const [g] = await fetchGamesByIds([igdbId]);
  if (!g) throw new Error(`IGDB game ${igdbId} not found`);
  const fields = gameFieldsFromIgdb(g);

  const game = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(games).where(eq(games.igdbId, igdbId)).limit(1);
    let row: Game;
    if (existing) {
      [row] = (await tx.update(games).set(fields).where(eq(games.id, existing.id)).returning()) as [Game];
    } else {
      const slug = await uniqueGameSlug(fields.name, fields, (s) => slugTaken(tx, s));
      [row] = (await tx
        .insert(games)
        .values({ ...fields, slug })
        .onConflictDoUpdate({ target: games.igdbId, set: fields })
        .returning()) as [Game];
    }
    await replaceScreenshots(tx, row.id, g);
    return row;
  });
  invalidate(TAGS.game(game.slug), TAGS.catalog, TAGS.genres);
  return game;
}

/** Game ids whose IGDB data is older than `days` (for an admin "refresh stale games" action). */
export async function staleGameIds(days: number, limit = 100): Promise<number[]> {
  const rows = await db
    .select({ igdbId: games.igdbId })
    .from(games)
    .where(
      sql`${games.igdbId} is not null and (${games.igdbSyncedAt} is null or ${games.igdbSyncedAt} < now() - make_interval(days => ${days}))`,
    )
    .limit(limit);
  return rows.map((r) => r.igdbId!).filter(Boolean);
}
