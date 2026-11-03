import { beforeEach, describe, expect, it } from 'vitest';
import * as newsRoute from '@/app/api/v3/news/route';
import * as openapiRoute from '@/app/api/v3/openapi.json/route';
import { getDb } from '@/db';
import { news, users } from '@/db/schema';
import { NewsItem, NewsList } from '@/lib/api/schemas/news';
import { resetAllRateLimits } from '@/lib/rate-limit';
import { clearCache } from '@/server/cache';
import { asViewer, makeUser } from '@/server/auth/test-fixtures';
import { setNewsPublished } from '@/server/private/news';
import { getLiveNews } from '@/server/public';
import { dbAvailable, truncateAll } from '@/test/db';
import { call, expectApiHeaders } from './fixtures';

/** GET /api/v3/news: the desktop app's announcements (synthetic rows only). */

const minutes = (n: number) => new Date(Date.now() + n * 60_000);
const AUTHOR = 'newsAuthor0000001';

let seq = 0;
async function insertNews(over: Partial<typeof news.$inferInsert> = {}) {
  const id = over.id ?? `news${String(++seq).padStart(13, '0')}`;
  await getDb()
    .insert(news)
    .values({
      id,
      message: `Announcement ${id}`,
      published: true,
      startsAt: minutes(-60),
      createdBy: AUTHOR,
      ...over,
    });
  return id;
}

async function getNews(headers: Record<string, string> = {}) {
  return call(newsRoute.GET, '/api/v3/news', {}, { headers });
}

async function items(): Promise<{ id: string }[]> {
  const res = await getNews();
  expect(res.status).toBe(200);
  return (await res.json()).items;
}

describe.runIf(dbAvailable())('API v3 news', () => {
  beforeEach(async () => {
    await truncateAll();
    clearCache();
    resetAllRateLimits();
    await getDb().insert(users).values({ id: AUTHOR, username: 'news-author', role: 'admin' });
  });

  it('answers an empty list (200) when nothing is live, with the API headers', async () => {
    await insertNews({ published: false });
    const res = await getNews();
    expect(res.status).toBe(200);
    expectApiHeaders(res);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(res.headers.get('etag')).toMatch(/^W\/"/);
    expect(await res.json()).toEqual({ items: [] });
  });

  it('serves only published, started and not ended items, with exactly the documented fields', async () => {
    const live = await insertNews({
      id: 'newsLiveItem00001',
      message: 'XInput is broken by a Windows 11 update, here is the fix',
      url: 'https://v3.splitscreen.me/doc/troubleshooting/controllers',
      severity: 'warning',
      startsAt: new Date('2026-01-05T10:00:00.000Z'),
      endsAt: minutes(60),
    });
    const noEnd = await insertNews({ startsAt: minutes(-1) });
    await insertNews({ id: 'newsDraft00000001', published: false });
    await insertNews({ id: 'newsScheduled0001', startsAt: minutes(30) });
    await insertNews({ id: 'newsExpired000001', startsAt: minutes(-120), endsAt: minutes(-1) });
    await insertNews({ id: 'newsDraftFuture01', published: false, startsAt: minutes(30) });

    const res = await getNews();
    const body = NewsList.parse(await res.json());
    expect(body.items.map((n) => n.id).sort()).toEqual([live, noEnd].sort());
    const item = body.items.find((n) => n.id === live)!;
    // No author, no draft flag, no creation date: only what the app shows.
    expect(Object.keys(item).sort()).toEqual(Object.keys(NewsItem.shape).sort());
    expect(item).toMatchObject({
      message: 'XInput is broken by a Windows 11 update, here is the fix',
      url: 'https://v3.splitscreen.me/doc/troubleshooting/controllers',
      severity: 'warning',
      startsAt: '2026-01-05T10:00:00.000Z',
    });
    expect(item.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(body.items.find((n) => n.id === noEnd)).toMatchObject({
      url: null,
      endsAt: null,
      severity: 'info',
    });
    expect(JSON.stringify(body)).not.toMatch(/newsAuthor|news-author|createdBy|published/);
  });

  it('orders critical, warning, info, then the latest start, and keeps at most 10', async () => {
    const info = [];
    for (let i = 1; i <= 9; i++) info.push(await insertNews({ severity: 'info', startsAt: minutes(-i) }));
    const oldCritical = await insertNews({ severity: 'critical', startsAt: minutes(-500) });
    const newCritical = await insertNews({ severity: 'critical', startsAt: minutes(-400) });
    const warning = await insertNews({ severity: 'warning', startsAt: minutes(-300) });

    const list = await items();
    expect(list).toHaveLength(10);
    // 12 live: the two oldest-starting infos are left out.
    expect(list.map((n) => n.id)).toEqual([newCritical, oldCritical, warning, ...info.slice(0, 7)]);
  });

  it('answers 304 to a matching If-None-Match, and a new ETag once the list changes', async () => {
    await insertNews();
    const first = await getNews();
    const etag = first.headers.get('etag')!;
    const again = await getNews({ 'If-None-Match': etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expectApiHeaders(again);
    expect(again.headers.get('cache-control')).toBe('public, max-age=60');

    clearCache();
    await insertNews({ severity: 'critical' });
    const changed = await getNews({ 'If-None-Match': etag });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
  });

  it('answers the CORS preflight and HEAD', async () => {
    const pre = newsRoute.OPTIONS();
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-headers')).toContain('If-None-Match');
    expect(pre.headers.get('access-control-expose-headers')).toContain('ETag');
    await insertNews();
    const head = await call(newsRoute.GET, '/api/v3/news', {}, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('shows a change made in the backoffice at once (the cache is invalidated)', async () => {
    const id = await insertNews({ published: false });
    expect(await items()).toEqual([]); // now cached
    const admin = asViewer(await makeUser({ role: 'admin' }));
    expect((await setNewsPublished(admin, id, true, '203.0.113.1')).ok).toBe(true);
    expect((await items()).map((n) => n.id)).toEqual([id]);
    expect((await setNewsPublished(admin, id, false, '203.0.113.1')).ok).toBe(true);
    expect(await items()).toEqual([]);
  });

  it('starts and ends items on time while their rows are cached', async () => {
    const soon = await insertNews({ startsAt: minutes(1) });
    const ending = await insertNews({ startsAt: minutes(-10), endsAt: minutes(1.5) });
    expect((await getLiveNews()).map((n) => n.id)).toEqual([ending]);
    // Same cached rows, two minutes later: the scheduled one is live, the other one ended.
    expect((await getLiveNews(minutes(2))).map((n) => n.id)).toEqual([soon]);
  });

  it('is documented in the OpenAPI document with its schema and an example', async () => {
    const res = await call(openapiRoute.GET, '/api/v3/openapi.json', {});
    const doc = await res.json();
    const op = doc.paths['/news'].get;
    expect(op).toMatchObject({ operationId: 'listNews', tags: ['News'] });
    expect(op.responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/NewsList',
    });
    expect(op.responses['200'].headers['Cache-Control'].description).toContain('public, max-age=60');
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['200', '304', '429', '500']));
    expect(doc.tags.map((t: { name: string }) => t.name)).toContain('News');
    const schemas = doc.components.schemas;
    expect(schemas.NewsItem.required.sort()).toEqual(Object.keys(NewsItem.shape).sort());
    expect(schemas.NewsItem.properties.severity.enum).toEqual(['info', 'warning', 'critical']);
    expect(NewsList.parse(schemas.NewsList.example).items).toHaveLength(1);
  });
});
