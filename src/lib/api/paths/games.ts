import { errorResponses, registry } from '../openapi';
import { Game, GenreList, Stats } from '../schemas/games';
import { GamePath } from '../schemas/params';
import { CATALOG_CACHE, cacheHeaders, notModified, READ_CACHE } from './common';

registry.registerPath({
  method: 'get',
  path: '/games/{slug}',
  operationId: 'getGame',
  tags: ['Games'],
  summary: 'A game and its handlers',
  description:
    'A game with at least one listed handler, its IGDB facts and screenshots, and every listed handler, ' +
    'the primary one first. A renamed game answers 308 to its new slug.',
  request: { params: GamePath },
  responses: {
    200: {
      description: 'The game',
      headers: cacheHeaders(READ_CACHE),
      content: { 'application/json': { schema: Game } },
    },
    304: notModified,
    308: {
      description: 'The game was renamed: `Location` is its new URL in this API',
      headers: { Location: { description: 'New URL', schema: { type: 'string', format: 'uri' } } },
    },
    ...errorResponses(400, 404, 429, 500),
  },
});

registry.registerPath({
  method: 'get',
  path: '/genres',
  operationId: 'listGenres',
  tags: ['Games'],
  summary: 'Genres',
  description:
    'IGDB genres of the games that have a listed handler, with their game counts. Use `slug` as the `genre` filter.',
  responses: {
    200: {
      description: 'The genres',
      headers: cacheHeaders(CATALOG_CACHE),
      content: { 'application/json': { schema: GenreList } },
    },
    304: notModified,
    ...errorResponses(429, 500),
  },
});

registry.registerPath({
  method: 'get',
  path: '/stats',
  operationId: 'getStats',
  tags: ['Stats'],
  summary: 'Hub counters',
  description: 'Handlers, games, downloads, members and comments. Computed at most every 10 minutes.',
  responses: {
    200: {
      description: 'The counters',
      headers: cacheHeaders('public, max-age=300, stale-while-revalidate=600'),
      content: { 'application/json': { schema: Stats } },
    },
    304: notModified,
    ...errorResponses(429, 500),
  },
});
