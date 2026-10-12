import { jsonWithEtag, preflight, withApi } from '@/lib/api/http';
import { absoluteUrl, apiBase, paths } from '@/lib/urls';

export const dynamic = 'force-dynamic';

/** GET /api/v3: where to start (the reference, the OpenAPI document, the guide). */
export const GET = withApi(async (req) =>
  jsonWithEtag(
    req,
    {
      name: 'SplitScreen.Me API',
      version: '3.0.0',
      docs: `${apiBase()}/docs`,
      openapi: `${apiBase()}/openapi.json`,
      guide: absoluteUrl(paths.doc('api')),
    },
    { cacheControl: 'public, max-age=300' },
  ),
);
export const OPTIONS = preflight;
