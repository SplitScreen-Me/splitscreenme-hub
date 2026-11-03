import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db';
import { auditLog, news, users } from '@/db/schema';
import { can } from '@/lib/auth/permissions';
import { resetAllRateLimits } from '@/lib/rate-limit';
import { asViewer, makeUser } from '@/server/auth/test-fixtures';
import { dbAvailable, truncateAll } from '@/test/db';
import {
  createNews,
  deleteNews,
  getNewsForAdmin,
  listNewsForAdmin,
  parseNewsInput,
  setNewsPublished,
  updateNews,
} from './news';

const NOW = new Date('2026-11-03T12:34:56.789Z');
const form = (over: Record<string, string> = {}) => ({
  message: 'XInput is broken by a Windows 11 update, here is the fix',
  url: '',
  severity: 'warning',
  startsAt: '',
  endsAt: '',
  ...over,
});
const fieldsOf = (r: ReturnType<typeof parseNewsInput>) => (r.ok ? {} : (r.fields ?? {}));

describe('news form validation', () => {
  it('accepts a minimal message and starts it now, to the minute', () => {
    const r = parseNewsInput(form(), { now: NOW });
    expect(r).toEqual({
      ok: true,
      value: {
        message: 'XInput is broken by a Windows 11 update, here is the fix',
        url: null,
        severity: 'warning',
        startsAt: new Date('2026-11-03T12:34:00.000Z'),
        endsAt: null,
      },
    });
  });

  it('collapses line breaks before checking the length (1 to 500 characters)', () => {
    const r = parseNewsInput(form({ message: '  First line\r\nsecond line\n\nthird  ' }), { now: NOW });
    expect(r.ok && r.value.message).toBe('First line second line third');
    expect(fieldsOf(parseNewsInput(form({ message: ' \n \t ' })))).toHaveProperty('message');
    expect(parseNewsInput(form({ message: 'x'.repeat(500) })).ok).toBe(true);
    expect(fieldsOf(parseNewsInput(form({ message: 'x'.repeat(501) })))).toHaveProperty('message');
    // 499 characters plus line breaks that become one space: 500, accepted.
    expect(parseNewsInput(form({ message: `${'x'.repeat(250)}\r\n\r\n${'y'.repeat(249)}` })).ok).toBe(true);
  });

  it('accepts only http(s) links up to 2048 characters', () => {
    const ok = parseNewsInput(form({ url: ' https://v3.splitscreen.me/doc/faq ' }));
    expect(ok.ok && ok.value.url).toBe('https://v3.splitscreen.me/doc/faq');
    for (const url of ['javascript:alert(1)', 'ftp://example.com', 'data:text/plain,hi', '/doc/faq']) {
      expect(fieldsOf(parseNewsInput(form({ url }))), url).toHaveProperty('url');
    }
    expect(fieldsOf(parseNewsInput(form({ url: `https://example.com/${'a'.repeat(2100)}` })))).toHaveProperty(
      'url',
    );
  });

  it('requires the end after the start, and real dates', () => {
    const later = parseNewsInput(form({ startsAt: '2026-11-03T09:00', endsAt: '2026-11-04T09:00' }));
    expect(later.ok && later.value).toMatchObject({
      startsAt: new Date('2026-11-03T09:00:00.000Z'),
      endsAt: new Date('2026-11-04T09:00:00.000Z'),
    });
    const same = parseNewsInput(form({ startsAt: '2026-11-03T09:00', endsAt: '2026-11-03T09:00' }));
    expect(same).toMatchObject({ ok: false, fields: { endsAt: ['Must be after the start.'] } });
    expect(
      fieldsOf(parseNewsInput(form({ startsAt: '2026-11-03T09:00', endsAt: '2026-11-03T08:59' }))),
    ).toEqual({
      endsAt: ['Must be after the start.'],
    });
    // An empty start is now: an end in the past is refused.
    expect(fieldsOf(parseNewsInput(form({ endsAt: '2026-11-03T12:00' }), { now: NOW }))).toHaveProperty(
      'endsAt',
    );
    expect(fieldsOf(parseNewsInput(form({ startsAt: '2026-02-30T09:00' })))).toHaveProperty('startsAt');
    expect(fieldsOf(parseNewsInput(form({ endsAt: 'next week' })))).toHaveProperty('endsAt');
    expect(fieldsOf(parseNewsInput(form({ severity: 'urgent' })))).toHaveProperty('severity');
  });

  it('keeps the stored start (seconds included) when the form leaves it at its minute', () => {
    const stored = new Date('2026-11-03T09:00:42.123Z');
    const kept = parseNewsInput(form({ startsAt: '2026-11-03T09:00' }), { currentStartsAt: stored });
    expect(kept.ok && kept.value.startsAt).toEqual(stored);
    const moved = parseNewsInput(form({ startsAt: '2026-11-03T09:01' }), { currentStartsAt: stored });
    expect(moved.ok && moved.value.startsAt).toEqual(new Date('2026-11-03T09:01:00.000Z'));
  });
});

