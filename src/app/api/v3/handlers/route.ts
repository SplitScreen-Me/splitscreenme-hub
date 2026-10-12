import { toHandlerSummary } from '@/lib/api/dto';
import { CACHE, jsonWithEtag, preflight, withApi } from '@/lib/api/http';
import { HandlersQuery, parseQuery } from '@/lib/api/schemas/params';
import { getLinkContext } from '@/server/api/context';
import { searchHandlers } from '@/server/public';

export const dynamic = 'force-dynamic';

/** GET /api/v3/handlers: search, filters, sort and pages; same implementation as the web catalogue. */
export const GET = withApi(async (req) => {
  const query = parseQuery(HandlersQuery, req.nextUrl);
  const [result, ctx] = await Promise.all([
    searchHandlers({
      q: query.q,
      genre: query.genre,
      players: query.players,
      inputs: query.input,
      verified: query.verified,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    }),
    getLinkContext(),
  ]);
  return jsonWithEtag(
    req,
    {
      items: result.items.map((h) => toHandlerSummary(h, ctx)),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
    { cacheControl: CACHE.read },
  );
});
export const OPTIONS = preflight;
