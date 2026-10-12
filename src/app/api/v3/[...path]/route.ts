import { ApiError, preflight, withApi } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

/** Any other /api/v3 path: a JSON 404 with the API headers, instead of the site's HTML page. */
const unknown = withApi<{ path: string[] }>(async () => {
  throw new ApiError('not_found', 'Unknown endpoint, see /api/v3/docs');
});

export const GET = unknown;
export const HEAD = unknown;
export const POST = unknown;
export const PUT = unknown;
export const PATCH = unknown;
export const DELETE = unknown;
export const OPTIONS = preflight;
