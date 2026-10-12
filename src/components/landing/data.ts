import 'server-only';
import { collections, heroScenes } from '@/content/collections';
import { log } from '@/lib/log';
import {
  getCatalog,
  getStats,
  getTopAuthors,
  getTrending,
  type HubStats,
  type PublicHandler,
  type TopAuthor,
} from '@/server/public';
import { gameFinder, resolveCollections, toLandingGame, type LandingCollection, type LandingGame } from './resolve';

export type { LandingCollection, LandingGame } from './resolve';

export interface LandingData {
  trending: LandingGame[];
  collections: LandingCollection[];
  authors: TopAuthor[];
  stats: HubStats | null;
  /** game slug of each hero scene (keyed by the scene's slug) when that game is on the hub */
  heroLinks: Record<string, string>;
}

async function safe<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // The landing must render without the database: sections with live data just stay empty.
    // Only the error name and code: driver messages can carry query parameters.
    const code = (err as { code?: unknown } | null)?.code;
    log.error('landing.data_failed', {
      what,
      error: err instanceof Error ? err.name : 'unknown',
      code: typeof code === 'string' ? code : undefined,
    });
    return fallback;
  }
}

/** Live data of the landing, from the cached public queries. */
export async function getLandingData(): Promise<LandingData> {
  const [trending, catalog, authors, stats] = await Promise.all([
    safe('trending', () => getTrending(8), [] as PublicHandler[]),
    safe('catalog', () => getCatalog(), [] as PublicHandler[]),
    safe('authors', () => getTopAuthors(5), [] as TopAuthor[]),
    safe('stats', () => getStats(), null as HubStats | null),
  ]);
  const find = gameFinder(catalog);
  const heroLinks: Record<string, string> = {};
  for (const s of heroScenes) {
    const g = find(s);
    if (g) heroLinks[s.slug] = g.slug;
  }
  return {
    trending: trending.map(toLandingGame),
    collections: resolveCollections(collections, catalog),
    authors,
    stats,
    heroLinks,
  };
}
