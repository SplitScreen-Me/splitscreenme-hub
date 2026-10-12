import { registry, errorResponses } from '../openapi';
import { z } from '../zod';
import { Health } from '../schemas/common';

const ApiIndex = z
  .object({ name: z.string(), version: z.string(), docs: z.url(), openapi: z.url(), guide: z.url() })
  .openapi('ApiIndex');

registry.registerPath({
  method: 'get',
  path: '/health',
  operationId: 'getHealth',
  tags: ['System'],
  summary: 'Health check',
  description:
    'Answers `{ "status": "ok" }` when the database replies within 2 s, 503 otherwise. Used as the Docker ' +
    'healthcheck and as the desktop app ping. Not rate limited. `HEAD` is also accepted.',
  responses: {
    200: { description: 'Healthy', content: { 'application/json': { schema: Health } } },
    503: {
      description: 'Database unreachable',
      content: { 'application/json': { schema: Health.partial() } },
    },
    ...errorResponses(500),
  },
});

registry.registerPath({
  method: 'get',
  path: '/openapi.json',
  operationId: 'getOpenApi',
  tags: ['System'],
  summary: 'This OpenAPI 3.1 document',
  responses: { 200: { description: 'OpenAPI document', content: { 'application/json': { schema: {} } } } },
});

registry.registerPath({
  method: 'get',
  path: '/docs',
  operationId: 'getDocs',
  tags: ['System'],
  summary: 'This documentation (Swagger UI)',
  responses: { 200: { description: 'HTML page', content: { 'text/html': { schema: { type: 'string' } } } } },
});

registry.registerPath({
  method: 'get',
  path: '/',
  operationId: 'getIndex',
  tags: ['System'],
  summary: 'Where to start',
  description: 'Links to this reference, the OpenAPI document and the guide.',
  responses: {
    200: { description: 'Links', content: { 'application/json': { schema: ApiIndex } } },
    ...errorResponses(429, 500),
  },
});
