import { toVersion } from '@/lib/api/dto';
import { CACHE, jsonWithEtag, notFound, preflight, withApi } from '@/lib/api/http';
import { HandlerPath, parseParams } from '@/lib/api/schemas/params';
import { getVersions } from '@/server/public';

export const dynamic = 'force-dynamic';

/** GET /api/v3/handlers/{id}/versions: every non-deleted version, newest first. */
export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const { id } = parseParams(HandlerPath, params);
  const versions = await getVersions(id);
  if (!versions) throw notFound('Handler');
  return jsonWithEtag(req, { items: versions.map((v) => toVersion(id, v)) }, { cacheControl: CACHE.read });
});
export const OPTIONS = preflight;
