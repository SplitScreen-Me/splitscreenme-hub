import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { ApiError } from './schemas/common';

/**
 * The OpenAPI 3.1 registry of /api/v3. Each route group registers its paths in src/lib/api/paths/*.ts,
 * all imported by src/lib/api/paths/index.ts, which the openapi.json route imports before generating.
 */
export const registry = new OpenAPIRegistry();

registry.register('Error', ApiError);

export const API_TAGS = [
  { name: 'Catalogue', description: 'Every listed handler, search and filters.' },
  { name: 'Handlers', description: 'One handler, its versions, scripts and package downloads.' },
  { name: 'Games', description: 'Games and genres.' },
  { name: 'Community', description: 'Comments, authors and reports.' },
  { name: 'Stats', description: 'Hub counters.' },
  { name: 'System', description: 'Health and this document.' },
] as const;

/** Standard error responses, to spread into a path's `responses`. */
export const errorResponses = (...statuses: (400 | 404 | 413 | 429 | 500)[]) =>
  Object.fromEntries(
    statuses.map((s) => [
      s,
      {
        description: {
          400: 'Invalid parameters (`bad_request`, zod issues included)',
          404: 'Not found (`not_found`), also for anything that is not listed',
          413: 'Body too large (`payload_too_large`)',
          429: 'Rate limited (`rate_limited`), see `Retry-After`',
          500: 'Server error (`internal`)',
        }[s],
        content: { 'application/json': { schema: ApiError } },
      },
    ]),
  );

let cached: { serverUrl: string; doc: ReturnType<OpenApiGeneratorV31['generateDocument']> } | undefined;

/** Built once per process (per server URL). */
export function openApiDocument(serverUrl: string) {
  if (cached?.serverUrl === serverUrl) return cached.doc;
  const doc = new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'SplitScreen.Me API',
      version: '3.0.0',
      description:
        'Public, read-only API of the SplitScreen.Me hub: Nucleus Co-op handlers, games, versions and comments. ' +
        'No authentication, CORS open to every origin, JSON in camelCase, dates in ISO 8601 UTC. ' +
        'Only listed handlers exist for the API: anything else is a 404. Rate limited per IP.',
      license: { name: 'GPL-3.0', url: 'https://www.gnu.org/licenses/gpl-3.0.html' },
    },
    servers: [{ url: serverUrl }],
    tags: [...API_TAGS],
  });
  cached = { serverUrl, doc };
  return doc;
}
