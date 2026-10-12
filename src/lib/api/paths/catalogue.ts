import { errorResponses, registry } from '../openapi';
import { Catalog, HandlerPage } from '../schemas/handlers';
import { HandlersQuery } from '../schemas/params';
import { CATALOG_CACHE, cacheHeaders, notModified, READ_CACHE } from './common';

registry.registerPath({
  method: 'get',
  path: '/catalog',
  operationId: 'getCatalog',
  tags: ['Catalogue'],
  summary: 'Every listed handler',
  description:
    'The whole catalogue in one answer, trending first: what the desktop app loads to browse and search ' +
    'offline. About 900 handlers, gzip-compressed on the wire. Rebuilt at most every 5 minutes; send the ' +
    '`ETag` back in `If-None-Match` and you get a 304 while nothing changed.\n\n' +
    'Rate limit: 30 requests per 5 minutes per address (bucket `catalog`).',
  responses: {
    200: {
      description: 'Every listed handler',
      headers: cacheHeaders(CATALOG_CACHE),
      content: { 'application/json': { schema: Catalog } },
    },
    304: notModified,
    ...errorResponses(429, 500),
  },
});

registry.registerPath({
  method: 'get',
  path: '/handlers',
  operationId: 'searchHandlers',
  tags: ['Catalogue'],
  summary: 'Search and filter handlers',
  description:
    'Search, filters, sort and pages, with the same rules as the catalogue page of the site. Filters ' +
    'combine (AND). An unknown genre slug gives an empty page.',
  request: { query: HandlersQuery },
  responses: {
    200: {
      description: 'One page of handlers',
      headers: cacheHeaders(READ_CACHE),
      content: { 'application/json': { schema: HandlerPage } },
    },
    304: notModified,
    ...errorResponses(400, 429, 500),
  },
});
