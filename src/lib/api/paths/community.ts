import { errorResponses, registry } from '../openapi';
import { Author, CommentPage, ReportAccepted, ReportBody } from '../schemas/community';
import { AuthorPath, CommentsQuery, HandlerPath } from '../schemas/params';
import { cacheHeaders, notModified, READ_CACHE } from './common';

registry.registerPath({
  method: 'get',
  path: '/handlers/{id}/comments',
  operationId: 'listComments',
  tags: ['Community'],
  summary: 'Comments of a handler',
  description:
    'Newest first, replies flat (`parentId` points to the root comment). Removed comments are left out. ' +
    'For older comments, pass the `nextCursor` of a page as `before`.',
  request: { params: HandlerPath, query: CommentsQuery },
  responses: {
    200: {
      description: 'One page of comments',
      headers: cacheHeaders(READ_CACHE),
      content: { 'application/json': { schema: CommentPage } },
    },
    304: notModified,
    ...errorResponses(400, 404, 429, 500),
  },
});

registry.registerPath({
  method: 'post',
  path: '/handlers/{id}/reports',
  operationId: 'reportHandler',
  tags: ['Community'],
  summary: 'Report a handler to the moderators',
  description:
    'Anonymous: no account needed, and the address is only kept as a keyed hash, to refuse duplicates ' +
    '(one open report per handler and address per 24 hours; a duplicate gets the same 202 answer). ' +
    'JSON body of 4 KB at most, any `Content-Type`.\n\n' +
    'Rate limit: 5 reports per hour per address (bucket `report`).',
  request: {
    params: HandlerPath,
    body: { required: true, content: { 'application/json': { schema: ReportBody } } },
  },
  responses: {
    202: {
      description: 'Received',
      content: { 'application/json': { schema: ReportAccepted } },
    },
    ...errorResponses(400, 404, 413, 429, 500),
  },
});

registry.registerPath({
  method: 'get',
  path: '/authors/{username}',
  operationId: 'getAuthor',
  tags: ['Community'],
  summary: 'An author and their handlers',
  description: 'Public profile of a user. Deleted and suspended accounts answer 404.',
  request: { params: AuthorPath },
  responses: {
    200: {
      description: 'The author',
      headers: cacheHeaders(READ_CACHE),
      content: { 'application/json': { schema: Author } },
    },
    304: notModified,
    ...errorResponses(400, 404, 429, 500),
  },
});
