import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db';
import { comments, games, handlerVersions, handlers, users } from '@/db/schema';
import { clearCache } from '@/server/cache';
import { dbAvailable, truncateAll } from '@/test/db';
import {
  getAuthor,
  getCatalog,
  getComments,
  getGameBySlug,
  getGenres,
  getHandler,
  getStats,
  getTrending,
  getVersionFile,
  getVersions,
  handlerState,
  isListed,
  searchHandlers,
} from './index';

/**
 * Section 6.1: only listed handlers are ever public. Fixtures: one listed handler and four that must stay
 * invisible (private, awaiting approval, deleted, no version), plus a game whose only handler is private.
 */
const OWNER = 'ownerFixture00001';
const LISTED = 'listedHandler0001';
const HIDDEN = {
  private: 'privateHandler001',
  unapproved: 'unapprovedHandle1',
  deleted: 'deletedHandler001',
  versionless: 'versionlessHandl1',
} as const;
const PRIVATE_ONLY = 'privateOnlyHandl1';

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const versionIdOf = (handlerId: string) => `v${handlerId}`.slice(0, 17);

async function seedFixtures() {
  const db = getDb();
  await db.insert(users).values({ id: OWNER, username: 'fixture-author', email: 'fixture@example.test' });
  const [g1, g2] = await db
    .insert(games)
    .values([
      { slug: 'portal-2', name: 'Portal 2', genres: ['Puzzle', 'Shooter'], coverImageId: 'co1rs4' },
      { slug: 'hidden-game', name: 'Hidden Game', genres: ['Racing'] },
    ])
    .returning();

  const base = { gameId: g1!.id, ownerId: OWNER, maxPlayers: 4, supportsControllers: true };
  await db.insert(handlers).values([
    { ...base, id: LISTED, title: 'Portal 2 coop', isPublic: true, approvedAt: day(2), trendScore: 5 },
    { ...base, id: HIDDEN.private, title: 'Portal 2 private', isPublic: false, approvedAt: day(2) },
    { ...base, id: HIDDEN.unapproved, title: 'Portal 2 unapproved', isPublic: true, approvedAt: null },
    {
      ...base,
      id: HIDDEN.deleted,
      title: 'Portal 2 deleted',
      isPublic: true,
      approvedAt: day(2),
      deletedAt: day(3),
    },
    { ...base, id: HIDDEN.versionless, title: 'Portal 2 versionless', isPublic: true, approvedAt: day(2) },
    {
      ...base,
      id: PRIVATE_ONLY,
      gameId: g2!.id,
      title: 'Hidden Game private',
      isPublic: false,
      approvedAt: day(2),
    },
  ]);
  for (const id of [LISTED, HIDDEN.private, HIDDEN.unapproved, HIDDEN.deleted, PRIVATE_ONLY]) {
    const versionId = versionIdOf(id);
    await db.insert(handlerVersions).values({
      id: versionId,
      handlerId: id,
      version: 1,
      storageKey: `packages/${id}/${versionId}.nc`,
      fileName: `handler-${id}-v1.nc`,
      sizeBytes: 100,
      sha256: 'a'.repeat(64),
      script: 'Game.GameName = "x";',
      verifiedAt: id === LISTED ? day(4) : null,
    });
    await db.update(handlers).set({ currentVersionId: versionId, currentVersion: 1 }).where(eqId(id));
  }
  await db.insert(comments).values([
    { id: 'commentListed0001', handlerId: LISTED, authorId: OWNER, body: 'Works great' },
    { id: 'commentPrivate001', handlerId: HIDDEN.private, authorId: OWNER, body: 'Secret' },
  ]);
}

const eqId = (id: string) => eq(handlers.id, id);

describe('isListed / handlerState', () => {
  const h = { deletedAt: null, isPublic: true, approvedAt: day(1), currentVersionId: 'x' };
  it('matches the SQL predicate', () => {
    expect(isListed(h)).toBe(true);
    expect(isListed({ ...h, isPublic: false })).toBe(false);
    expect(isListed({ ...h, approvedAt: null })).toBe(false);
    expect(isListed({ ...h, deletedAt: day(2) })).toBe(false);
    expect(isListed({ ...h, currentVersionId: null })).toBe(false);
    expect(handlerState({ ...h, currentVersionId: null })).toBe('draft');
    expect(handlerState({ ...h, approvedAt: null })).toBe('awaiting_approval');
  });
});

describe.runIf(dbAvailable())('public data shows listed handlers only', () => {
  beforeAll(async () => {
    await truncateAll();
    await seedFixtures();
  });
  beforeEach(() => clearCache());

  it('catalogue, search and trending', async () => {
    expect((await getCatalog()).map((h) => h.id)).toEqual([LISTED]);
    const all = await searchHandlers({});
    expect(all.items.map((h) => h.id)).toEqual([LISTED]);
    expect(all.total).toBe(1);
    const pastEnd = await searchHandlers({ page: 5 });
    expect(pastEnd.items).toEqual([]);
    expect(pastEnd.total).toBe(1);
    for (const q of ['private', 'unapproved', 'deleted', 'versionless', 'hidden']) {
      expect((await searchHandlers({ q })).items.map((h) => h.id)).not.toEqual(
        expect.arrayContaining(Object.values(HIDDEN)),
      );
    }
    expect((await searchHandlers({ q: 'portal coop' })).items.map((h) => h.id)).toEqual([LISTED]);
    expect((await searchHandlers({ q: 'PÔRTAL' })).items.map((h) => h.id)).toEqual([LISTED]);
    expect((await searchHandlers({ q: 'fixture-author' })).total).toBe(1);
    expect((await searchHandlers({ q: 'portla' })).items.map((h) => h.id)).toEqual([LISTED]); // fuzzy fallback
    expect((await searchHandlers({ genre: 'puzzle', verified: true, players: '3-4' })).total).toBe(1);
    expect((await searchHandlers({ genre: 'racing' })).total).toBe(0);
    expect((await getTrending()).map((h) => h.id)).toEqual([LISTED]);
  });

  it('handler, versions, files and comments', async () => {
    const listed = await getHandler(LISTED);
    expect(listed?.isPrimary).toBe(true);
    expect(listed?.verified).toBe(true);
    expect(listed?.authorName).toBe('fixture-author');
    expect(await getVersions(LISTED)).toHaveLength(1);
    expect((await getVersionFile(LISTED))?.storageKey).toBe(`packages/${LISTED}/${versionIdOf(LISTED)}.nc`);
    expect((await getComments(LISTED))?.items.map((c) => c.id)).toEqual(['commentListed0001']);
    for (const id of [...Object.values(HIDDEN), PRIVATE_ONLY]) {
      expect(await getHandler(id)).toBeNull();
      expect(await getVersions(id)).toBeNull();
      expect(await getVersionFile(id)).toBeNull();
      expect(await getVersionFile(id, 1)).toBeNull();
      expect(await getComments(id)).toBeNull();
    }
  });

  it('games, genres, authors and stats', async () => {
    const portal = await getGameBySlug('portal-2');
    expect(portal?.kind === 'game' && portal.game.handlers.map((h) => h.id)).toEqual([LISTED]);
    expect(await getGameBySlug('hidden-game')).toBeNull();
    expect((await getGenres()).map((g) => g.name).sort()).toEqual(['Puzzle', 'Shooter']);
    expect((await getAuthor('FIXTURE-AUTHOR'))?.handlers.map((h) => h.id)).toEqual([LISTED]);
    const stats = await getStats();
    expect(stats.publicHandlers).toBe(1);
    expect(stats.games).toBe(1);
    expect(stats.comments).toBe(1);
  });
});
