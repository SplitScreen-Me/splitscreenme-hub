import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as authorRoute from '@/app/api/v3/authors/[username]/route';
import * as catalogRoute from '@/app/api/v3/catalog/route';
import * as gameRoute from '@/app/api/v3/games/[slug]/route';
import * as genresRoute from '@/app/api/v3/genres/route';
import * as commentsRoute from '@/app/api/v3/handlers/[id]/comments/route';
import * as handlerRoute from '@/app/api/v3/handlers/[id]/route';
import * as scriptRoute from '@/app/api/v3/handlers/[id]/versions/[version]/script/route';
import * as versionsRoute from '@/app/api/v3/handlers/[id]/versions/route';
import * as searchRoute from '@/app/api/v3/handlers/route';
import * as statsRoute from '@/app/api/v3/stats/route';
import * as unknownRoute from '@/app/api/v3/[...path]/route';
import { Author, CommentPage } from '@/lib/api/schemas/community';
import { Game, GenreList, Stats } from '@/lib/api/schemas/games';
import { Catalog, HandlerDetail, HandlerPage, HandlerSummary, VersionList } from '@/lib/api/schemas/handlers';
import { resetAllRateLimits } from '@/lib/rate-limit';
import { clearCache } from '@/server/cache';
import { dbAvailable, truncateAll } from '@/test/db';
import { C, call, expectApiHeaders, H, HIDDEN, HIDDEN_IDS, LISTED_IDS, SCRIPT_V2, seed, V } from './fixtures';

const SITE = 'http://localhost:3000';

/** Parses with the schema and checks that the payload has no field the schema does not document. */
function expectContract<T>(schema: { parse: (v: unknown) => T; shape?: object }, value: unknown): T {
  const parsed = schema.parse(value);
  if (schema.shape && value && typeof value === 'object') {
    expect(Object.keys(value).sort()).toEqual(Object.keys(schema.shape).sort());
  }
  return parsed;
}

interface ErrorBody {
  error: { code: string; message: string; issues?: unknown[] };
}

/** A JSON body: checked against a schema by the caller, or read as an API error. */
async function json(res: Response): Promise<ErrorBody> {
  expect(res.headers.get('content-type')).toMatch(/^application\/json/);
  return (await res.json()) as ErrorBody;
}

