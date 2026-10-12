import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as downloadRoute from '@/app/api/v3/handlers/[id]/download/route';
import { getDb } from '@/db';
import { downloadDedup, handlerDownloadDays, handlerVersions, handlers } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { resetAllRateLimits } from '@/lib/rate-limit';
import { utcDay } from '@/lib/request';
import { clearCache } from '@/server/cache';
import { dedupKey, handlerDedupKey, parseRange, reprDigest, shouldCount } from '@/server/downloads';
import { dbAvailable, truncateAll } from '@/test/db';
import { call, day, expectApiHeaders, FILES, H, HIDDEN_IDS, seed, sha256, storageKey, V } from './fixtures';

const APP = 'NucleusCoop/3.0.0';

describe('download helpers', () => {
  it('counts whole GETs from clients only', () => {
    const base = { method: 'GET', count: true, range: null, userAgent: APP };
    expect(shouldCount(base)).toBe(true);
    expect(shouldCount({ ...base, method: 'HEAD' })).toBe(false);
    expect(shouldCount({ ...base, count: false })).toBe(false);
    expect(shouldCount({ ...base, range: 'bytes=0-' })).toBe(true);
    expect(shouldCount({ ...base, range: 'bytes=100-' })).toBe(false);
    for (const ua of [
      'Googlebot/2.1',
      'curl/8.4.0',
      'Wget/1.21',
      'Slackbot-LinkExpanding',
      'facebookexternalhit preview',
      'AhrefsBot',
      'my-spider',
    ]) {
      expect(shouldCount({ ...base, userAgent: ua }), ua).toBe(false);
    }
    expect(shouldCount({ ...base, userAgent: null })).toBe(true);
  });

  it('parses single byte ranges', () => {
    expect(parseRange(null, 10)).toBeNull();
    expect(parseRange('bytes=0-', 10)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
    expect(parseRange('bytes=2-50', 10)).toEqual({ start: 2, end: 9 });
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange('bytes=10-', 10)).toBeNull();
    expect(parseRange('bytes=5-2', 10)).toBeNull();
    expect(parseRange('bytes=0-1,4-5', 10)).toBeNull();
    expect(parseRange('items=0-1', 10)).toBeNull();
  });

  it('builds digests and day-scoped dedup keys without the address in clear', () => {
    expect(reprDigest('a'.repeat(64))).toBe(
      `sha-256=:${Buffer.from('a'.repeat(64), 'hex').toString('base64')}:`,
    );
    const k = dedupKey('1.2.3.4', H.primary, 2, '2026-01-01');
    expect(k).toMatch(/^[a-f0-9]{64}$/);
    expect(k).not.toContain('1.2.3.4');
    expect(dedupKey('1.2.3.4', H.primary, 2, '2026-01-02')).not.toBe(k);
    expect(dedupKey('1.2.3.4', H.primary, 1, '2026-01-01')).not.toBe(k);
    const hk = handlerDedupKey('1.2.3.4', H.primary, '2026-01-01');
    expect(hk).toMatch(/^[a-f0-9]{64}$/);
    expect(hk).not.toBe(k);
    expect(handlerDedupKey('1.2.3.4', H.primary, '2026-01-02')).not.toBe(hk);
  });
});

