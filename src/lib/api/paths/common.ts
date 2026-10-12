import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import { CACHE } from '../http';

/** Pieces shared by the path registrations: response headers and the 304 answer of cached reads. */

export const ETAG_HEADER = {
  ETag: {
    description: 'Version of this answer. Send it back in `If-None-Match` to get a 304 when nothing changed.',
    schema: { type: 'string' as const },
  },
};

export const cacheHeaders = (cacheControl: string) => ({
  ...ETAG_HEADER,
  'Cache-Control': {
    description: `\`${cacheControl}\``,
    schema: { type: 'string' as const },
  },
});

export const notModified: ResponseConfig = {
  description: 'Not modified: the `If-None-Match` ETag still matches (no body).',
};

export const READ_CACHE = CACHE.read;
export const CATALOG_CACHE = CACHE.catalog;
