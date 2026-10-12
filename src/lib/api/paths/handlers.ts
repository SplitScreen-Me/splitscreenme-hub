import { z } from '../zod';
import { errorResponses, registry } from '../openapi';
import { HandlerDetail, VersionList } from '../schemas/handlers';
import { DownloadQuery, HandlerPath, VersionPath } from '../schemas/params';
import { cacheHeaders, notModified, READ_CACHE } from './common';

registry.registerPath({
  method: 'get',
  path: '/handlers/{id}',
  operationId: 'getHandler',
  tags: ['Handlers'],
  summary: 'One handler',
  description:
    'A listed handler with its notes, game facts, screenshots and current version (size, SHA-256, download ' +
    'URL). Handlers that are private, awaiting approval, deleted or without a version answer 404.',
  request: { params: HandlerPath },
  responses: {
    200: {
      description: 'The handler',
      headers: cacheHeaders(READ_CACHE),
      content: { 'application/json': { schema: HandlerDetail } },
    },
    304: notModified,
    ...errorResponses(400, 404, 429, 500),
  },
});

registry.registerPath({
  method: 'get',
  path: '/handlers/{id}/versions',
  operationId: 'listVersions',
  tags: ['Handlers'],
  summary: 'Versions of a handler',
  description: 'Every version still available, newest first, with release notes and a download URL each.',
  request: { params: HandlerPath },
  responses: {
    200: {
      description: 'The versions',
      headers: cacheHeaders(READ_CACHE),
      content: { 'application/json': { schema: VersionList } },
    },
    304: notModified,
    ...errorResponses(400, 404, 429, 500),
  },
});

registry.registerPath({
  method: 'get',
  path: '/handlers/{id}/versions/{version}/script',
  operationId: 'getVersionScript',
  tags: ['Handlers'],
  summary: 'Script of a version',
  description:
    'The `handler.js` of a version as plain text, as stamped by the hub at upload: its first lines set ' +
    '`Hub.Handler.Version`, `Hub.Handler.Id`, `Hub.Maintainer.Name` and `Hub.Maintainer.Id`.',
  request: { params: VersionPath },
  responses: {
    200: {
      description: 'The script',
      headers: {
        ...cacheHeaders(READ_CACHE),
        'Content-Disposition': {
          description: '`inline; filename="handler-<id>-v<version>.js"`',
          schema: { type: 'string' },
        },
      },
      content: { 'text/plain': { schema: z.string() } },
    },
    304: notModified,
    ...errorResponses(400, 404, 429, 500),
  },
});

const downloadHeaders = {
  'Content-Disposition': {
    description: '`attachment; filename="handler-<id>-v<version>.nc"`',
    schema: { type: 'string' as const },
  },
  ETag: { description: 'The SHA-256 of the file, hex, quoted.', schema: { type: 'string' as const } },
  'Repr-Digest': {
    description: 'The SHA-256 of the file (RFC 9530): `sha-256=:<base64>:`.',
    schema: { type: 'string' as const },
  },
  'Cache-Control': { description: '`private, no-cache`', schema: { type: 'string' as const } },
};

const downloadDescription =
  'The `.nc` package (a zip file) of the current version, or of `version`.\n\n' +
  '**Counting.** A `GET` counts one download for the handler and the version, at most once per address, ' +
  'handler, version and UTC day. It does not count with `count=false`, for `HEAD`, for a partial `Range` ' +
  '(other than `bytes=0-`), or for crawlers, link previews, `curl` and `wget`. **Use `count=false` when you ' +
  'try it out here**, in tests and for previews.\n\n' +
  'Check the file against `sha256` of the version (also in `ETag` and `Repr-Digest`). The answer is the ' +
  'file itself, served with `Content-Type: application/zip`.\n\n' +
  'Rate limit: 60 requests per 10 minutes per address (bucket `download`).';

for (const method of ['get', 'head'] as const) {
  registry.registerPath({
    method,
    path: '/handlers/{id}/download',
    operationId: method === 'get' ? 'downloadPackage' : 'headPackage',
    tags: ['Handlers'],
    summary: method === 'get' ? 'Download a package' : 'Package headers (never counted)',
    description: downloadDescription,
    request: { params: HandlerPath, query: DownloadQuery },
    responses: {
      200: {
        description: 'The package',
        headers: downloadHeaders,
        content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } },
      },
      206: { description: 'Part of the package (`Range`), not counted', headers: downloadHeaders },
      304: { description: 'Not modified: `If-None-Match` matches the SHA-256 (not counted)' },
      ...errorResponses(400, 404, 429, 500),
    },
  });
}
