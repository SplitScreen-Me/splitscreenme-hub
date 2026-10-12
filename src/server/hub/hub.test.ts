import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { getDb } from '@/db';
import { comments, games, handlerVersions, handlers, users } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { clearCache } from '@/server/cache';
import { getGameBySlug, type PublicGame } from '@/server/public';
import { dbAvailable, truncateAll } from '@/test/db';
import {
  getAuthorStats,
  getPrimaryHandlerIds,
  getRelatedGames,
  getSitemapData,
  legacyHandlerPath,
  legacyUserPath,
  loadHandlerPage,
} from './index';

/**
 * Section 6.1 for the hub's own queries: only listed handlers reach the related games, the sitemap, the
 * legacy redirects, the author stats and the page loader. Fixtures: listed handlers on three games (one
 * game with two, the verified one being primary), four hidden handlers on the same game, a game whose only
 * handler is private, and authors who are deleted or banned.
 */
const A = 'authorAFixture001';
const B = 'authorBFixture001';
const DELETED = 'deletedAuthor0001';
const BANNED = 'bannedAuthor00001';
const PRIMARY = 'portalPrimary0001';
const SECOND = 'portalSecond00001';
const L4D = 'leftDeadHandler01';
const STARDEW = 'stardewHandler001';
const BANNED_H = 'bannedAuthorHand1';
const HIDDEN = {
  private: 'privateHandler001',
  unapproved: 'unapprovedHandle1',
  deleted: 'deletedHandler001',
  versionless: 'versionlessHandl1',
  privateOnly: 'privateOnlyHandl1',
} as const;
/** Listed handler of a deleted account: still public, shown as "Deleted user". */
const ORPHAN = 'deletedAuthorHnd1';

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const vid = (handlerId: string) => `v${handlerId}`.slice(0, 17);

async function seed() {
  const db = getDb();
  await db.insert(users).values([
    { id: A, username: 'author-a' },
    { id: B, username: 'Author-B' },
    { id: DELETED, username: 'deleted-abc123', deletedAt: day(1) },
    { id: BANNED, username: 'banned-one', bannedAt: day(1) },
  ]);
  const [portal, l4d, stardew, hidden, other] = await db
    .insert(games)
    .values([
      { slug: 'portal-2', name: 'Portal 2', genres: ['Puzzle', 'Shooter'] },
      { slug: 'left-4-dead-2', name: 'Left 4 Dead 2', genres: ['Shooter'] },
      { slug: 'stardew-valley', name: 'Stardew Valley', genres: ['Simulator', 'Indie'] },
      { slug: 'hidden-game', name: 'Hidden Game', genres: ['Racing'] },
      { slug: 'other-game', name: 'Other Game', genres: ['Sport'] },
    ])
    .returning();

  const listed = { isPublic: true, approvedAt: day(2), maxPlayers: 4 };
  await db.insert(handlers).values([
    {
      ...listed,
      id: PRIMARY,
      gameId: portal!.id,
      ownerId: A,
      title: 'Portal 2',
      trendScore: 5,
      downloadCount: 10,
    },
    {
      ...listed,
      id: SECOND,
      gameId: portal!.id,
      ownerId: B,
      title: 'Portal 2 alt',
      trendScore: 50,
      downloadCount: 7,
    },
    {
      ...listed,
      id: L4D,
      gameId: l4d!.id,
      ownerId: B,
      title: 'Left 4 Dead 2',
      trendScore: 1,
      downloadCount: 3,
    },
    {
      ...listed,
      id: STARDEW,
      gameId: stardew!.id,
      ownerId: A,
      title: 'Stardew',
      maxPlayers: 8,
      trendScore: 99,
      downloadCount: 100,
    },
    { ...listed, id: BANNED_H, gameId: other!.id, ownerId: BANNED, title: 'Other', downloadCount: 1 },
    {
      ...listed,
      id: HIDDEN.private,
      gameId: portal!.id,
      ownerId: A,
      title: 'Portal 2 private',
      isPublic: false,
    },
    {
      ...listed,
      id: HIDDEN.unapproved,
      gameId: portal!.id,
      ownerId: A,
      title: 'Portal 2 unapproved',
      approvedAt: null,
    },
    {
      ...listed,
      id: HIDDEN.deleted,
      gameId: portal!.id,
      ownerId: A,
      title: 'Portal 2 deleted',
      deletedAt: day(3),
      downloadCount: 1000,
    },
    { ...listed, id: HIDDEN.versionless, gameId: portal!.id, ownerId: A, title: 'Portal 2 versionless' },
    { ...listed, id: HIDDEN.privateOnly, gameId: hidden!.id, ownerId: A, title: 'Hidden', isPublic: false },
    { ...listed, id: ORPHAN, gameId: other!.id, ownerId: DELETED, title: 'Other 2' },
  ]);
  const withVersion = [
    PRIMARY,
    SECOND,
    L4D,
    STARDEW,
    BANNED_H,
    HIDDEN.private,
    HIDDEN.unapproved,
    HIDDEN.deleted,
    HIDDEN.privateOnly,
    ORPHAN,
  ];
  for (const id of withVersion) {
    await db.insert(handlerVersions).values({
      id: vid(id),
      handlerId: id,
      version: 1,
      storageKey: `packages/${id}/${vid(id)}.nc`,
      fileName: `handler-${id}-v1.nc`,
      sizeBytes: 100,
      sha256: 'a'.repeat(64),
      script: 'Game.GameName = "x";',
      verifiedAt: id === SECOND ? null : day(4),
      createdAt: id === SECOND ? day(9) : day(5),
    });
    await db
      .update(handlers)
      .set({ currentVersionId: vid(id), currentVersion: 1 })
      .where(eq(handlers.id, id));
  }
  await db.insert(comments).values([
    { id: 'commentPrimary001', handlerId: PRIMARY, authorId: B, body: 'Works great' },
    { id: 'commentPrivate001', handlerId: HIDDEN.private, authorId: B, body: 'Secret' },
  ]);
  return { portal: portal!, l4d: l4d! };
}

