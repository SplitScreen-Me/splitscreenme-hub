import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { handlers } from '@/db/schema';
import { cached, TAGS } from '@/server/cache';
import { listedHandler } from '@/server/public/visibility';

export interface AuthorStats {
  handlers: number;
  downloads: number;
}

/** Listed handlers and their downloads for one author (author block of the game page). Cached 10 minutes. */
export function getAuthorStats(authorId: string): Promise<AuthorStats> {
  return cached(
    `hub:author-stats:${authorId}`,
    10 * 60_000,
    async () => {
      const [row] = await db
        .select({
          handlers: sql<number>`count(*)`.mapWith(Number),
          downloads: sql<number>`coalesce(sum(${handlers.downloadCount}), 0)`.mapWith(Number),
        })
        .from(handlers)
        .where(and(eq(handlers.ownerId, authorId), listedHandler));
      return { handlers: row?.handlers ?? 0, downloads: row?.downloads ?? 0 };
    },
    [TAGS.authors, TAGS.catalog],
  );
}
