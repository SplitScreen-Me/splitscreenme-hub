/**
 * Applies the migrations in ./drizzle. Runs at container start (bundled to dist/migrate.mjs) and locally
 * through `npm run db:migrate` (reads .env.local when DATABASE_URL is not set).
 * Usage: tsx scripts/migrate.ts [--url <postgres url>]
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function runMigrations(url: string, migrationsFolder = path.resolve('drizzle')): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle({ client }), { migrationsFolder });
  } finally {
    await client.end();
  }
}

/** Host and database only: never print credentials. */
const describe = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(unparsable DATABASE_URL)';
  }
};

const isMain = process.argv[1] && /migrate\.(ts|mjs)$/.test(process.argv[1]);
if (isMain) {
  const flag = process.argv.indexOf('--url');
  if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
  const url = flag > 0 ? process.argv[flag + 1] : process.env.DATABASE_URL;
  if (!url) {
    console.error('migrate: DATABASE_URL is not set');
    process.exit(1);
  }
  const started = Date.now();
  runMigrations(url)
    .then(() => console.log(`migrate: ${describe(url)} up to date (${Date.now() - started} ms)`))
    .catch((err: unknown) => {
      console.error('migrate: failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
