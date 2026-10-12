import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as reportsRoute from '@/app/api/v3/handlers/[id]/reports/route';
import { getDb } from '@/db';
import { auditLog, handlers, reports } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { resetAllRateLimits } from '@/lib/rate-limit';
import { clearCache } from '@/server/cache';
import { cleanMessage, reporterHash } from '@/server/reports';
import { dbAvailable, truncateAll } from '@/test/db';
import { call, day, expectApiHeaders, H, HIDDEN_IDS, seed } from './fixtures';

describe('report helpers', () => {
  it('cleans messages', () => {
    expect(cleanMessage(undefined)).toBeNull();
    expect(cleanMessage('   ')).toBeNull();
    expect(cleanMessage(' Crashes\u0000 on\u0007 start\n line 2 ')).toBe('Crashes on start\n line 2');
  });
});

describe.runIf(dbAvailable())('POST /handlers/{id}/reports', () => {
  const saved = process.env.TRUST_PROXY;
  beforeAll(async () => {
    process.env.TRUST_PROXY = '1';
    resetEnvCache();
    await truncateAll();
    await seed();
  });
  afterAll(() => {
    process.env.TRUST_PROXY = saved ?? '';
    resetEnvCache();
  });
  beforeEach(() => {
    clearCache();
    resetAllRateLimits();
  });

  const post = (body: unknown, ip: string, id: string = H.primary, headers: Record<string, string> = {}) =>
    call(
      reportsRoute.POST,
      `/api/v3/handlers/${id}/reports`,
      { id },
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip, ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      },
    );

  const rows = () => getDb().select().from(reports).orderBy(desc(reports.id));
  const openCount = async (id: string = H.primary) =>
    (await getDb().select({ n: handlers.openReportCount }).from(handlers).where(eq(handlers.id, id)))[0]!.n;

  it('stores an anonymous report, bumps the counter and audits it', async () => {
    const res = await post(
      { reason: 'broken', message: '  Crashes\u0000 on start  ', client: 'app' },
      '192.0.2.1',
    );
    expect(res.status).toBe(202);
    expectApiHeaders(res);
    expect(await res.json()).toEqual({ status: 'received' });

    const [r] = await rows();
    expect(r).toMatchObject({
      targetType: 'handler',
      handlerId: H.primary,
      commentId: null,
      version: null,
      reason: 'broken',
      message: 'Crashes on start',
      reporterId: null,
      reporterHash: reporterHash('192.0.2.1'),
      source: 'app',
      status: 'open',
    });
    expect(r!.reporterHash).not.toContain('192.0.2.1');
    expect(await openCount()).toBe(1);
    const [h] = await getDb()
      .select({ updatedAt: handlers.updatedAt })
      .from(handlers)
      .where(eq(handlers.id, H.primary));
    expect(h!.updatedAt).toEqual(day(5));

    const [a] = await getDb().select().from(auditLog).orderBy(desc(auditLog.id)).limit(1);
    expect(a).toMatchObject({
      action: 'report.create',
      actorId: null,
      targetType: 'report',
      targetId: String(r!.id),
    });
    expect(a!.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(a!.details)).not.toContain('192.0.2.1');
    expect(a!.details).toMatchObject({ handlerId: H.primary, reason: 'broken', source: 'app' });
  });

  it('answers a duplicate like a new report without storing it', async () => {
    const before = (await rows()).length;
    expect((await post({ reason: 'outdated' }, '192.0.2.1')).status).toBe(202);
    expect((await rows()).length).toBe(before);
    expect(await openCount()).toBe(1);
    // Another address, or another handler: stored.
    expect((await post({ reason: 'outdated' }, '192.0.2.2')).status).toBe(202);
    expect((await post({ reason: 'spam' }, '192.0.2.1', H.second)).status).toBe(202);
    expect((await rows()).length).toBe(before + 2);
    expect(await openCount()).toBe(2);
    expect((await rows())[1]!.source).toBe('api'); // default client
  });

  it('accepts an existing version and refuses others', async () => {
    expect((await post({ reason: 'broken', version: 1 }, '192.0.2.3')).status).toBe(202);
    expect((await rows())[0]!.version).toBe(1);
    for (const version of [3, 99]) {
      const res = await post({ reason: 'broken', version }, '192.0.2.4');
      expect(res.status, String(version)).toBe(400);
      expect((await res.json()).error.issues[0].path).toEqual(['version']);
    }
  });

  it('validates the body', async () => {
    const cases: [unknown, number][] = [
      [{ reason: 'bored' }, 400],
      [{}, 400],
      [{ reason: 'other', message: 'x'.repeat(1001) }, 400],
      [{ reason: 'other', version: 0 }, 400],
      [{ reason: 'other', client: 'bot' }, 400],
      ['{not json', 400],
      ['', 400],
      [{ reason: 'other', message: 'x'.repeat(4100) }, 413],
    ];
    for (const [body, status] of cases) {
      resetAllRateLimits();
      const res = await post(body, '192.0.2.5');
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(status);
      const error = (await res.json()).error;
      expect(error.code).toBe(status === 413 ? 'payload_too_large' : 'bad_request');
    }
    // A body streamed without Content-Length is cut at 4 KB too.
    const big = new TextEncoder().encode(JSON.stringify({ reason: 'other', message: 'y'.repeat(5000) }));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(big);
        c.close();
      },
    });
    const res = await call(
      reportsRoute.POST,
      '/x',
      { id: H.primary },
      { method: 'POST', headers: { 'X-Real-IP': '192.0.2.6' }, body: stream },
    );
    expect(res.status).toBe(413);
    // Any content type works (no preflight needed from a browser).
    expect(
      (await post({ reason: 'other' }, '192.0.2.7', H.primary, { 'Content-Type': 'text/plain' })).status,
    ).toBe(202);
  });

  it('answers 404 for hidden handlers and stores nothing', async () => {
    const before = (await rows()).length;
    for (const id of HIDDEN_IDS) {
      resetAllRateLimits();
      expect((await post({ reason: 'malware' }, '192.0.2.8', id)).status, id).toBe(404);
    }
    expect((await rows()).length).toBe(before);
  });

  it('is rate limited per address (5 per hour)', async () => {
    for (let i = 0; i < 5; i++) expect((await post({ reason: 'other' }, '192.0.2.9')).status).toBe(202);
    const res = await post({ reason: 'other' }, '192.0.2.9');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(3000);
  });

  it('answers the CORS preflight for POST', () => {
    const res = reportsRoute.OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });
});
