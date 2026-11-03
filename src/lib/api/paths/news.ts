import { errorResponses, registry } from '../openapi';
import { NewsList } from '../schemas/news';
import { cacheHeaders, NEWS_CACHE, notModified } from './common';

registry.registerPath({
  method: 'get',
  path: '/news',
  operationId: 'listNews',
  tags: ['News'],
  summary: 'Live announcements',
  description:
    'The announcements the Nucleus Co-op app shows in its one-line ticker: published, started and not ' +
    'ended. `critical` first, then `warning`, then `info`, the latest start first; at most 10. An empty ' +
    '`items` list (still 200) means there is nothing to show. Show `message` as plain text on one line, ' +
    'with a "Learn more" link when `url` is set. Poll it every few minutes with `If-None-Match`: the ' +
    'answer is fresh for 60 seconds, and a new or withdrawn announcement shows within that time.',
  responses: {
    200: {
      description: 'The live announcements',
      headers: cacheHeaders(NEWS_CACHE),
      content: { 'application/json': { schema: NewsList } },
    },
    304: notModified,
    ...errorResponses(429, 500),
  },
});
