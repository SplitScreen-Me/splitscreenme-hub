/**
 * What the account, community, dashboard and admin services return to their Server Actions: a value, or
 * a message for the form plus optional per-field messages. Thrown errors are bugs; refusals are results.
 */
export interface Fail {
  ok: false;
  error: string;
  fields?: Record<string, string[]>;
  /** seconds, for rate limits */
  retryAfter?: number;
}

export type Result<T = undefined> = { ok: true; value: T } | Fail;

export const ok = <T = undefined>(value?: T): { ok: true; value: T } => ({ ok: true, value: value as T });

export const fail = (error: string, fields?: Record<string, string[]>): Fail =>
  fields ? { ok: false, error, fields } : { ok: false, error };

export const rateLimited = (retryAfter: number): Fail => ({
  ok: false,
  error: `Too many attempts. Try again in ${retryAfter < 120 ? `${retryAfter} s` : `${Math.ceil(retryAfter / 60)} min`}.`,
  retryAfter,
});

/** Postgres unique violation (23505), possibly wrapped by Drizzle. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}
