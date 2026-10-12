import type { Collection } from '@/content/collections';
import type { PublicHandler } from '@/server/public/types';

/** One game of the landing: the best listed handler of that game. */
export interface LandingGame {
  slug: string;
  name: string;
  coverImageId: string | null;
  maxPlayers: number;
  downloads: number;
  verified: boolean;
}

export interface LandingCollection {
  key: string;
  name: string;
  blurb: string;
  games: LandingGame[];
}

export const toLandingGame = (h: PublicHandler): LandingGame => ({
  slug: h.gameSlug,
  name: h.gameName,
  coverImageId: h.coverImageId,
  maxPlayers: h.maxPlayers,
  downloads: h.downloads,
  verified: h.verified,
});

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Finds a game of the catalogue by slug, then by name (slugs can change when a game is refreshed from IGDB).
 * The catalogue is in trend order, so the best handler of each game wins.
 */
export function gameFinder(catalog: PublicHandler[]) {
  const bySlug = new Map<string, LandingGame>();
  const byName = new Map<string, LandingGame>();
  for (const h of catalog) {
    if (bySlug.has(h.gameSlug)) continue;
    const g = toLandingGame(h);
    bySlug.set(g.slug, g);
    if (!byName.has(norm(g.name))) byName.set(norm(g.name), g);
  }
  return (ref: { slug: string; name: string }) => bySlug.get(ref.slug) ?? byName.get(norm(ref.name));
}

/** Curated collections with the games that are public right now; collections left with fewer than 2 are dropped. */
export function resolveCollections(list: Collection[], catalog: PublicHandler[]): LandingCollection[] {
  const find = gameFinder(catalog);
  return list
    .map((c) => {
      const seen = new Set<string>();
      const games: LandingGame[] = [];
      for (const ref of c.games) {
        const g = find(ref);
        if (g && !seen.has(g.slug)) {
          seen.add(g.slug);
          games.push(g);
        }
      }
      return { key: c.key, name: c.name, blurb: c.blurb, games };
    })
    .filter((c) => c.games.length >= 2);
}
