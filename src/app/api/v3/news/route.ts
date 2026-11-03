import { toNewsItem } from '@/lib/api/dto';
import { CACHE, jsonWithEtag, preflight, withApi } from '@/lib/api/http';
import { getLiveNews } from '@/server/public';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v3/news: the live announcements of the desktop app's ticker (published, started, not ended),
 * critical first, at most 10; `{ items: [] }` when nothing is live. Fresh for 60 s, no stale serving, so
 * an unpublished announcement leaves the clients within a minute.
 */
export const GET = withApi(async (req) => {
  const items = (await getLiveNews()).map(toNewsItem);
  return jsonWithEtag(req, { items }, { cacheControl: CACHE.news });
});
export const OPTIONS = preflight;
