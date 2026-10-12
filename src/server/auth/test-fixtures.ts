import { getDb } from '@/db';
import { games, handlerVersions, handlers, users } from '@/db/schema';
import { newId } from '@/lib/ids';
import type { SessionUser } from '@/lib/auth/session';

/** Synthetic rows for the account, community, dashboard and moderation tests (never real data). */

export async function makeUser(
  over: Partial<typeof users.$inferInsert> = {},
): Promise<typeof users.$inferSelect> {
  const id = over.id ?? newId();
  const [row] = await getDb()
    .insert(users)
    .values({
      id,
      username: over.username ?? `u-${id.slice(0, 8)}`,
      email: over.email === undefined ? `${id.toLowerCase()}@example.test` : over.email,
      emailVerifiedAt: over.emailVerifiedAt === undefined ? new Date() : over.emailVerifiedAt,
      createdAt: over.createdAt ?? new Date(Date.now() - 7 * 86_400_000),
      ...over,
    })
    .returning();
  return row!;
}

export const asViewer = (
  u: typeof users.$inferSelect,
  hasOAuth = false,
): SessionUser & { sessionId: string } => ({
  id: u.id,
  username: u.username,
  email: u.email,
  emailVerifiedAt: u.emailVerifiedAt,
  role: u.role,
  trustedAuthor: u.trustedAuthor,
  notifyReplies: u.notifyReplies,
  createdAt: u.createdAt,
  hasPassword: !!u.passwordHash,
  hasOAuth,
  sessionId: 'test-session',
});

let gameSeq = 0;

export async function makeGame(name = `Game ${++gameSeq}`) {
  const [g] = await getDb()
    .insert(games)
    .values({ name, slug: `game-${Date.now().toString(36)}-${++gameSeq}` })
    .returning();
  return g!;
}

/** A listed handler (public, approved, with a current version) unless overridden. */
export async function makeHandler(ownerId: string, over: Partial<typeof handlers.$inferInsert> = {}) {
  const game = over.gameId ? { id: over.gameId } : await makeGame();
  const id = over.id ?? newId();
  await getDb()
    .insert(handlers)
    .values({
      id,
      gameId: game.id,
      ownerId,
      title: `Handler ${id.slice(0, 5)}`,
      isPublic: true,
      approvedAt: new Date(),
      ...over,
      currentVersionId: null,
    });
  const versionId = newId();
  if (over.currentVersionId !== null) {
    await getDb()
      .insert(handlerVersions)
      .values({
        id: versionId,
        handlerId: id,
        version: 1,
        storageKey: `packages/${id}/${versionId}.nc`,
        fileName: `handler-${id}-v1.nc`,
        sizeBytes: 10,
        sha256: '0'.repeat(64),
        script: 'Game.GameName = "x";',
      });
    const { eq } = await import('drizzle-orm');
    await getDb()
      .update(handlers)
      .set({ currentVersionId: versionId, currentVersion: 1 })
      .where(eq(handlers.id, id));
  }
  return { id, gameId: game.id, versionId };
}
