import 'server-only';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { db, type Queryable } from '@/db';
import { users } from '@/db/schema';
import { usernameCandidate } from './rules';

/** A live (not deleted) user by email (when the identifier contains "@") or username, case-insensitively. */
export async function findUserByIdentifier(identifier: string, q: Queryable = db) {
  const id = identifier.trim();
  if (!id) return null;
  const where = id.includes('@')
    ? sql`lower(${users.email}) = lower(${id})`
    : sql`lower(${users.username}) = lower(${id})`;
  const [row] = await q
    .select()
    .from(users)
    .where(and(where, isNull(users.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function findUserByEmail(email: string, q: Queryable = db) {
  const [row] = await q
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return row ?? null;
}

export async function usernameTaken(
  name: string,
  exceptUserId?: string,
  q: Queryable = db,
): Promise<boolean> {
  const [row] = await q
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`lower(${users.username}) = lower(${name})`,
        exceptUserId ? ne(users.id, exceptUserId) : undefined,
      ),
    )
    .limit(1);
  return !!row;
}

export async function emailTaken(email: string, exceptUserId?: string, q: Queryable = db): Promise<boolean> {
  const [row] = await q
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = lower(${email})`,
        exceptUserId ? ne(users.id, exceptUserId) : undefined,
      ),
    )
    .limit(1);
  return !!row;
}

/** `base`, `base-2`, `base-3`... the first free one (case-insensitive). */
export async function uniqueUsername(base: string, q: Queryable = db): Promise<string> {
  for (let attempt = 1; attempt < 1000; attempt++) {
    const candidate = usernameCandidate(base, attempt);
    if (!(await usernameTaken(candidate, undefined, q))) return candidate;
  }
  throw new Error('no free username');
}

export async function getUserById(id: string, q: Queryable = db) {
  const [row] = await q.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}
