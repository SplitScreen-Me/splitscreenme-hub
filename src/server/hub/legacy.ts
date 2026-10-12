import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getHandler } from '@/server/public';
import { paths } from '@/lib/urls';

/** Ids of the Meteor hub (and new ones): checked before any query. */
export const LEGACY_ID = /^[A-Za-z0-9]{1,64}$/;

/** Canonical path of a listed handler, for the old `/handler/<id>` links; null when not listed. */
export async function legacyHandlerPath(id: string): Promise<string | null> {
  if (!LEGACY_ID.test(id)) return null;
  const h = await getHandler(id);
  return h ? paths.handler(h.gameSlug, h.id, h.isPrimary) : null;
}

/** Author page of a user, for the old `/user/<id>` links; null for unknown, deleted or banned users. */
export async function legacyUserPath(id: string): Promise<string | null> {
  if (!LEGACY_ID.test(id)) return null;
  const [u] = await db
    .select({ username: users.username })
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt), isNull(users.bannedAt)))
    .limit(1);
  return u ? paths.author(u.username) : null;
}
