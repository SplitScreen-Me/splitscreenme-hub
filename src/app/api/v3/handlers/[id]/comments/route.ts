import { toComment } from '@/lib/api/dto';
import { CACHE, jsonWithEtag, notFound, preflight, withApi } from '@/lib/api/http';
import { CommentsQuery, HandlerPath, parseParams, parseQuery } from '@/lib/api/schemas/params';
import { getComments } from '@/server/public';

export const dynamic = 'force-dynamic';

/** GET /api/v3/handlers/{id}/comments: newest first, replies flat, `before` cursor for older pages. */
export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const { id } = parseParams(HandlerPath, params);
  const query = parseQuery(CommentsQuery, req.nextUrl);
  const page = await getComments(id, {
    limit: query.limit,
    before: query.before ? new Date(query.before) : undefined,
  });
  if (!page) throw notFound('Handler');
  return jsonWithEtag(
    req,
    { items: page.items.map(toComment), nextCursor: page.nextCursor },
    { cacheControl: CACHE.read },
  );
});
export const OPTIONS = preflight;
