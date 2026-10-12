/**
 * Structured logs: one JSON object per line on stdout (stderr for errors). No dependency.
 * Never log tokens, cookies, emails, passwords or raw IPs: keys that look like those are redacted, and
 * errors are reduced to what is safe (docs/ARCHITECTURE.md section 6.7).
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE = /pass(word)?|token|secret|cookie|authorization|email|^ip$|session|hash/i;
const MAX_MESSAGE = 500;

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL ?? 'info') as Level;
  return ORDER[lvl] ?? ORDER.info;
}

// ---------- errors ----------

/**
 * Drizzle wraps database failures as "Failed query: <sql>\nparams: <values>": the values are user data
 * (emails, usernames, password hashes, whole scripts). Everything from "params:" on is dropped.
 */
export function safeErrorMessage(message: string): string {
  const head = message.split(/\r?\nparams:/)[0] ?? '';
  return head.length > MAX_MESSAGE ? `${head.slice(0, MAX_MESSAGE)}…` : head;
}

type PgCause = { code: string; constraint_name?: string; table_name?: string; column_name?: string };

/** Postgres errors (the `cause`): codes and names only; `detail` and `where` quote row values. */
function pgCause(cause: unknown): PgCause | undefined {
  if (!cause || typeof cause !== 'object') return undefined;
  const c = cause as Record<string, unknown>;
  if (typeof c.code !== 'string') return undefined;
  const out: PgCause = { code: c.code };
  for (const k of ['constraint_name', 'table_name', 'column_name'] as const) {
    if (typeof c[k] === 'string') out[k] = c[k];
  }
  return out;
}

function safeStack(err: Error, message: string): string | undefined {
  if (!err.stack) return undefined;
  const frames = err.stack.indexOf('\n    at ');
  return `${err.name}: ${message}${frames >= 0 ? err.stack.slice(frames) : ''}`;
}

/** Whether printing this error as is could leak query parameters or row values. */
function isLeaky(err: Error): boolean {
  return (
    /\r?\nparams:/.test(err.message) ||
    'params' in err ||
    (!!err.cause && typeof err.cause === 'object' && ('detail' in err.cause || 'params' in err.cause))
  );
}

/** A copy of the error without query parameters, row values or extra properties. */
export function sanitizeError(err: Error): Error {
  const message = safeErrorMessage(err.message);
  const cause = pgCause(err.cause);
  const safe = new Error(message, cause ? { cause } : undefined);
  safe.name = err.name;
  const stack = safeStack(err, message);
  if (stack) safe.stack = stack;
  return safe;
}

function errorFields(err: Error, withStack: boolean): Record<string, unknown> {
  const message = safeErrorMessage(err.message);
  const cause = pgCause(err.cause);
  return {
    name: err.name,
    message,
    ...(cause && { cause }),
    ...(withStack && { stack: safeStack(err, message) }),
  };
}

let consoleScrubbed = false;

/**
 * Next.js prints uncaught errors of Server Actions, route handlers and pages with console.error, and
 * util.inspect shows an error's own properties (Drizzle's `params`) and its cause (Postgres' `detail`).
 * Installed once at server start (instrumentation.ts): such errors are printed sanitised.
 */
export function scrubConsoleErrors(): void {
  if (consoleScrubbed) return;
  consoleScrubbed = true;
  for (const method of ['error', 'warn'] as const) {
    // The rule cannot tell wrapping console.error and console.warn from calling a dynamic method.
    // eslint-disable-next-line no-console
    const original = console[method].bind(console);
    // eslint-disable-next-line no-console
    console[method] = (...args: unknown[]) =>
      original(
        ...args.map((a) =>
          a instanceof Error && isLeaky(a)
            ? sanitizeError(a)
            : typeof a === 'string' && /\r?\nparams:/.test(a)
              ? safeErrorMessage(a)
              : a,
        ),
      );
  }
}

// ---------- structured logs ----------

function scrub(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return errorFields(value, depth <= 1);
  if (Array.isArray(value)) return depth > 3 ? '[…]' : value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    if (depth > 3) return '[…]';
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = SENSITIVE.test(k) ? '[redacted]' : scrub(v, depth + 1);
    return out;
  }
  return value;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...(scrub(fields ?? {}) as object),
  });
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};
