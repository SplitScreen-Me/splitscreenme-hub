import { toHandlerDetail } from '@/lib/api/dto';
import { CACHE, jsonWithEtag, notFound, preflight, withApi } from '@/lib/api/http';
import { HandlerPath, parseParams } from '@/lib/api/schemas/params';
import { getLinkContext } from '@/server/api/context';
import { getHandler } from '@/server/public';

export const dynamic = 'force-dynamic';

/** GET /api/v3/handlers/{id}: one listed handler with its notes, game facts, screenshots and current version. */
export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const { id } = parseParams(HandlerPath, params);
  const [handler, ctx] = await Promise.all([getHandler(id), getLinkContext()]);
  if (!handler) throw notFound('Handler');
  return jsonWithEtag(req, toHandlerDetail(handler, ctx), { cacheControl: CACHE.read });
});
export const OPTIONS = preflight;