describe.runIf(dbAvailable())('API v3 reads', () => {
  beforeAll(async () => {
    await truncateAll();
    await seed();
  });
  beforeEach(() => {
    clearCache();
    resetAllRateLimits();
  });

  describe('GET /catalog', () => {
    it('lists every listed handler and nothing else, in trend order, with the documented fields', async () => {
      const res = await call(catalogRoute.GET, '/api/v3/catalog', {});
      expect(res.status).toBe(200);
      expectApiHeaders(res);
      expect(res.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=3600');
      const body = expectContract(Catalog, await json(res));
      expect(body.items.map((h) => h.id)).toEqual([H.second, H.primary, H.banned, H.orphan]);
      expect(body.count).toBe(4);
      for (const item of body.items) expectContract(HandlerSummary, item);
      for (const id of HIDDEN_IDS) expect(body.items.map((h) => h.id)).not.toContain(id);

      const byId = Object.fromEntries(body.items.map((h) => [h.id, h]));
      expect(byId[H.primary]).toMatchObject({
        url: `${SITE}/hub/portal-2`,
        gameSlug: 'portal-2',
        authorId: 'apiOwner000000001',
        authorName: 'Fixture-Author',
        authorUrl: `${SITE}/hub/authors/Fixture-Author`,
        version: 2,
        verified: true,
        maxPlayers: 4,
        inputs: { controllers: true, keyboardMouse: true, multiKeyboardMouse: false },
        downloads: 100,
        stars: 3,
        comments: 4,
        coverImageId: 'co1rs4',
        igdbGameId: 72,
        genres: ['Puzzle', 'Shooter'],
        publishedAt: '2026-01-02T12:00:00.000Z',
      });
      // The primary handler of a game is the verified one, even with a lower trend.
      expect(byId[H.second]!.url).toBe(`${SITE}/hub/portal-2/${H.second}`);
      expect(byId[H.second]!.inputs).toEqual({
        controllers: true,
        keyboardMouse: null,
        multiKeyboardMouse: null,
      });
      // Suspended author: name kept, no profile link. Deleted author: anonymous.
      expect(byId[H.banned]).toMatchObject({ authorName: 'banned-author', authorUrl: null });
      expect(byId[H.orphan]).toMatchObject({ authorId: null, authorName: 'Deleted user', authorUrl: null });
    });

    it('answers 304 to a matching If-None-Match, and HEAD without a body', async () => {
      const first = await call(catalogRoute.GET, '/api/v3/catalog', {});
      const etag = first.headers.get('etag');
      expect(etag).toMatch(/^W\/"/);
      clearCache(); // a rebuilt payload keeps the same ETag while nothing changed
      const again = await call(
        catalogRoute.GET,
        '/api/v3/catalog',
        {},
        { headers: { 'If-None-Match': etag! } },
      );
      expect(again.status).toBe(304);
      expect(await again.text()).toBe('');
      expectApiHeaders(again);
      const head = await call(catalogRoute.GET, '/api/v3/catalog', {}, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
    });

    it('is rate limited per address (30 per 5 minutes) with Retry-After', async () => {
      for (let i = 0; i < 30; i++)
        expect((await call(catalogRoute.GET, '/api/v3/catalog', {})).status).toBe(200);
      const res = await call(catalogRoute.GET, '/api/v3/catalog', {});
      expect(res.status).toBe(429);
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
      expectApiHeaders(res);
      expect((await json(res)).error.code).toBe('rate_limited');
    });

    it('answers the CORS preflight', async () => {
      const res = catalogRoute.OPTIONS();
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
      expect(res.headers.get('access-control-allow-headers')).toContain('If-None-Match');
    });
  });

  describe('GET /handlers', () => {
    const search = async (qs: string) => {
      const res = await call(searchRoute.GET, `/api/v3/handlers${qs}`, {});
      expect(res.status, qs).toBe(200);
      return { res, body: expectContract(HandlerPage, await json(res)) };
    };
    const ids = async (qs: string) => (await search(qs)).body.items.map((h) => h.id);

    it('pages the listed handlers only', async () => {
      const { res, body } = await search('');
      expectApiHeaders(res);
      expect(res.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=300');
      expect(body).toMatchObject({ page: 1, pageSize: 24, total: 4 });
      expect(body.items.map((h) => h.id).sort()).toEqual([...LISTED_IDS].sort());
      const p2 = await search('?pageSize=1&page=2');
      expect(p2.body).toMatchObject({ page: 2, pageSize: 1, total: 4 });
      expect(p2.body.items.map((h) => h.id)).toEqual([H.primary]);
    });

    it('searches, filters and sorts like the catalogue page', async () => {
      expect((await ids('?q=portal')).sort()).toEqual([H.primary, H.second].sort());
      expect(await ids('?q=fixture-author')).toEqual([H.primary]);
      for (const q of ['private', 'unapproved', 'deleted', 'versionless', 'hidden']) {
        for (const id of await ids(`?q=${q}`)) expect(HIDDEN_IDS).not.toContain(id);
      }
      expect((await ids('?genre=puzzle')).sort()).toEqual([H.primary, H.second].sort());
      expect(await ids('?genre=no-such-genre')).toEqual([]);
      expect(await ids('?players=3-4')).toEqual([H.primary]);
      expect(await ids('?players=9%2B')).toEqual([H.orphan]);
      expect(await ids('?players=9+')).toEqual([H.orphan]); // "+" decoded as a space
      expect(await ids('?input=controllers&input=keyboardMouse')).toEqual([H.primary]);
      expect((await ids('?verified=true')).sort()).toEqual([H.primary, H.banned].sort());
      expect(await ids('?sort=az&pageSize=2')).toEqual([H.primary, H.second]);
      expect(await ids('?sort=downloads&pageSize=1')).toEqual([H.primary]);
    });

    it('rejects invalid parameters with the zod issues', async () => {
      for (const qs of [
        '?pageSize=0',
        '?pageSize=101',
        '?page=0',
        '?sort=random',
        '?players=7',
        '?verified=maybe',
        '?input=joystick',
        `?q=${'x'.repeat(101)}`,
      ]) {
        const res = await call(searchRoute.GET, `/api/v3/handlers${qs}`, {});
        expect(res.status, qs).toBe(400);
        const body = await json(res);
        expect(body.error.code).toBe('bad_request');
        expect(body.error.issues?.length).toBeGreaterThan(0);
        expectApiHeaders(res);
      }
    });
  });

  describe('GET /handlers/{id}', () => {
    it('returns the detail of a listed handler', async () => {
      const res = await call(handlerRoute.GET, `/api/v3/handlers/${H.primary}`, { id: H.primary });
      expect(res.status).toBe(200);
      expectApiHeaders(res);
      const body = expectContract(HandlerDetail, await json(res));
      expect(body).toMatchObject({
        id: H.primary,
        isPrimary: true,
        url: `${SITE}/hub/portal-2`,
        description: '# Notes\nUse **two** controllers.',
        gameDescription: 'A puzzle game.',
        igdbUrl: 'https://www.igdb.com/games/portal-2',
        steamAppId: 620,
        releaseYear: 2011,
      });
      expect(body.currentVersion).toMatchObject({
        id: V.primary2,
        version: 2,
        verified: true,
        releaseNotes: 'Release 2',
        downloads: 40,
        fileName: `handler-${H.primary}-v2.nc`,
        downloadUrl: `${SITE}/api/v3/handlers/${H.primary}/download?version=2`,
      });
      expect(body.screenshots).toEqual([
        {
          imageId: 'sc6lrw',
          width: 1920,
          height: 1080,
          url: 'https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc6lrw.jpg',
          thumbUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_med/sc6lrw.jpg',
        },
        expect.objectContaining({ imageId: 'sc6lrx', width: null, height: null }),
      ]);
      const second = HandlerDetail.parse(await (await call(handlerRoute.GET, '/x', { id: H.second })).json());
      expect(second).toMatchObject({
        isPrimary: false,
        url: `${SITE}/hub/portal-2/${H.second}`,
        verified: false,
      });
    });

    it('answers 404 for anything that is not listed, 400 for a malformed id', async () => {
      for (const id of [...HIDDEN_IDS, 'doesNotExist00001']) {
        const res = await call(handlerRoute.GET, `/api/v3/handlers/${id}`, { id });
        expect(res.status, id).toBe(404);
        expect((await json(res)).error).toEqual({ code: 'not_found', message: 'Handler not found' });
        expectApiHeaders(res);
      }
      for (const id of ['bad id', 'a'.repeat(65), 'x;drop']) {
        const res = await call(handlerRoute.GET, '/x', { id });
        expect(res.status, id).toBe(400);
      }
    });
  });

  describe('GET /handlers/{id}/versions and /script', () => {
    it('lists the versions newest first, without deleted ones', async () => {
      const res = await call(versionsRoute.GET, '/x', { id: H.primary });
      expect(res.status).toBe(200);
      const body = expectContract(VersionList, await json(res));
      expect(body.items.map((v) => v.version)).toEqual([2, 1]);
      expect(body.items[1]).toMatchObject({ id: V.primary1, verified: true, downloads: 60 });
      for (const id of HIDDEN_IDS) expect((await call(versionsRoute.GET, '/x', { id })).status).toBe(404);
    });

    it('serves a script as plain text that browsers never run', async () => {
      const res = await call(scriptRoute.GET, '/x', { id: H.primary, version: '2' });
      expect(res.status).toBe(200);
      expectApiHeaders(res);
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(res.headers.get('content-disposition')).toBe(`inline; filename="handler-${H.primary}-v2.js"`);
      expect(res.headers.get('content-security-policy')).toContain('sandbox');
      expect(await res.text()).toBe(SCRIPT_V2);
      const etag = res.headers.get('etag')!;
      const cached = await call(
        scriptRoute.GET,
        '/x',
        { id: H.primary, version: '2' },
        { headers: { 'If-None-Match': etag } },
      );
      expect(cached.status).toBe(304);

      expect((await call(scriptRoute.GET, '/x', { id: H.primary, version: '3' })).status).toBe(404); // deleted
      expect((await call(scriptRoute.GET, '/x', { id: H.primary, version: '9' })).status).toBe(404);
      expect((await call(scriptRoute.GET, '/x', { id: HIDDEN.private, version: '1' })).status).toBe(404);
      expect((await call(scriptRoute.GET, '/x', { id: H.primary, version: 'x' })).status).toBe(400);
      expect((await call(scriptRoute.GET, '/x', { id: H.primary, version: '0' })).status).toBe(400);
    });
  });

  describe('GET /handlers/{id}/comments', () => {
    it('returns visible comments newest first, replies flat, with a cursor', async () => {
      const res = await call(commentsRoute.GET, '/x', { id: H.primary });
      expect(res.status).toBe(200);
      const body = expectContract(CommentPage, await json(res));
      expect(body.items.map((c) => c.id)).toEqual([C.byDeletedUser, C.orphanReply, C.reply, C.root]);
      const byId = Object.fromEntries(body.items.map((c) => [c.id, c]));
      expect(byId[C.reply]).toMatchObject({
        parentId: C.root,
        authorName: 'Fixture-Author',
        body: 'Thanks!',
      });
      expect(byId[C.orphanReply]!.parentId).toBeNull(); // its root was removed
      expect(byId[C.byDeletedUser]).toMatchObject({ authorId: null, authorName: 'Deleted user' });
      expect(body.nextCursor).toBeNull();

      const first = CommentPage.parse(
        await (await call(commentsRoute.GET, '/x?limit=2', { id: H.primary })).json(),
      );
      expect(first.items.map((c) => c.id)).toEqual([C.byDeletedUser, C.orphanReply]);
      expect(first.nextCursor).not.toBeNull();
      const next = CommentPage.parse(
        await (
          await call(commentsRoute.GET, `/x?limit=2&before=${encodeURIComponent(first.nextCursor!)}`, {
            id: H.primary,
          })
        ).json(),
      );
      expect(next.items.map((c) => c.id)).toEqual([C.reply, C.root]);
    });

    it('answers 404 for hidden handlers and 400 for bad parameters', async () => {
      for (const id of HIDDEN_IDS) expect((await call(commentsRoute.GET, '/x', { id })).status).toBe(404);
      expect((await call(commentsRoute.GET, '/x?limit=0', { id: H.primary })).status).toBe(400);
      expect((await call(commentsRoute.GET, '/x?limit=201', { id: H.primary })).status).toBe(400);
      expect((await call(commentsRoute.GET, '/x?before=yesterday', { id: H.primary })).status).toBe(400);
    });
  });

  describe('GET /games/{slug}, /genres, /authors/{username}, /stats', () => {
    it('returns a game with its listed handlers, primary first', async () => {
      const res = await call(gameRoute.GET, '/x', { slug: 'portal-2' });
      expect(res.status).toBe(200);
      const game = expectContract(Game, await json(res));
      expect(game).toMatchObject({
        slug: 'portal-2',
        name: 'Portal 2',
        url: `${SITE}/hub/portal-2`,
        primaryHandlerId: H.primary,
        steamAppId: 620,
        releaseYear: 2011,
      });
      expect(game.handlers.map((h) => h.id)).toEqual([H.primary, H.second]);
      expect(game.handlers[0]!.url).toBe(`${SITE}/hub/portal-2`);
      expect(game.screenshots).toHaveLength(2);
    });

    it('redirects an old slug and hides games without a listed handler', async () => {
      const moved = await call(gameRoute.GET, '/x', { slug: 'portal-two' });
      expect(moved.status).toBe(308);
      expect(moved.headers.get('location')).toBe(`${SITE}/api/v3/games/portal-2`);
      expectApiHeaders(moved);
      expect((await call(gameRoute.GET, '/x', { slug: 'hidden-game' })).status).toBe(404);
      expect((await call(gameRoute.GET, '/x', { slug: 'no-such-game' })).status).toBe(404);
      expect((await call(gameRoute.GET, '/x', { slug: 'Bad Slug' })).status).toBe(400);
    });

    it('lists the genres of public games', async () => {
      const res = await call(genresRoute.GET, '/api/v3/genres', {});
      const body = expectContract(GenreList, await json(res));
      expect(body.items.map((g) => [g.name, g.count]).sort()).toEqual([
        ['Puzzle', 1],
        ['Racing', 1],
        ['Shooter', 1],
      ]);
      expect(body.items.find((g) => g.name === 'Puzzle')).toEqual({
        slug: 'puzzle',
        name: 'Puzzle',
        label: 'Puzzle',
        url: `${SITE}/hub/genres/puzzle`,
        count: 1,
      });
    });

    it('returns public authors only', async () => {
      const res = await call(authorRoute.GET, '/x', { username: 'fixture-author' });
      expect(res.status).toBe(200);
      const author = expectContract(Author, await json(res));
      expect(author).toMatchObject({ username: 'Fixture-Author', url: `${SITE}/hub/authors/Fixture-Author` });
      expect(author.handlers.map((h) => h.id)).toEqual([H.primary]);
      for (const username of ['banned-author', 'deleted-apiDel', 'nobody']) {
        expect((await call(authorRoute.GET, '/x', { username })).status, username).toBe(404);
      }
    });

    it('returns the hub counters', async () => {
      const res = await call(statsRoute.GET, '/api/v3/stats', {});
      const stats = expectContract(Stats, await json(res));
      expect(stats).toMatchObject({ publicHandlers: 4, games: 2, comments: 4, members: 4 });
      expect(res.headers.get('etag')).toBeTruthy();
    });
  });

  it('answers unknown API paths with a JSON 404', async () => {
    const res = await call(unknownRoute.GET, '/api/v3/nothing/here', { path: ['nothing', 'here'] });
    expect(res.status).toBe(404);
    expectApiHeaders(res);
    expect((await json(res)).error.code).toBe('not_found');
  });
});
