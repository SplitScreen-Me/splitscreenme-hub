import { LRUCache } from 'lru-cache';

/**
 * In-process fixed-window rate limits (single instance). docs/ARCHITECTURE.md section 6.5.
 * One rule = one limit over one window; a bucket with several limits (login) is several rules,
 * each checked with its own key.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RULES = {
  /** 5 / min per IP + identifier */
  'login:ip-identifier': { limit: 5, windowMs: MINUTE },
  /** 30 / h per IP */
  'login:ip': { limit: 30, windowMs: HOUR },
  /** 10 failures / 15 min per account: `hit` on failure only, `check` before trying */
  'login:account-failures': { limit: 10, windowMs: 15 * MINUTE },
  register: { limit: 5, windowMs: HOUR },
  'password-reset:email': { limit: 3, windowMs: HOUR },
  'password-reset:ip': { limit: 10, windowMs: HOUR },
  'verify-resend': { limit: 3, windowMs: HOUR },
  'oauth-start': { limit: 20, windowMs: MINUTE },
  'comment:burst': { limit: 1, windowMs: 5 * SECOND },
  'comment:day': { limit: 30, windowMs: DAY },
  /** accounts younger than 24 h */
  'comment:day-new-account': { limit: 5, windowMs: DAY },
  star: { limit: 30, windowMs: MINUTE },
  report: { limit: 5, windowMs: HOUR },
  upload: { limit: 10, windowMs: HOUR },
  'igdb-search': { limit: 2, windowMs: 5 * SECOND },
  api: { limit: 300, windowMs: 5 * MINUTE },
  catalog: { limit: 30, windowMs: 5 * MINUTE },
  download: { limit: 60, windowMs: 10 * MINUTE },
  'admin-write': { limit: 60, windowMs: MINUTE },
} as const satisfies Record<string, { limit: number; windowMs: number }>;

export type RuleName = keyof typeof RULES;

export type RateLimitResult =
  { ok: true; remaining: number } | { ok: false; remaining: 0; /** seconds */ retryAfter: number };

interface Window {
  count: number;
  resetAt: number;
}

const store = new LRUCache<string, Window>({ max: 50_000, ttlAutopurge: false });

function current(rule: RuleName, key: string, now: number): { k: string; w: Window | undefined } {
  const k = `${rule}\u0000${key}`;
  const w = store.get(k);
  return { k, w: w && w.resetAt > now ? w : undefined };
}

/** Counts one hit and says whether it is allowed. */
export function hit(rule: RuleName, key: string, now: number = Date.now()): RateLimitResult {
  const { limit, windowMs } = RULES[rule];
  const { k, w } = current(rule, key, now);
  const win = w ?? { count: 0, resetAt: now + windowMs };
  if (win.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((win.resetAt - now) / 1000)) };
  }
  win.count += 1;
  store.set(k, win, { ttl: Math.max(1, win.resetAt - now) });
  return { ok: true, remaining: limit - win.count };
}

/** Says whether a hit would be allowed, without counting it. */
export function check(rule: RuleName, key: string, now: number = Date.now()): RateLimitResult {
  const { limit } = RULES[rule];
  const { w } = current(rule, key, now);
  if (w && w.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  return { ok: true, remaining: limit - (w?.count ?? 0) };
}

/** Several rules at once (e.g. login per IP+identifier and per IP): all must pass; counts only if they do. */
export function hitAll(
  checks: ReadonlyArray<readonly [RuleName, string]>,
  now: number = Date.now(),
): RateLimitResult {
  for (const [rule, key] of checks) {
    const r = check(rule, key, now);
    if (!r.ok) return r;
  }
  let remaining = Number.POSITIVE_INFINITY;
  for (const [rule, key] of checks) {
    const r = hit(rule, key, now);
    if (!r.ok) return r;
    remaining = Math.min(remaining, r.remaining);
  }
  return { ok: true, remaining: Number.isFinite(remaining) ? remaining : 0 };
}

/** Clears a key (e.g. login failures after a success). */
export function reset(rule: RuleName, key: string): void {
  store.delete(`${rule}\u0000${key}`);
}

/** Tests only. */
export function resetAllRateLimits(): void {
  store.clear();
}
