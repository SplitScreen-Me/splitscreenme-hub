import '@/lib/api/paths';
import { jsonWithEtag, preflight, withApi } from '@/lib/api/http';
import { apiDocument } from '@/lib/api/paths/overview';
import { absoluteUrl, apiBase, paths } from '@/lib/urls';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req) =>
  jsonWithEtag(req, apiDocument(apiBase(), absoluteUrl(paths.doc('api'))), {
    cacheControl: 'public, max-age=300',
  }),
);
export const OPTIONS = preflight;
