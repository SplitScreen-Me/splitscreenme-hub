import { createHash, randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { env } from '../env';
import { log } from '../log';
import { hit, type RuleName } from '../rate-limit';
import { clientIp } from '../request';

/**
 * Conventions of /api/v3 (docs/ARCHITECTURE.md section 5.2): public, cookie-less, CORS `*`, JSON errors
 * `{ error: { code, message, issues? } }`, ETag + 304 on reads, rate limits per IP. Every route is
 * `export const GET = withApi(handler, { rateLimit })` and `export const OPTIONS = preflight`.
 */

export type ApiErrorCode = 'bad_request' | 'not_found' | 'rate_limited' | 'payload_too_large' | 'internal';

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  rate_limited: 429,
  payload_too_large: 413,
  internal: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: unknown[],
    readonly retryAfter?: number,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (what = 'Resource') => new ApiError('not_found', `${what} not found`);
export const badRequest = (message: string, issues?: unknown[]) =>
  new ApiError('bad_request', message, issues);

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, Retry-After, Content-Disposition',
  'Access-Control-Max-Age': '86400',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
};

export const CACHE = {
  /** Default for reads */
  read: 'public, max-age=60, stale-while-revalidate=300',
  /** Catalogue */
  catalog: 'public, max-age=300, stale-while-revalidate=3600',
  none: 'no-store',
} as const;

function applyCommonHeaders(res: Response, requestId: string): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  res.headers.set('X-Request-Id', requestId);
  // Read at runtime: the image is built once and runs with any environment.
  if (env().NOINDEX) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export function errorResponse(err: ApiError): Response {
  const body = { error: { code: err.code, message: err.message, ...(err.issues && { issues: err.issues }) } };
  const res = Response.json(body, { status: err.status, headers: { 'Cache-Control': CACHE.none } });
  if (err.retryAfter) res.headers.set('Retry-After', String(err.retryAfter));
  return res;
}

/** `OPTIONS` handler of every API route. */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
}

export interface ApiContext<P> {
  params: P;
  ip: string;
  requestId: string;
}

export interface WithApiOptions {
  /** Rate-limit rule applied per client IP; `false` for none (health). Default `api`. */
  rateLimit?: RuleName | false;
}

type RouteContext<P> = { params: Promise<P> };

/** Wraps a route handler: rate limit, error mapping, common headers, one log line. */
export function withApi<P extends Record<string, string | string[]> = Record<string, never>>(
  handler: (req: NextRequest, ctx: ApiContext<P>) => Promise<Response>,
  options: WithApiOptions = {},
): (req: NextRequest, ctx: RouteContext<P>) => Promise<Response> {
  const rule = options.rateLimit === undefined ? 'api' : options.rateLimit;
  return async (req, routeCtx) => {
    const started = performance.now();
    const requestId = randomUUID();
    const ip = clientIp(req.headers);
    let res: Response;
    try {
      if (rule) {
        const r = hit(rule, ip);
        if (!r.ok) throw new ApiError('rate_limited', 'Too many requests', undefined, r.retryAfter);
      }
      res = await handler(req, { params: await routeCtx.params, ip, requestId });
    } catch (err) {
      if (err instanceof ApiError) res = errorResponse(err);
      else if (err instanceof ZodError) res = errorResponse(badRequest('Invalid parameters', err.issues));
      else {
        log.error('api.unhandled', { requestId, route: req.nextUrl.pathname, err });
        res = errorResponse(new ApiError('internal', 'Internal error'));
      }
    }
    applyCommonHeaders(res, requestId);
    log.info('api', {
      requestId,
      method: req.method,
      route: req.nextUrl.pathname,
      status: res.status,
      ms: Math.round(performance.now() - started),
    });
    return res;
  };
}

/** Weak ETag of a payload. */
export const weakEtag = (payload: string) =>
  `W/"${createHash('sha256').update(payload).digest('base64url').slice(0, 27)}"`;

function etagMatches(req: Request, etag: string): boolean {
  const header = req.headers.get('if-none-match');
  if (!header) return false;
  const strip = (t: string) => t.trim().replace(/^W\//, '');
  return header.split(',').some((t) => t.trim() === '*' || strip(t) === strip(etag));
}

/** A body serialised once and reused (see jsonWithEtag). */
export class SerializedJson {
  constructor(readonly json: string) {}
}

export const serialized = (data: unknown): SerializedJson => new SerializedJson(JSON.stringify(data));

/**
 * JSON response with a weak ETag; answers 304 when the client already has it. With a precomputed
 * `etag`, the 304 check comes first and nothing is serialised; pass `serialized(data)` to reuse a
 * cached string.
 */
export function jsonWithEtag(
  req: Request,
  data: unknown,
  init: { cacheControl?: string; status?: number; etag?: string } = {},
): Response {
  const cacheControl = init.cacheControl ?? CACHE.read;
  if (init.etag && etagMatches(req, init.etag)) {
    return new Response(null, { status: 304, headers: { ETag: init.etag, 'Cache-Control': cacheControl } });
  }
  const payload = data instanceof SerializedJson ? data.json : JSON.stringify(data);
  const etag = init.etag ?? weakEtag(payload);
  const headers = { ETag: etag, 'Cache-Control': cacheControl };
  if (etagMatches(req, etag)) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : payload, {
    status: init.status ?? 200,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
