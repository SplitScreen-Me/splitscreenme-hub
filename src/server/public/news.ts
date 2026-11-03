import 'server-only';
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db';
import { news } from '@/db/schema';
import { compareNews, isLiveNews, NEWS_LIVE_LIMIT } from '@/lib/news';
import { cached, TAGS } from '../cache';
import type { PublicNews } from './types';

/** How long the published rows stay in the in-process cache; every news write invalidates them. */
const CACHE_MS = 60_000;
/**
 * Rows starting within this window are cached too and filtered by the clock on every request, so a
 * scheduled item goes live (and an item ends) on time even while the cache holds it. Must exceed CACHE_MS.
 */
const LOOKAHEAD_MS = 2 * CACHE_MS;
/** Backstop: the table holds a handful of announcements. */
const MAX_CANDIDATES = 100;

function publishedCandidates(): Promise<PublicNews[]> {
  return cached(
    'news:candidates',
    CACHE_MS,
    async () => {
      const loadedAt = Date.now();
      // The enum sorts in declaration order (info < warning < critical): critical rows come first.
      return db
        .select({
          id: news.id,
          message: news.message,
          url: news.url,
          severity: news.severity,
          startsAt: news.startsAt,
          endsAt: news.endsAt,
          createdAt: news.createdAt,
          updatedAt: news.updatedAt,
        })
        .from(news)
        .where(
          and(
            eq(news.published, true),
            lte(news.startsAt, new Date(loadedAt + LOOKAHEAD_MS)),
            or(isNull(news.endsAt), gt(news.endsAt, new Date(loadedAt))),
          ),
        )
        .orderBy(desc(news.severity), desc(news.startsAt))
        .limit(MAX_CANDIDATES);
    },
    [TAGS.news],
  );
}

/**
 * The live announcements (published, started, not ended), critical first, then warning, then info, the
 * latest start first within a severity; at most 10. Empty when nothing is live.
 */
export async function getLiveNews(now: Date = new Date()): Promise<PublicNews[]> {
  const rows = await publishedCandidates();
  return rows
    .filter((n) => isLiveNews({ published: true, startsAt: n.startsAt, endsAt: n.endsAt }, now))
    .sort(compareNews)
    .slice(0, NEWS_LIVE_LIMIT);
}
