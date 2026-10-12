import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * Postgres client (postgres-js) + Drizzle. One pool per process, created lazily on first use so that
 * importing this module never needs a database (next build, tests without DB).
 * In development the instance lives on globalThis so hot reloads do not open a new pool each time.
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return Object.assign(drizzle({ client, schema, casing: 'snake_case' }), { $close: () => client.end() });
}

export type Db = ReturnType<typeof createDb>;
/** A transaction handle, as passed to `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the db or a transaction. */
export type Queryable = Db | Tx;

const holder = globalThis as unknown as { __ssmDb?: Db };

export function getDb(): Db {
  if (!holder.__ssmDb) holder.__ssmDb = createDb(env().DATABASE_URL);
  return holder.__ssmDb;
}

/** Lazy proxy to the shared instance: `import { db } from '@/db'`. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real) as unknown;
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export { schema };
