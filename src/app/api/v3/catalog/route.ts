import { toHandlerSummary } from '@/lib/api/dto';
import { CACHE, jsonWithEtag, preflight, serialized, weakEtag, withApi } from '@/lib/api/http';
import { getLinkContext } from '@/server/api/context';
import { cached, TAGS } from '@/server/cache';
import { getCatalog } from '@/server/public';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v3/catalog: every listed handler, trend order (the desktop app's whole catalogue). The payload
 * is serialised and its ETag computed once per cache period (a 304 costs no serialisation); the ETag
 * covers the items only, so it stays the same across rebuilds while nothing changed.
 */
function catalogPayload() {
  return cached(
    'api:catalog',
    5 * 60_000,
    async () => {
      const [handlers, ctx] = await Promise.all([getCatalog(), getLinkContext()]);
      const items = handlers.map((h) => toHandlerSummary(h, ctx));
      return {
        body: serialized({ generatedAt: new Date().toISOString(), count: items.length, items }),
        etag: weakEtag(JSON.stringify(items)),
      };
    },
    [TAGS.catalog],
  );
}

export const GET = withApi(
  async (req) => {
    const { body, etag } = await catalogPayload();
    return jsonWithEtag(req, body, { etag, cacheControl: CACHE.catalog });
  },
  { rateLimit: 'catalog' },
);
export const OPTIONS = preflight;