describe('news permission', () => {
  it('is for admins only', () => {
    expect(can(null, 'news.manage')).toBe(false);
    expect(can({ id: 'u', role: 'user' }, 'news.manage')).toBe(false);
    expect(can({ id: 'm', role: 'moderator' }, 'news.manage')).toBe(false);
    expect(can({ id: 'a', role: 'admin' }, 'news.manage')).toBe(true);
  });
});

describe.runIf(dbAvailable())('news backoffice services', () => {
  beforeEach(async () => {
    await truncateAll();
    resetAllRateLimits();
  });

  it('refuses users and moderators everything, and writes nothing', async () => {
    const admin = asViewer(await makeUser({ role: 'admin' }));
    const created = await createNews(admin, form(), true, '1');
    const id = created.ok ? created.value.id : '';
    for (const role of ['user', 'moderator'] as const) {
      const someone = asViewer(await makeUser({ role }));
      expect(await createNews(someone, form(), true, '1')).toMatchObject({ ok: false });
      expect(await updateNews(someone, id, form({ message: 'hijacked' }), '1')).toMatchObject({ ok: false });
      expect(await setNewsPublished(someone, id, false, '1')).toMatchObject({ ok: false });
      expect(await deleteNews(someone, id, '1')).toMatchObject({ ok: false });
    }
    const rows = await getDb().select().from(news);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ message: form().message, published: true });
    expect((await getDb().select().from(auditLog)).map((a) => a.action)).toEqual(['news.create']);
  });

  it('creates, edits, publishes, unpublishes and deletes with audit entries', async () => {
    const admin = asViewer(await makeUser({ role: 'admin', username: 'news-admin' }));
    const created = await createNews(admin, form({ endsAt: '2999-01-01T00:00' }), false, '1');
    expect(created).toMatchObject({ ok: true, value: { status: 'draft' } });
    const id = created.ok ? created.value.id : '';
    expect(id).toMatch(/^[A-Za-z0-9]{17}$/);
    let row = await getNewsForAdmin(id);
    expect(row).toMatchObject({ status: 'draft', authorId: admin.id, authorName: 'news-admin', url: null });

    // Invalid input changes nothing.
    const bad = await updateNews(admin, id, form({ url: 'javascript:alert(1)' }), '1');
    expect(bad).toMatchObject({ ok: false, fields: { url: expect.any(Array) } });

    const edited = await updateNews(
      admin,
      id,
      form({
        message: 'Fixed in 3.0 beta 7',
        url: 'https://v3.splitscreen.me/download',
        severity: 'info',
        startsAt: '2026-01-01T00:00',
        endsAt: '2999-01-01T00:00',
      }),
      '1',
    );
    expect(edited).toEqual({ ok: true, value: { status: 'draft' } });
    // Saving the same values again is not a change.
    expect(
      await updateNews(
        admin,
        id,
        form({
          message: 'Fixed in 3.0 beta 7',
          url: 'https://v3.splitscreen.me/download',
          severity: 'info',
          startsAt: '2026-01-01T00:00',
          endsAt: '2999-01-01T00:00',
        }),
        '1',
      ),
    ).toEqual({ ok: true, value: { status: 'draft' } });
    expect(await setNewsPublished(admin, id, true, '1')).toEqual({ ok: true, value: { status: 'live' } });
    expect(await setNewsPublished(admin, id, true, '1')).toEqual({ ok: true, value: { status: 'live' } });
    row = await getNewsForAdmin(id);
    expect(row).toMatchObject({ status: 'live', severity: 'info', message: 'Fixed in 3.0 beta 7' });
    expect((await listNewsForAdmin()).map((n) => n.id)).toEqual([id]);
    expect(await setNewsPublished(admin, id, false, '1')).toEqual({ ok: true, value: { status: 'draft' } });
    expect(await deleteNews(admin, id, '1')).toEqual({ ok: true, value: undefined });
    expect(await getNewsForAdmin(id)).toBeNull();
    expect(await deleteNews(admin, id, '1')).toMatchObject({ ok: false });

    const log = await getDb().select().from(auditLog).orderBy(auditLog.id);
    expect(log.map((a) => a.action)).toEqual([
      'news.create',
      'news.update',
      'news.publish',
      'news.unpublish',
      'news.delete',
    ]);
    expect(log.every((a) => a.targetType === 'news' && a.targetId === id && a.actorId === admin.id)).toBe(
      true,
    );
    expect(log[1]?.details).toEqual({
      fields: ['message', 'url', 'severity', 'startsAt'],
      message: 'Fixed in 3.0 beta 7',
    });
    expect(log[4]?.details).toMatchObject({ message: 'Fixed in 3.0 beta 7', wasPublished: false });
  });

  it('lists live first (in the app order), then scheduled, drafts and expired', async () => {
    const admin = asViewer(await makeUser({ role: 'admin' }));
    const make = async (over: Record<string, string>, publish = true) => {
      const r = await createNews(admin, form(over), publish, '1');
      return r.ok ? r.value.id : '';
    };
    const expired = await make({ startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00' });
    const draft = await make({}, false);
    const scheduled = await make({ startsAt: '2999-01-01T00:00' });
    const info = await make({ severity: 'info' });
    const critical = await make({ severity: 'critical', startsAt: '2026-01-01T00:00' });
    expect((await listNewsForAdmin()).map((n) => [n.id, n.status])).toEqual([
      [critical, 'live'],
      [info, 'live'],
      [scheduled, 'scheduled'],
      [draft, 'draft'],
      [expired, 'expired'],
    ]);
  });

  it('keeps an announcement when its author account is deleted', async () => {
    const admin = await makeUser({ role: 'admin' });
    const created = await createNews(asViewer(admin), form(), true, '1');
    await getDb().delete(users).where(eq(users.id, admin.id));
    const row = await getNewsForAdmin(created.ok ? created.value.id : '');
    expect(row).toMatchObject({ authorId: null, authorName: null, status: 'live' });
  });

  it('backs the rules up with database constraints', async () => {
    const insert = (over: Partial<typeof news.$inferInsert>) =>
      getDb()
        .insert(news)
        .values({ id: `c${Math.random().toString(36).slice(2, 12)}`, message: 'ok', ...over });
    await expect(insert({ message: 'two\nlines' })).rejects.toThrow();
    await expect(insert({ message: '' })).rejects.toThrow();
    await expect(insert({ message: 'x'.repeat(501) })).rejects.toThrow();
    await expect(insert({ url: 'javascript:alert(1)' })).rejects.toThrow();
    await expect(insert({ url: `https://e.com/${'a'.repeat(2048)}` })).rejects.toThrow();
    await expect(
      insert({ startsAt: new Date('2026-01-02T00:00:00Z'), endsAt: new Date('2026-01-01T00:00:00Z') }),
    ).rejects.toThrow();
    await expect(insert({ url: 'https://ok.example/' })).resolves.toBeDefined();
  });
});
