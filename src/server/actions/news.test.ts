import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { auditLog, news } from '@/db/schema';
import type { CurrentUser } from '@/lib/auth/current-user';
import { resetAllRateLimits } from '@/lib/rate-limit';
import { asViewer, makeUser } from '@/server/auth/test-fixtures';
import { dbAvailable, truncateAll } from '@/test/db';
import { IDLE } from './types';

/**
 * The backoffice news actions refuse anyone but an admin before touching anything. The session, the
 * request and Next's navigation helpers are replaced; the services and the database are real.
 */

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: async () => session.user,
  hasRole: (user: { role: string } | null, role: string) => {
    const rank: Record<string, number> = { user: 0, moderator: 1, admin: 2 };
    return !!user && rank[user.role]! >= rank[role]!;
  },
}));
vi.mock('@/server/auth/request-context', () => ({ requestIp: async () => '203.0.113.9' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error('notFound');
  },
}));

const { createNewsAction, deleteNewsAction, publishNewsAction, updateNewsAction } = await import('./admin');

function fd(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

const FORM = {
  message: 'XInput is broken by a Windows 11 update, here is the fix',
  url: 'https://v3.splitscreen.me/doc/troubleshooting/controllers',
  severity: 'warning',
  startsAt: '',
  endsAt: '',
};

async function signIn(role: 'user' | 'moderator' | 'admin' | null) {
  session.user = role ? asViewer(await makeUser({ role })) : null;
}

describe.runIf(dbAvailable())('news server actions', () => {
  beforeEach(async () => {
    await truncateAll();
    resetAllRateLimits();
    session.user = null;
  });

  it.each([null, 'user', 'moderator'] as const)('refuses every news action to %s', async (role) => {
    await getDb().insert(news).values({ id: 'newsExisting00001', message: 'Existing', published: true });
    await signIn(role);
    const denied = { status: 'error', message: 'You are not allowed to do this.' };
    expect(await createNewsAction(IDLE, fd({ ...FORM, intent: 'publish' }))).toMatchObject(denied);
    expect(
      await updateNewsAction('newsExisting00001', IDLE, fd({ ...FORM, message: 'Hijacked' })),
    ).toMatchObject(denied);
    expect(await publishNewsAction('newsExisting00001', false, IDLE)).toMatchObject(denied);
    expect(await deleteNewsAction('newsExisting00001', IDLE)).toMatchObject(denied);
    expect(await getDb().select().from(news)).toMatchObject([
      { id: 'newsExisting00001', message: 'Existing', published: true },
    ]);
    expect(await getDb().select().from(auditLog)).toHaveLength(0);
  });

  it('lets an admin create, edit, unpublish and delete, with inline field errors', async () => {
    await signIn('admin');
    const invalid = await createNewsAction(
      IDLE,
      fd({
        ...FORM,
        message: ' ',
        url: 'javascript:alert(1)',
        startsAt: '2026-11-03T10:00',
        endsAt: '2026-11-03T09:00',
      }),
    );
    // Every field error comes back at once, the window check included.
    expect(invalid).toMatchObject({
      status: 'error',
      fields: {
        message: ['Write the message.'],
        url: ['Only http:// and https:// links.'],
        endsAt: ['Must be after the start.'],
      },
    });
    expect(await getDb().select().from(news)).toHaveLength(0);

    await expect(createNewsAction(IDLE, fd({ ...FORM, intent: 'publish' }))).rejects.toThrow(
      'redirect:/admin/news?created=live',
    );
    await expect(createNewsAction(IDLE, fd({ ...FORM, intent: 'draft' }))).rejects.toThrow(
      'redirect:/admin/news?created=draft',
    );
    const rows = await getDb().select().from(news);
    expect(rows.map((r) => r.published).sort()).toEqual([false, true]);
    const live = rows.find((r) => r.published)!;
    expect(live).toMatchObject({ createdBy: session.user!.id, severity: 'warning', url: FORM.url });

    const tooEarly = await updateNewsAction(
      live.id,
      IDLE,
      fd({ ...FORM, startsAt: '2026-11-03T10:00', endsAt: '2026-11-03T10:00' }),
    );
    expect(tooEarly).toMatchObject({ status: 'error', fields: { endsAt: ['Must be after the start.'] } });
    expect(await updateNewsAction(live.id, IDLE, fd({ ...FORM, message: 'Fixed in beta 7' }))).toMatchObject({
      status: 'ok',
      message: 'Saved. It is live: the app shows it within a minute.',
    });
    expect(await publishNewsAction(live.id, false, IDLE)).toMatchObject({ status: 'ok' });
    await expect(deleteNewsAction(live.id, IDLE)).rejects.toThrow('redirect:/admin/news?deleted=1');
    expect(await getDb().select().from(news)).toHaveLength(1);
    expect(await publishNewsAction('not a valid id!', true, IDLE)).toMatchObject({ status: 'error' });

    const actions = (await getDb().select().from(auditLog).orderBy(auditLog.id)).map((a) => a.action);
    expect(actions).toEqual(['news.create', 'news.create', 'news.update', 'news.unpublish', 'news.delete']);
  });
});
