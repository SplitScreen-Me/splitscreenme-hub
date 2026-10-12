import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { writeFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db';
import { auditLog, comments, handlerVersions, handlers, reports, sessions, users } from '@/db/schema';
import { createSession } from '@/lib/auth/session';
import { resetAllRateLimits } from '@/lib/rate-limit';
import { absolutePath, tempPath } from '@/lib/storage';
import { dbAvailable, truncateAll } from '@/test/db';
import { asViewer, makeHandler, makeUser } from '@/server/auth/test-fixtures';
import { processUpload } from '@/server/packages/upload';
import { buildZip, VALID_SCRIPT } from '@/server/packages/test-zip';
import { inspectPackage } from '@/server/packages/zip';
import { deleteComment, editComment, postComment, restoreComment, toggleStar } from './community';
import { getHandlerForEdit, listMyHandlers } from './dashboard';
import {
  createHandler,
  parseHandlerMeta,
  setHandlerPublic,
  softDeleteHandler,
  updateHandlerMeta,
} from './handlers';
import { changeRole, closeReports, setBan, setHandlerApproval, setVersionVerified } from './moderation';

const meta = (over: Record<string, unknown> = {}) => {
  const r = parseHandlerMeta({
    title: 'My handler',
    description: 'Steps',
    maxPlayers: '4',
    controllers: 'yes',
    keyboardMouse: 'unknown',
    multiKeyboardMouse: 'no',
    ...over,
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe.runIf(dbAvailable())('comments and stars', () => {
  beforeEach(async () => {
    await truncateAll();
    resetAllRateLimits();
  });

  it('posts, replies on the root, edits and deletes own comments with counters', async () => {
    const author = await makeUser();
    const h = await makeHandler(author.id);
    const viewer = asViewer(await makeUser());
    const root = await postComment(viewer, { handlerId: h.id, body: '  First!  ' }, Date.now());
    expect(root.ok).toBe(true);
    const rootId = root.ok ? root.value.id : '';
    const reply = await postComment(viewer, { parentId: rootId, body: 'reply' }, Date.now() + 6_000);
    const replyId = reply.ok ? reply.value.id : '';
    // A reply to a reply hangs on the root.
    const nested = await postComment(viewer, { parentId: replyId, body: 'nested' }, Date.now() + 12_000);
    expect(nested.ok).toBe(true);
    const [n] = await getDb()
      .select()
      .from(comments)
      .where(eq(comments.id, nested.ok ? nested.value.id : ''));
    expect(n?.parentId).toBe(rootId);
    let [hh] = await getDb().select().from(handlers).where(eq(handlers.id, h.id));
    expect(hh?.commentCount).toBe(3);

    resetAllRateLimits();
    expect((await editComment(viewer, rootId, 'Edited text')).ok).toBe(true);
    const [edited] = await getDb().select().from(comments).where(eq(comments.id, rootId));
    expect(edited?.body).toBe('Edited text');
    expect(edited?.editedAt).not.toBeNull();
    // Someone else cannot edit or delete it.
    const stranger = asViewer(await makeUser());
    expect((await editComment(stranger, rootId, 'hijack')).ok).toBe(false);
    expect((await deleteComment(stranger, rootId, null, '1.1.1.1')).ok).toBe(false);

    expect((await deleteComment(viewer, rootId, null, '1.1.1.1')).ok).toBe(true);
    [hh] = await getDb().select().from(handlers).where(eq(handlers.id, h.id));
    expect(hh?.commentCount).toBe(2);
    // The author deleted it: a moderator cannot restore it.
    const mod = asViewer(await makeUser({ role: 'moderator' }));
    expect((await restoreComment(mod, rootId, '1.1.1.1')).ok).toBe(false);
  });

  it('rate-limits: one comment per 5 s, 5 a day for accounts younger than 24 h', async () => {
    const author = await makeUser();
    const h = await makeHandler(author.id);
    const young = asViewer(await makeUser({ createdAt: new Date() }));
    const t0 = Date.now();
    expect((await postComment(young, { handlerId: h.id, body: 'one' }, t0)).ok).toBe(true);
    const burst = await postComment(young, { handlerId: h.id, body: 'two' }, t0 + 1000);
    expect(!burst.ok && burst.retryAfter).toBeGreaterThan(0);
    for (let i = 1; i < 5; i++)
      expect((await postComment(young, { handlerId: h.id, body: `n${i}` }, t0 + i * 6000)).ok).toBe(true);
    expect((await postComment(young, { handlerId: h.id, body: 'sixth' }, t0 + 60_000)).ok).toBe(false);
  });

  it('requires a proven address or an OAuth identity, and a listed handler', async () => {
    const author = await makeUser();
    const h = await makeHandler(author.id);
    const hidden = await makeHandler(author.id, { isPublic: false });
    const unproven = asViewer(await makeUser({ emailVerifiedAt: null }));
    expect((await postComment(unproven, { handlerId: h.id, body: 'hello' })).ok).toBe(false);
    expect((await postComment({ ...unproven, hasOAuth: true }, { handlerId: h.id, body: 'hello' })).ok).toBe(
      true,
    );
    const ok = asViewer(await makeUser());
    expect((await postComment(ok, { handlerId: hidden.id, body: 'hello' })).ok).toBe(false);
  });

  it('moderators hide and restore with an audit trail', async () => {
    const author = await makeUser();
    const h = await makeHandler(author.id);
    const viewer = asViewer(await makeUser());
    const c = await postComment(viewer, { handlerId: h.id, body: 'rude words' });
    const id = c.ok ? c.value.id : '';
    const mod = asViewer(await makeUser({ role: 'moderator' }));
    expect((await deleteComment(mod, id, 'insults', '1.1.1.1')).ok).toBe(true);
    expect((await restoreComment(mod, id, '1.1.1.1')).ok).toBe(true);
    const actions = (await getDb().select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['comment.delete', 'comment.restore']));
  });

  it('toggles a star once per user', async () => {
    const author = await makeUser();
    const h = await makeHandler(author.id);
    const viewer = asViewer(await makeUser());
    expect(await toggleStar(viewer, h.id)).toEqual({ ok: true, value: { starred: true, count: 1 } });
    expect(await toggleStar(viewer, h.id, true)).toEqual({ ok: true, value: { starred: true, count: 1 } });
    expect(await toggleStar(viewer, h.id)).toEqual({ ok: true, value: { starred: false, count: 0 } });
  });
});

describe.runIf(dbAvailable())('dashboard and upload', () => {
  beforeEach(async () => {
    await truncateAll();
    resetAllRateLimits();
  });

  it('creates a draft, refuses to publish it, uploads a stamped version, then publishes', async () => {
    const owner = asViewer(await makeUser({ username: 'maker' }));
    const game = (await makeHandler(owner.id)).gameId;
    const created = await createHandler(
      { ...owner, trustedAuthor: false },
      { gameId: game, meta: meta(), ip: '1.1.1.1' },
    );
    expect(created.ok).toBe(true);
    const id = created.ok ? created.value.id : '';
    expect((await setHandlerPublic(owner, id, true, '1.1.1.1')).ok).toBe(false);

    const tmp = await tempPath();
    await writeFile(
      tmp,
      buildZip([
        { name: 'handler.js', data: VALID_SCRIPT },
        { name: 'bin/tool.exe', data: 'MZ' },
      ]),
    );
    const outcome = await processUpload({
      actor: owner,
      handlerId: id,
      tempFile: tmp,
      releaseNotes: 'First',
      ip: '1.1.1.1',
    });
    expect(outcome.version).toBe(1);
    expect(outcome.executables).toBe(1);
    const [v] = await getDb().select().from(handlerVersions).where(eq(handlerVersions.id, outcome.versionId));
    expect(v?.script).toContain(`Hub.Handler.Id = "${id}";`);
    expect(v?.script).toContain('Hub.Maintainer.Name = "maker";');
    expect(v?.verifiedAt).toBeNull();
    const stored = await readFile(absolutePath(v!.storageKey));
    expect(stored.length).toBe(v!.sizeBytes);
    expect((await inspectPackage(absolutePath(v!.storageKey))).script).toContain('Hub.Handler.Version = 1;');
    await expect(readFile(tmp)).rejects.toThrow(); // temp removed

    expect((await setHandlerPublic(owner, id, true, '1.1.1.1')).ok).toBe(true);
    const mine = await listMyHandlers(owner.id);
    expect(mine.find((h) => h.id === id)?.state).toBe('awaiting_approval');

    // A second upload is version 2.
    const tmp2 = await tempPath();
    await writeFile(tmp2, buildZip([{ name: 'handler.js', data: VALID_SCRIPT }]));
    expect(
      (await processUpload({ actor: owner, handlerId: id, tempFile: tmp2, releaseNotes: 'Second', ip: '1' }))
        .version,
    ).toBe(2);
  });

  it('refuses uploads and edits by strangers; moderators may', async () => {
    const owner = asViewer(await makeUser());
    const h = await makeHandler(owner.id);
    const stranger = asViewer(await makeUser());
    const tmp = await tempPath();
    await writeFile(tmp, buildZip([{ name: 'handler.js', data: VALID_SCRIPT }]));
    await expect(
      processUpload({ actor: stranger, handlerId: h.id, tempFile: tmp, releaseNotes: 'x', ip: '1' }),
    ).rejects.toMatchObject({ code: 'missing_handler' });
    expect((await updateHandlerMeta(stranger, h.id, meta(), '1')).ok).toBe(false);
    expect(await getHandlerForEdit(stranger, h.id)).toBeNull();
    const mod = asViewer(await makeUser({ role: 'moderator' }));
    expect((await updateHandlerMeta(mod, h.id, meta({ title: 'Fixed by mod' }), '1')).ok).toBe(true);
    expect((await softDeleteHandler(stranger, h.id, '1')).ok).toBe(false);
    expect((await softDeleteHandler(owner, h.id, '1')).ok).toBe(true);
  });

  it('auto-approves handlers of trusted authors', async () => {
    const owner = asViewer(await makeUser({ trustedAuthor: true }));
    const game = (await makeHandler(owner.id)).gameId;
    const created = await createHandler(
      { ...owner, trustedAuthor: true },
      { gameId: game, meta: meta(), ip: '1' },
    );
    const [row] = await getDb()
      .select()
      .from(handlers)
      .where(eq(handlers.id, created.ok ? created.value.id : ''));
    expect(row?.approvedAt).not.toBeNull();
  });
});

describe.runIf(dbAvailable())('moderation', () => {
  beforeEach(async () => {
    await truncateAll();
    resetAllRateLimits();
  });

  it('approves, revokes and verifies with audit entries', async () => {
    const owner = await makeUser();
    const h = await makeHandler(owner.id, { approvedAt: null });
    const mod = asViewer(await makeUser({ role: 'moderator' }));
    const user = asViewer(await makeUser());
    expect((await setHandlerApproval(user, h.id, true, '1')).ok).toBe(false);
    expect((await setHandlerApproval(mod, h.id, true, '1')).ok).toBe(true);
    expect((await setVersionVerified(mod, h.versionId, true, '1')).ok).toBe(true);
    expect((await setHandlerApproval(mod, h.id, false, '1', 'malware suspicion')).ok).toBe(true);
    const actions = (await getDb().select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['handler.approve', 'version.verify', 'handler.revoke']));
  });

  it('protects the last admin and forbids self-bans; role changes drop sessions', async () => {
    const admin = asViewer(await makeUser({ role: 'admin' }));
    const other = await makeUser();
    expect((await changeRole(admin, admin.id, 'user', '1')).ok).toBe(false);
    expect((await setBan(admin, admin.id, true, {}, '1')).ok).toBe(false);
    await createSession(other.id, null);
    expect((await changeRole(admin, other.id, 'admin', '1')).ok).toBe(true);
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, other.id))).toHaveLength(0);
    // Two admins now: the other one can be demoted, then admin is the last one again.
    expect((await changeRole(admin, other.id, 'user', '1')).ok).toBe(true);
    const mod = asViewer(await makeUser({ role: 'moderator' }));
    expect((await changeRole(mod, other.id, 'moderator', '1')).ok).toBe(false);
  });

  it('bans with optional unpublishing', async () => {
    const admin = asViewer(await makeUser({ role: 'admin' }));
    const bad = await makeUser();
    await makeHandler(bad.id);
    await createSession(bad.id, null);
    const res = await setBan(admin, bad.id, true, { reason: 'spam', unpublishHandlers: true }, '1');
    expect(res).toEqual({ ok: true, value: { unpublished: 1 } });
    const [u] = await getDb().select().from(users).where(eq(users.id, bad.id));
    expect(u?.bannedAt).not.toBeNull();
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, bad.id))).toHaveLength(0);
  });

  it('closes reports and recounts the handler counter', async () => {
    const owner = await makeUser();
    const h = await makeHandler(owner.id);
    const [r1, r2] = await getDb()
      .insert(reports)
      .values([
        { targetType: 'handler', handlerId: h.id, reason: 'broken', source: 'web' },
        { targetType: 'handler', handlerId: h.id, reason: 'outdated', source: 'web' },
      ])
      .returning();
    await getDb().update(handlers).set({ openReportCount: 2 }).where(eq(handlers.id, h.id));
    const mod = asViewer(await makeUser({ role: 'moderator' }));
    expect(await closeReports(mod, [r1!.id], 'resolved', 'fixed in v2', '1')).toEqual({
      ok: true,
      value: { closed: 1 },
    });
    let [hh] = await getDb().select().from(handlers).where(eq(handlers.id, h.id));
    expect(hh?.openReportCount).toBe(1);
    await closeReports(mod, [r2!.id, r1!.id], 'dismissed', null, '1');
    [hh] = await getDb().select().from(handlers).where(eq(handlers.id, h.id));
    expect(hh?.openReportCount).toBe(0);
  });
});

