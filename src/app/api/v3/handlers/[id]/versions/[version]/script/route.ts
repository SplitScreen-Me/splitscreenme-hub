import { CACHE, notFound, preflight, weakEtag, withApi } from '@/lib/api/http';
import { parseParams, VersionPath } from '@/lib/api/schemas/params';
import { matchesEtag } from '@/server/api/http';
import { getVersionDetail } from '@/server/public';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v3/handlers/{id}/versions/{version}/script: the stamped handler.js of a version, as plain text.
 * It is the author's code: served as text only, with nosniff and a sandbox CSP so a browser never runs it.
 */
export const GET = withApi<{ id: string; version: string }>(async (req, { params }) => {
  const { id, version } = parseParams(VersionPath, params);
  const detail = await getVersionDetail(id, version);
  if (!detail) throw notFound('Handler version');
  const etag = weakEtag(detail.script);
  const headers = {
    ETag: etag,
    'Cache-Control': CACHE.read,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Disposition': `inline; filename="handler-${id}-v${version}.js"`,
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
  if (matchesEtag(req, etag)) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : detail.script, { headers });
});
export const OPTIONS = preflight;
