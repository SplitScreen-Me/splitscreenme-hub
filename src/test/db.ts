import { sql } from 'drizzle-orm';
import { inject } from 'vitest';
import { getDb } from '@/db';

/** True when the global setup reached and migrated the test database. */
export const dbAvailable = () => inject('dbAvailable');

/** Empties every table (TRUNCATE skips the audit_log row trigger on purpose). */
export async function truncateAll(): Promise<void> {
  await getDb().execute(sql`
    do $$ declare r record; begin
      for r in select tablename from pg_tables where schemaname = 'public' loop
        execute 'truncate table ' || quote_ident(r.tablename) || ' restart identity cascade';
      end loop;
    end $$;`);
}
