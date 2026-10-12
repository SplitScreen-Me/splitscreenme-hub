import path from 'node:path';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../scripts/migrate';
import { TEST_DATABASE_URL } from './db-url';

declare module 'vitest' {
  export interface ProvidedContext {
    dbAvailable: boolean;
  }
}

/**
 * Recreates the test database schema from the migrations once per run. Without a reachable database the
 * DB suites are skipped with a warning, unless REQUIRE_DB=1 (then the run fails).
 */
export default async function setup(project: TestProject) {
  const url = new URL(TEST_DATABASE_URL);
  if (!/^ssm_test|_test$/.test(url.pathname.slice(1))) {
    throw new Error(`refusing to reset ${url.pathname.slice(1)}: the test database name must end in _test`);
  }
  const sql = postgres(TEST_DATABASE_URL, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    await sql`select 1`;
  } catch (err) {
    await sql.end({ timeout: 1 }).catch(() => {});
    if (process.env.REQUIRE_DB === '1') throw err;
    console.warn(
      `\n[tests] No test database at ${url.host}${url.pathname}: DB suites are SKIPPED. ` +
        'Start it with `npm run db:up` (or set REQUIRE_DB=1 to fail instead).\n',
    );
    project.provide('dbAvailable', false);
    return;
  }
  await sql.unsafe(
    'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;',
  );
  await sql.end();
  await runMigrations(TEST_DATABASE_URL, path.resolve('drizzle'));
  project.provide('dbAvailable', true);
}