const ALL_HIDDEN: string[] = Object.values(HIDDEN);

describe.runIf(dbAvailable())('hub queries show listed handlers only', () => {
  let portal: PublicGame;

  beforeAll(async () => {
    await truncateAll();
    await seed();
    clearCache();
    const lookup = await getGameBySlug('portal-2');
    if (lookup?.kind !== 'game') throw new Error('fixture game missing');
    portal = lookup.game;
  });
  beforeEach(() => clearCache());

  it('primary handler ids: verified first, one per public game', async () => {
    const ids = await getPrimaryHandlerIds();
    expect([...ids].sort()).toEqual([BANNED_H, L4D, PRIMARY, STARDEW].sort());
    for (const id of [SECOND, ...ALL_HIDDEN]) expect(ids.has(id)).toBe(false);
    expect(portal.primaryHandlerId).toBe(PRIMARY);
  });

  it('related games: other public games, shared genres first', async () => {
    const related = await getRelatedGames({ id: portal.id, genres: portal.genres, maxPlayers: 4 });
    expect(related[0]!.id).toBe(L4D); // shares Shooter
    const ids = related.map((h) => h.id);
    expect(ids).not.toContain(PRIMARY);
    expect(ids).not.toContain(SECOND);
    for (const id of ALL_HIDDEN) expect(ids).not.toContain(id);
    expect(new Set(related.map((h) => h.gameSlug)).size).toBe(related.length);
  });

  it('page loader: listed handlers of this game only, others of the game', async () => {
    const page = await loadHandlerPage(portal, PRIMARY);
    expect(page?.handler.isPrimary).toBe(true);
    expect(page?.others.map((h) => h.id)).toEqual([SECOND]);
    expect(page?.comments.items.map((c) => c.id)).toEqual(['commentPrimary001']);
    expect(page?.versions).toHaveLength(1);
    expect(page?.authorStats).toEqual({ handlers: 2, downloads: 110 });
    for (const id of ALL_HIDDEN) expect(await loadHandlerPage(portal, id)).toBeNull();
    // A listed handler of another game is not served under this game.
    expect(await loadHandlerPage(portal, L4D)).toBeNull();
  });

  it('author stats count listed handlers only', async () => {
    expect(await getAuthorStats(A)).toEqual({ handlers: 2, downloads: 110 });
    expect(await getAuthorStats(B)).toEqual({ handlers: 2, downloads: 10 });
  });

  it('legacy links: 301 targets for listed handlers and live users only', async () => {
    expect(await legacyHandlerPath(PRIMARY)).toBe('/hub/portal-2');
    expect(await legacyHandlerPath(SECOND)).toBe(`/hub/portal-2/${SECOND}`);
    for (const id of ALL_HIDDEN) expect(await legacyHandlerPath(id)).toBeNull();
    expect(await legacyHandlerPath('../etc/passwd')).toBeNull();
    expect(await legacyUserPath(A)).toBe('/hub/authors/author-a');
    expect(await legacyUserPath(B)).toBe('/hub/authors/Author-B');
    expect(await legacyUserPath(DELETED)).toBeNull();
    expect(await legacyUserPath(BANNED)).toBeNull();
    expect(await legacyUserPath('unknownUser00001')).toBeNull();
  });

  it('sitemap data and route: listed content only, no version pages', async () => {
    const data = await getSitemapData();
    expect(data.games.map((g) => g.slug).sort()).toEqual([
      'left-4-dead-2',
      'other-game',
      'portal-2',
      'stardew-valley',
    ]);
    expect(data.games.find((g) => g.slug === 'portal-2')?.lastModified).toEqual(day(9));
    expect(data.handlers.map((h) => h.id)).toEqual([ORPHAN, SECOND]);
    expect(data.authors.map((a) => a.username)).toEqual(['author-a', 'Author-B']);
    expect(data.genres).not.toContain('racing');

    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('http://localhost:3000/hub/portal-2');
    expect(urls).toContain(`http://localhost:3000/hub/portal-2/${SECOND}`);
    expect(urls).toContain('http://localhost:3000/hub/genres/shooter');
    expect(urls).toContain('http://localhost:3000/hub/authors/author-a');
    expect(urls).not.toContain(`http://localhost:3000/hub/portal-2/${PRIMARY}`);
    const all = urls.join('\n');
    for (const id of ALL_HIDDEN) expect(all).not.toContain(id);
    expect(all).not.toContain('hidden-game');
    expect(all).not.toContain('/versions');
    expect(all).not.toContain('banned-one');
    expect(all).not.toContain('deleted-abc123');
  });
});

describe('robots.txt', () => {
  afterEach(() => {
    process.env.NOINDEX = '1';
    resetEnvCache();
  });

  it('no Sitemap line while NOINDEX is on, one when indexing is allowed', () => {
    process.env.NOINDEX = '1';
    resetEnvCache();
    const beta = robots();
    expect(beta.sitemap).toBeUndefined();
    expect(beta.rules).toMatchObject({ allow: '/', disallow: expect.arrayContaining(['/api/', '/admin']) });
    process.env.NOINDEX = '0';
    resetEnvCache();
    expect(robots().sitemap).toBe('http://localhost:3000/sitemap.xml');
  });
});
