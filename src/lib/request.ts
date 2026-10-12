import { env } from './env';
import { hmacHex } from './crypto';

/**
 * Request facts. The client IP is X-Real-IP only behind our nginx (TRUST_PROXY=1), which overwrites it
 * with $remote_addr. The first X-Forwarded-For entry is client-controlled and never used.
 */
export function clientIp(headers: Headers): string {
  if (!env().TRUST_PROXY) return 'local';
  const ip = headers.get('x-real-ip')?.trim();
  return ip && ip.length <= 64 ? ip : 'unknown';
}

export const utcDay = (d: Date = new Date()) => d.toISOString().slice(0, 10);

/** HMAC(APP_SECRET, ip|utcDay): lets us count and rate-limit without storing addresses. */
export const ipHash = (ip: string, day: string = utcDay()) => hmacHex(env().APP_SECRET, `${ip}|${day}`);

/** HMAC(APP_SECRET, input) for other keyed hashes (download dedup, reporter hash). */
export const keyedHash = (input: string) => hmacHex(env().APP_SECRET, input);

export class ForbiddenOriginError extends Error {
  readonly status = 403;
  constructor() {
    super('Cross-origin request refused');
  }
}

/**
 * For route handlers that read the session and change state (`/api/me/**` POST, OAuth link/unlink):
 * the Origin header must be the SITE_URL origin. Server Actions get the same check from Next itself.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(env().SITE_URL).origin) throw new ForbiddenOriginError();
}

export const truncate = (s: string | null | undefined, max: number) => (s ? s.slice(0, max) : null);
