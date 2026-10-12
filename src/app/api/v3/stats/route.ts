import { toStats } from '@/lib/api/dto';
import { jsonWithEtag, preflight, withApi } from '@/lib/api/http';
import { getStats } from '@/server/public';

export const dynamic = 'force-dynamic';

/** GET /api/v3/stats: hub counters, computed at most every 10 minutes. */
export const GET = withApi(async (req) => {
  const stats = toStats(await getStats());
  // The ETag ignores generatedAt, so it only changes with the counters.
  const { generatedAt: _generatedAt, ...counters } = stats;
  const etag = `W/"${Object.values(counters).join('-')}"`;
  return jsonWithEtag(req, stats, { etag, cacheControl: 'public, max-age=300, stale-while-revalidate=600' });
});
export const OPTIONS = preflight;