describe.runIf(dbAvailable())('backoffice and dashboard reads (SQL smoke)', () => {
  beforeEach(async () => {
    await truncateAll();
    resetAllRateLimits();
  });

  it('runs every read with filters on synthetic rows', async () => {
    const admin = asViewer(await makeUser({ role: 'admin', username: 'boss' }));
    const author = await makeUser({ username: 'writer' });
    const h = await makeHandler(author.id, { title: 'Split Racer' });
    const viewer = asViewer(await makeUser());
    const c = await postComment(viewer, { handlerId: h.id, body: 'nice one' });
    await getDb()
      .insert(reports)
      .values([
        { targetType: 'handler', handlerId: h.id, reason: 'broken', source: 'web' },
        {
          targetType: 'comment',
          commentId: c.ok ? c.value.id : '',
          handlerId: h.id,
          reason: 'spam',
          source: 'web',
        },
      ]);
    await setHandlerApproval(admin, h.id, false, '1', 'check');

    const a = await import('./admin');
    const d = await import('./dashboard');
    const { searchLocalGames } = await import('./handlers');
    const { exportUserData } = await import('@/server/auth/account');

    expect((await a.adminCounters()).openReports).toBe(2);
    for (const queue of ['awaiting', 'unverified', 'reported', 'deleted', 'all'] as const) {
      await a.listHandlersForReview(queue, 'split', 1);
    }
    expect((await a.listHandlersForReview('all', '', 1)).total).toBe(1);
    expect((await a.getHandlerForReview(h.id))?.versions).toHaveLength(1);
    expect(await a.getVersionInspection(h.id, 1)).not.toBeNull();
    const groups = await a.listReports('open', 1);
    expect(groups.map((g) => g.key).sort()).toEqual(
      [`comment:${c.ok ? c.value.id : ''}`, `handler:${h.id}`].sort(),
    );
    const users = await a.searchUsers({ q: 'writ', byEmail: true, page: 1 });
    expect(users.rows[0]?.handlers).toBe(1);
    await a.searchUsers({ q: 'someone@example.test', role: 'admin', banned: true, byEmail: true, page: 1 });
    expect((await a.getUserForAdmin(author.id))?.handlers).toHaveLength(1);
    expect(
      (await a.listCommentsForModeration({ q: 'nice', status: 'all', handlerId: h.id, page: 1 })).rows,
    ).toHaveLength(1);
    const games = await a.listGamesForAdmin('', 1);
    expect(games.rows[0]?.handlers).toBe(1);
    expect((await a.getGameForAdmin(h.gameId))?.handlers).toHaveLength(1);
    const audit = await a.listAudit({
      actor: 'boss',
      action: 'handler.',
      targetType: 'handler',
      from: '2000-01-01',
      to: '2999-01-01',
    });
    expect(audit.rows.map((r) => r.action)).toContain('handler.revoke');
    expect(await searchLocalGames('game')).not.toHaveLength(0);
    expect(await searchLocalGames('100%_\\')).toHaveLength(0);
    expect((await d.listMyHandlers(author.id))[0]?.state).toBe('awaiting_approval');
    expect((await d.handlerStats(h.id, 30)).series).toHaveLength(30);
    const exported = await exportUserData(viewer.id);
    expect(exported?.comments).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toMatch(/\$2[ab]\$/);
  });
});