describe.runIf(dbAvailable())('GET /handlers/{id}/download', () => {
  const saved = {
    TRUST_PROXY: process.env.TRUST_PROXY,
    STORAGE_ACCEL_PREFIX: process.env.STORAGE_ACCEL_PREFIX,
  };

  beforeAll(async () => {
    process.env.TRUST_PROXY = '1';
    resetEnvCache();
    await truncateAll();
    await seed();
  });
  afterAll(() => {
    Object.assign(process.env, { TRUST_PROXY: saved.TRUST_PROXY ?? '' });
    if (saved.STORAGE_ACCEL_PREFIX === undefined) delete process.env.STORAGE_ACCEL_PREFIX;
    resetEnvCache();
  });
  beforeEach(() => {
    clearCache();
    resetAllRateLimits();
  });

  const get = (
    qs: string,
    ip: string,
    headers: Record<string, string> = {},
    method = 'GET',
    id: string = H.primary,
  ) =>
    call(
      downloadRoute.GET,
      `/api/v3/handlers/${id}/download${qs}`,
      { id },
      {
        method,
        headers: { 'X-Real-IP': ip, 'User-Agent': APP, ...headers },
      },
    );

  async function counters() {
    const db = getDb();
    const [h] = await db
      .select({ downloads: handlers.downloadCount, updatedAt: handlers.updatedAt })
      .from(handlers)
      .where(eq(handlers.id, H.primary));
    const versions = await db
      .select({ id: handlerVersions.id, downloads: handlerVersions.downloadCount })
      .from(handlerVersions)
      .where(eq(handlerVersions.handlerId, H.primary));
    const [d] = await db
      .select({ n: handlerDownloadDays.downloads })
      .from(handlerDownloadDays)
      .where(
        sql`${handlerDownloadDays.handlerId} = ${H.primary} and ${handlerDownloadDays.day} = ${utcDay()}`,
      );
    const [dedup] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(downloadDedup);
    const v = Object.fromEntries(versions.map((r) => [r.id, r.downloads]));
    return {
      handler: h!.downloads,
      updatedAt: h!.updatedAt,
      v1: v[V.primary1],
      v2: v[V.primary2],
      today: d?.n ?? 0,
      dedup: dedup!.n,
    };
  }

  it('serves the current package with its digests and counts it once per address and day', async () => {
    const before = await counters();
    expect(before).toMatchObject({ handler: 100, v2: 40, today: 0, dedup: 0 });

    const res = await get('', '10.0.0.1');
    expect(res.status).toBe(200);
    expectApiHeaders(res);
    const bytes = FILES[V.primary2]!;
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="handler-${H.primary}-v2.nc"`);
    expect(res.headers.get('content-length')).toBe(String(bytes.length));
    expect(res.headers.get('etag')).toBe(`"${sha256(bytes)}"`);
    expect(res.headers.get('repr-digest')).toBe(reprDigest(sha256(bytes)));
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    expect(res.headers.get('x-accel-redirect')).toBeNull();

    const after = await counters();
    // Two dedup rows: this version today, this handler today.
    expect(after).toMatchObject({ handler: 101, v2: 41, v1: before.v1, today: 1, dedup: 2 });
    expect(after.updatedAt).toEqual(day(5)); // a download is not an edit

    // Same address, same day: served, not counted. Another address: counted.
    expect((await get('', '10.0.0.1')).status).toBe(200);
    expect(await counters()).toMatchObject({ handler: 101, v2: 41, today: 1 });
    await (await get('', '10.0.0.2')).arrayBuffer();
    expect(await counters()).toMatchObject({ handler: 102, v2: 42, today: 2, dedup: 4 });
  });

  it('counts a handler once per address and day, whichever versions it asks for', async () => {
    const before = await counters();
    await (await get('?version=1', '10.0.5.1')).arrayBuffer();
    await (await get('?version=2', '10.0.5.1')).arrayBuffer();
    await (await get('', '10.0.5.1')).arrayBuffer();
    expect(await counters()).toMatchObject({
      handler: before.handler + 1,
      today: before.today + 1,
      v1: before.v1! + 1,
      v2: before.v2! + 1,
    });
  });

  it('does not count previews, HEAD, partial ranges, bots, scripts or revalidations', async () => {
    const before = await counters();
    expect((await get('?count=false', '10.0.1.1')).status).toBe(200);
    expect((await get('?count=0', '10.0.1.2')).status).toBe(200);
    expect((await get('', '10.0.1.3', { 'User-Agent': 'curl/8.4.0' })).status).toBe(200);
    expect(
      (await get('', '10.0.1.4', { 'User-Agent': 'Mozilla/5.0 (compatible; bingbot/2.0)' })).status,
    ).toBe(200);

    const head = await get('', '10.0.1.5', {}, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(FILES[V.primary2]!.length));
    expect(await head.text()).toBe('');

    const part = await get('', '10.0.1.6', { Range: 'bytes=3-6' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 3-6/${FILES[V.primary2]!.length}`);
    expect(Buffer.from(await part.arrayBuffer())).toEqual(FILES[V.primary2]!.subarray(3, 7));

    const etag = `"${sha256(FILES[V.primary2]!)}"`;
    const fresh = await get('', '10.0.1.7', { 'If-None-Match': etag });
    expect(fresh.status).toBe(304);
    expect(await fresh.text()).toBe('');

    expect(await counters()).toEqual(before);
  });

  it('serves and counts an older version, never a deleted one', async () => {
    const before = await counters();
    const res = await get('?version=1', '10.0.2.1');
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(FILES[V.primary1]!);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="handler-${H.primary}-v1.nc"`);
    expect(await counters()).toMatchObject({
      handler: before.handler + 1,
      v1: before.v1! + 1,
      v2: before.v2,
    });

    const deleted = await get('?version=3', '10.0.2.2');
    expect(deleted.status).toBe(404);
    expect((await deleted.json()).error.code).toBe('not_found');
    expect((await get('?version=99', '10.0.2.3')).status).toBe(404);
    expect((await get('?version=abc', '10.0.2.4')).status).toBe(400);
    expect((await get('?count=perhaps', '10.0.2.4')).status).toBe(400);
  });

  it('answers 404 for hidden handlers and missing files, without counting', async () => {
    const before = await counters();
    for (const id of HIDDEN_IDS) {
      const res = await get('', '10.0.3.1', {}, 'GET', id);
      expect(res.status, id).toBe(404);
      expectApiHeaders(res);
    }
    const missing = await get('', '10.0.3.2', {}, 'GET', H.banned); // version row without a file on disk
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.message).toBe('Package file not found');
    const [banned] = await getDb()
      .select({ n: handlers.downloadCount })
      .from(handlers)
      .where(eq(handlers.id, H.banned));
    expect(banned!.n).toBe(0);
    expect((await get('', '10.0.3.3', {}, 'GET', 'not valid!')).status).toBe(400);
    expect(await counters()).toEqual(before);
  });

  it('hands the file to nginx with X-Accel-Redirect when configured', async () => {
    process.env.STORAGE_ACCEL_PREFIX = '/_storage/';
    resetEnvCache();
    try {
      const res = await get('', '10.0.4.1');
      expect(res.status).toBe(200);
      expect(res.headers.get('x-accel-redirect')).toBe(`/_storage/${storageKey(H.primary, V.primary2)}`);
      expect(res.headers.get('content-disposition')).toBe(
        `attachment; filename="handler-${H.primary}-v2.nc"`,
      );
      expect(await res.text()).toBe('');
    } finally {
      delete process.env.STORAGE_ACCEL_PREFIX;
      resetEnvCache();
    }
  });

  it('is rate limited per address (60 per 10 minutes)', async () => {
    for (let i = 0; i < 60; i++) expect((await get('?count=false', '10.0.5.1', {}, 'HEAD')).status).toBe(200);
    const res = await get('?count=false', '10.0.5.1');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await get('?count=false', '10.0.5.2', {}, 'HEAD')).status).toBe(200); // other address
  });
});
