import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db';
import {
  auditLog,
  authTokens,
  comments,
  handlerStars,
  handlers,
  oauthAccounts,
  sessions,
  users,
} from '@/db/schema';
import { meteorDigest } from '@/lib/auth/password';
import { createSession, sessionIdFromToken } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { resetAllRateLimits } from '@/lib/rate-limit';
import { dbAvailable, truncateAll } from '@/test/db';
import { anonymiseUser, changePassword, changeUsername, deleteOwnAccount, unlinkProvider } from './account';
import { passwordLogin, registerUser } from './credentials';
import { confirmEmailToken, resetPassword } from './email';
import { resolveOAuthUser } from './oauth-resolve';
import {
  isReservedUsername,
  normalizeCommentBody,
  sanitizeUsername,
  usernameCandidate,
  usernameProblem,
} from './rules';
import { makeHandler, makeUser } from './test-fixtures';
import { createAuthToken } from './tokens';

describe('account rules', () => {
  it('validates usernames', () => {
    expect(usernameProblem('ab')).toBe('too_short');
    expect(usernameProblem('a'.repeat(21))).toBe('too_long');
    expect(usernameProblem('bad name')).toBe('invalid_chars');
    expect(usernameProblem('Admin')).toBe('reserved');
    expect(usernameProblem('deleted-abc')).toBe('reserved');
    expect(usernameProblem('Player_One-2')).toBeNull();
    expect(isReservedUsername('SplitScreenMe')).toBe(true);
  });

  it('sanitises provider names', () => {
    expect(sanitizeUsername('Jöhn Doe!!')).toBe('John-Doe');
    expect(sanitizeUsername('x')).toBe('player');
    expect(sanitizeUsername('admin')).toBe('admin-player');
    expect(sanitizeUsername('a'.repeat(40))).toHaveLength(20);
    expect(usernameCandidate('a'.repeat(20), 12)).toBe(`${'a'.repeat(17)}-12`);
  });

  it('normalises comment bodies', () => {
    expect(normalizeCommentBody('  hi  ')).toEqual({ body: 'hi' });
    expect(normalizeCommentBody('a')).toHaveProperty('problem');
    expect(normalizeCommentBody('x'.repeat(1001))).toHaveProperty('problem');
    expect(normalizeCommentBody('a\r\n\n\n\n\n\nb')).toEqual({ body: 'a\n\n\nb' });
  });
});

describe('permissions (section 6.2)', () => {
  const user = { id: 'u1', role: 'user' as const };
  const mod = { id: 'm1', role: 'moderator' as const };
  const admin = { id: 'a1', role: 'admin' as const };
  it('owner, moderator and admin rules', () => {
    expect(can(null, 'star')).toBe(false);
    expect(can(user, 'handler.edit', { ownerId: 'u1' })).toBe(true);
    expect(can(user, 'handler.edit', { ownerId: 'other' })).toBe(false);
    expect(can(mod, 'handler.edit', { ownerId: 'other' })).toBe(true);
    expect(can(user, 'comment.delete', { authorId: 'u1' })).toBe(true);
    expect(can(user, 'comment.delete', { authorId: 'u2' })).toBe(false);
    expect(can(mod, 'version.verify')).toBe(true);
    expect(can(mod, 'user.ban')).toBe(false);
    expect(can(mod, 'audit.read')).toBe(false);
    expect(can(admin, 'user.role')).toBe(true);
  });
});

describe.runIf(dbAvailable())('auth flows (database)', () => {
  beforeEach(async () => {
    await truncateAll();
    resetAllRateLimits();
  });

  it('registers, rejects duplicates case-insensitively and logs in', async () => {
    const res = await registerUser({
      username: 'NewPlayer',
      email: 'New@Example.test',
      password: 'long enough pw',
      acceptTerms: true,
      ip: '1.1.1.1',
    });
    expect(res.ok).toBe(true);
    const dup = await registerUser({
      username: 'newplayer',
      email: 'other@example.test',
      password: 'long enough pw',
      acceptTerms: true,
      ip: '1.1.1.2',
    });
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.fields?.username).toBeTruthy();
    const dupMail = await registerUser({
      username: 'other',
      email: 'NEW@example.test',
      password: 'long enough pw',
      acceptTerms: true,
      ip: '1.1.1.3',
    });
    expect(!dupMail.ok && dupMail.fields?.email).toBeTruthy();
    const [row] = await getDb().select().from(users).where(eq(users.username, 'NewPlayer'));
    expect(row?.email).toBe('new@example.test');
    expect(row?.passwordAlgo).toBe('bcrypt');
    expect(bcrypt.getRounds(row!.passwordHash!)).toBe(11);
    expect(
      (await passwordLogin({ identifier: 'NEWPLAYER', password: 'long enough pw', ip: '2.2.2.2' })).ok,
    ).toBe(true);
    expect(
      (await passwordLogin({ identifier: 'new@example.test', password: 'long enough pw', ip: '2.2.2.2' })).ok,
    ).toBe(true);
  });

  it('validates registration fields', async () => {
    const res = await registerUser({
      username: 'ab',
      email: 'nope',
      password: 'short',
      acceptTerms: false,
      ip: '1.1.1.1',
    });
    expect(res.ok).toBe(false);
    expect(!res.ok && Object.keys(res.fields ?? {}).sort()).toEqual([
      'acceptTerms',
      'email',
      'password',
      'username',
    ]);
  });

  it('verifies a legacy Meteor hash and rehashes it in the same request', async () => {
    const legacy = await bcrypt.hash(meteorDigest('old secret'), 4);
    const u = await makeUser({
      username: 'legacy',
      passwordHash: legacy,
      passwordAlgo: 'meteor_sha256_bcrypt',
    });
    expect((await passwordLogin({ identifier: 'legacy', password: 'wrong', ip: '3.3.3.3' })).ok).toBe(false);
    expect((await passwordLogin({ identifier: 'legacy', password: 'old secret', ip: '3.3.3.3' })).ok).toBe(
      true,
    );
    const [after] = await getDb().select().from(users).where(eq(users.id, u.id));
    expect(after?.passwordAlgo).toBe('bcrypt');
    expect(await bcrypt.compare('old secret', after!.passwordHash!)).toBe(true);
    expect(after?.lastLoginAt).not.toBeNull();
  });

  it('refuses banned accounts and rate-limits attempts', async () => {
    await makeUser({
      username: 'banned',
      passwordHash: await bcrypt.hash('password1', 4),
      passwordAlgo: 'bcrypt',
      bannedAt: new Date(),
    });
    const banned = await passwordLogin({ identifier: 'banned', password: 'password1', ip: '4.4.4.4' });
    expect(!banned.ok && banned.error).toMatch(/suspended/);
    for (let i = 0; i < 4; i++) await passwordLogin({ identifier: 'ghost', password: 'x', ip: '5.5.5.5' });
    const fifth = await passwordLogin({ identifier: 'ghost', password: 'x', ip: '5.5.5.5' });
    const sixth = await passwordLogin({ identifier: 'ghost', password: 'x', ip: '5.5.5.5' });
    expect(fifth.ok).toBe(false);
    expect(!sixth.ok && sixth.retryAfter).toBeGreaterThan(0);
  });

  it('locks an account after 10 failures from several addresses', async () => {
    await makeUser({
      username: 'target',
      passwordHash: await bcrypt.hash('password1', 4),
      passwordAlgo: 'bcrypt',
    });
    for (let i = 0; i < 10; i++)
      await passwordLogin({ identifier: 'target', password: 'bad', ip: `10.0.0.${i}` });
    const res = await passwordLogin({ identifier: 'target', password: 'password1', ip: '10.0.1.1' });
    expect(!res.ok && res.retryAfter).toBeGreaterThan(0);
  });

  it('resets a password with a single-use token, proving the inbox and dropping sessions', async () => {
    const u = await makeUser({
      username: 'forgetful',
      email: 'f@example.test',
      emailVerifiedAt: null,
      passwordHash: await bcrypt.hash('old password', 4),
      passwordAlgo: 'bcrypt',
    });
    await createSession(u.id, null);
    const token = await createAuthToken(u.id, 'reset_password', 'f@example.test');
    const weak = await resetPassword(token, 'short', '1.1.1.1');
    expect(weak.ok).toBe(false); // the token survives a bad password
    const res = await resetPassword(token, 'brand new password', '1.1.1.1');
    expect(res.ok).toBe(true);
    expect((await resetPassword(token, 'another new password', '1.1.1.1')).ok).toBe(false);
    const [after] = await getDb().select().from(users).where(eq(users.id, u.id));
    expect(await bcrypt.compare('brand new password', after!.passwordHash!)).toBe(true);
    expect(after?.emailVerifiedAt).not.toBeNull();
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
    expect((await resetPassword('garbage', 'brand new password', '1.1.1.1')).ok).toBe(false);
  });

  it('a reset of an unproven address is a takeover; of a proven one, only a reset', async () => {
    const squatted = await makeUser({
      username: 'squat-reset',
      email: 's@example.test',
      emailVerifiedAt: null,
    });
    await getDb()
      .insert(oauthAccounts)
      .values({ provider: 'github', providerUserId: 'gh-s', userId: squatted.id });
    const t1 = await createAuthToken(squatted.id, 'reset_password', 's@example.test');
    expect((await resetPassword(t1, 'brand new password', '1.1.1.1')).ok).toBe(true);
    expect(
      await getDb().select().from(oauthAccounts).where(eq(oauthAccounts.userId, squatted.id)),
    ).toHaveLength(0);
    expect(
      await getDb().select().from(auditLog).where(eq(auditLog.action, 'auth.email_takeover')),
    ).toHaveLength(1);

    const owner = await makeUser({ username: 'owner-reset', email: 'o@example.test' });
    await getDb()
      .insert(oauthAccounts)
      .values({ provider: 'github', providerUserId: 'gh-o', userId: owner.id });
    const t2 = await createAuthToken(owner.id, 'reset_password', 'o@example.test');
    expect((await resetPassword(t2, 'brand new password', '1.1.1.1')).ok).toBe(true);
    expect(await getDb().select().from(oauthAccounts).where(eq(oauthAccounts.userId, owner.id))).toHaveLength(
      1,
    );
  });

  it('an email change by link takes an address held without proof, never a proven one', async () => {
    const squatter = await makeUser({
      username: 'squatter',
      email: 'wanted@example.test',
      emailVerifiedAt: null,
    });
    const claimant = await makeUser({ username: 'claimant', email: 'c@example.test' });
    const change = await createAuthToken(claimant.id, 'change_email', 'wanted@example.test');
    expect((await confirmEmailToken(change, '1.1.1.1')).ok).toBe(true);
    const [s1] = await getDb().select().from(users).where(eq(users.id, squatter.id));
    const [c1] = await getDb().select().from(users).where(eq(users.id, claimant.id));
    expect(s1?.email).toBeNull();
    expect(c1?.email).toBe('wanted@example.test');

    const other = await makeUser({ username: 'other', email: 'x@example.test' });
    const steal = await createAuthToken(other.id, 'change_email', 'wanted@example.test');
    expect(await confirmEmailToken(steal, '1.1.1.1')).toMatchObject({ ok: false });
    const [c2] = await getDb().select().from(users).where(eq(users.id, claimant.id));
    expect(c2?.email).toBe('wanted@example.test');
  });

  it('confirms an address and an email change by link', async () => {
    const u = await makeUser({ username: 'mailer', email: 'm@example.test', emailVerifiedAt: null });
    const verify = await createAuthToken(u.id, 'verify_email', 'm@example.test');
    expect(await confirmEmailToken(verify, '1.1.1.1')).toEqual({ ok: true, value: { kind: 'verified' } });
    const change = await createAuthToken(u.id, 'change_email', 'new@example.test');
    expect((await confirmEmailToken(change, '1.1.1.1')).ok).toBe(true);
    const [after] = await getDb().select().from(users).where(eq(users.id, u.id));
    expect(after?.email).toBe('new@example.test');
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.action, 'auth.email_changed'));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]!.details)).not.toContain('@');
  });

  it('changes the password, keeping only the current session', async () => {
    const u = await makeUser({
      username: 'changer',
      passwordHash: await bcrypt.hash('old password', 4),
      passwordAlgo: 'bcrypt',
    });
    const keep = await createSession(u.id, null);
    await createSession(u.id, null);
    const wrong = await changePassword({
      userId: u.id,
      sessionId: sessionIdFromToken(keep.token),
      currentPassword: 'nope',
      newPassword: 'fresh password',
      ip: '1.1.1.1',
    });
    expect(wrong.ok).toBe(false);
    const ok = await changePassword({
      userId: u.id,
      sessionId: sessionIdFromToken(keep.token),
      currentPassword: 'old password',
      newPassword: 'fresh password',
      ip: '1.1.1.1',
    });
    expect(ok.ok).toBe(true);
    const left = await getDb().select().from(sessions).where(eq(sessions.userId, u.id));
    expect(left.map((s) => s.id)).toEqual([sessionIdFromToken(keep.token)]);
  });

  it('limits username changes to one per 30 days (case changes are free)', async () => {
    const u = await makeUser({ username: 'renamer' });
    expect((await changeUsername(u.id, 'renamed')).ok).toBe(true);
    expect((await changeUsername(u.id, 'Renamed')).ok).toBe(true);
    const again = await changeUsername(u.id, 'third-name');
    expect(!again.ok && again.error).toMatch(/again in/);
  });

  it('unlinks a provider only when another sign-in method remains', async () => {
    const u = await makeUser({ username: 'linked', passwordHash: null, passwordAlgo: null });
    await getDb()
      .insert(oauthAccounts)
      .values([
        { provider: 'github', providerUserId: '1', userId: u.id },
        { provider: 'facebook', providerUserId: '2', userId: u.id },
      ]);
    const res = await unlinkProvider(u.id, 'github', '1.1.1.1');
    expect(res.ok).toBe(false); // Facebook cannot sign in any more
    await getDb().insert(oauthAccounts).values({ provider: 'discord', providerUserId: '3', userId: u.id });
    expect((await unlinkProvider(u.id, 'github', '1.1.1.1')).ok).toBe(true);
  });

  it('anonymises an account: stars, comments, identities, sessions; handlers stay', async () => {
    const owner = await makeUser({
      username: 'leaving',
      passwordHash: await bcrypt.hash('bye bye pass', 4),
      passwordAlgo: 'bcrypt',
    });
    const other = await makeUser({ username: 'staying' });
    const h = await makeHandler(other.id);
    const mine = await makeHandler(owner.id);
    await getDb().insert(handlerStars).values({ userId: owner.id, handlerId: h.id });
    await getDb().update(handlers).set({ starCount: 1, commentCount: 1 }).where(eq(handlers.id, h.id));
    await getDb()
      .insert(comments)
      .values({ id: 'CommentToErase001', handlerId: h.id, authorId: owner.id, body: 'personal words' });
    await getDb()
      .insert(oauthAccounts)
      .values({ provider: 'discord', providerUserId: '42', userId: owner.id });
    await createSession(owner.id, null);

    expect(
      (await deleteOwnAccount({ userId: owner.id, password: 'wrong', confirmUsername: '', ip: '1.1.1.1' }))
        .ok,
    ).toBe(false);
    expect(
      (
        await deleteOwnAccount({
          userId: owner.id,
          password: 'bye bye pass',
          confirmUsername: '',
          ip: '1.1.1.1',
        })
      ).ok,
    ).toBe(true);

    const [u] = await getDb().select().from(users).where(eq(users.id, owner.id));
    expect(u?.username).toBe(`deleted-${owner.id.slice(0, 6)}`);
    expect(u?.email).toBeNull();
    expect(u?.passwordHash).toBeNull();
    expect(u?.deletedAt).not.toBeNull();
    const [c] = await getDb().select().from(comments).where(eq(comments.id, 'CommentToErase001'));
    expect(c?.body).toBe('');
    expect(c?.deletedAt).not.toBeNull();
    const [hh] = await getDb().select().from(handlers).where(eq(handlers.id, h.id));
    expect(hh?.starCount).toBe(0);
    expect(hh?.commentCount).toBe(0);
    expect(await getDb().select().from(oauthAccounts).where(eq(oauthAccounts.userId, owner.id))).toHaveLength(
      0,
    );
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, owner.id))).toHaveLength(0);
    const [kept] = await getDb().select().from(handlers).where(eq(handlers.id, mine.id));
    expect(kept?.deletedAt).toBeNull();
    // Deleting twice is refused.
    expect((await anonymiseUser(owner.id, { id: owner.id, role: 'user' }, '1.1.1.1')).ok).toBe(false);
  });
});

describe.runIf(dbAvailable())('OAuth linking rules (section 4.4)', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  const profile = (over: Partial<Parameters<typeof resolveOAuthUser>[0]> = {}) => ({
    provider: 'github' as const,
    providerUserId: '1001',
    username: 'octo cat',
    email: 'octo@example.test',
    emailVerified: true,
    ...over,
  });
  const login = { intent: 'login' as const, sessionUserId: null, ip: '1.1.1.1' };

  it('1. a known identity signs in its user, unless banned', async () => {
    const u = await makeUser({ username: 'known' });
    await getDb().insert(oauthAccounts).values({ provider: 'github', providerUserId: '1001', userId: u.id });
    expect(await resolveOAuthUser(profile(), login)).toEqual({ ok: true, userId: u.id, outcome: 'existing' });
    await getDb().update(users).set({ bannedAt: new Date() }).where(eq(users.id, u.id));
    expect(await resolveOAuthUser(profile(), login)).toEqual({ ok: false, error: 'suspended' });
  });

  it('2b. an unconfirmed address cannot gain a sign-in method, unless the provider vouches for it', async () => {
    const me = await makeUser({ username: 'unconfirmed', email: 'octo@example.test', emailVerifiedAt: null });
    const link = { intent: 'link' as const, sessionUserId: me.id, ip: '1.1.1.1' };
    expect(await resolveOAuthUser(profile({ email: 'other@example.test' }), link)).toEqual({
      ok: false,
      error: 'link_requires_verified_email',
    });
    expect(await resolveOAuthUser(profile({ emailVerified: false }), link)).toEqual({
      ok: false,
      error: 'link_requires_verified_email',
    });
    expect(await resolveOAuthUser(profile(), link)).toEqual({ ok: true, userId: me.id, outcome: 'linked' });
    const [after] = await getDb().select().from(users).where(eq(users.id, me.id));
    expect(after?.emailVerifiedAt).not.toBeNull();
  });

  it('2. linking attaches to the session user and refuses an identity owned by someone else', async () => {
    const me = await makeUser({ username: 'me' });
    const res = await resolveOAuthUser(profile({ email: null, emailVerified: false }), {
      intent: 'link',
      sessionUserId: me.id,
      ip: '1.1.1.1',
    });
    expect(res).toEqual({ ok: true, userId: me.id, outcome: 'linked' });
    const someoneElse = await makeUser({ username: 'else' });
    const stolen = await resolveOAuthUser(profile(), {
      intent: 'link',
      sessionUserId: someoneElse.id,
      ip: '1.1.1.1',
    });
    expect(stolen).toEqual({ ok: false, error: 'identity_taken' });
    expect(
      await resolveOAuthUser(profile({ providerUserId: '2' }), {
        intent: 'link',
        sessionUserId: null,
        ip: '1',
      }),
    ).toEqual({ ok: false, error: 'link_requires_session' });
  });

  it('3. a verified matching address links; an unverified password account loses its password (pre-hijack)', async () => {
    const victim = await makeUser({
      username: 'victim',
      email: 'octo@example.test',
      emailVerifiedAt: null,
      passwordHash: await bcrypt.hash('attacker set this', 4),
      passwordAlgo: 'bcrypt',
    });
    await createSession(victim.id, null);
    const res = await resolveOAuthUser(profile(), login);
    expect(res).toEqual({ ok: true, userId: victim.id, outcome: 'linked_by_email' });
    const [after] = await getDb().select().from(users).where(eq(users.id, victim.id));
    expect(after?.passwordHash).toBeNull();
    expect(after?.emailVerifiedAt).not.toBeNull();
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, victim.id))).toHaveLength(0);
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.action, 'auth.email_takeover'));
    expect(audits).toHaveLength(1);
  });

  it('3c. a takeover by proof also drops the identities the earlier holder linked', async () => {
    // The attacker registered the victim's address and attached their own GitHub before the victim came.
    const squatted = await makeUser({
      username: 'squatted',
      email: 'victim@example.test',
      emailVerifiedAt: null,
      passwordHash: await bcrypt.hash('attacker set this', 4),
      passwordAlgo: 'bcrypt',
    });
    await getDb()
      .insert(oauthAccounts)
      .values({ provider: 'github', providerUserId: 'attacker-gh', userId: squatted.id });
    await createAuthToken(squatted.id, 'change_email', 'attacker@example.test');
    const res = await resolveOAuthUser(
      profile({ provider: 'google', providerUserId: 'victim-g', email: 'victim@example.test' }),
      login,
    );
    expect(res).toEqual({ ok: true, userId: squatted.id, outcome: 'linked_by_email' });
    const links = await getDb().select().from(oauthAccounts).where(eq(oauthAccounts.userId, squatted.id));
    expect(links.map((l) => l.providerUserId)).toEqual(['victim-g']);
    expect(await getDb().select().from(authTokens).where(eq(authTokens.userId, squatted.id))).toHaveLength(0);
    // The attacker's GitHub no longer signs in to this account.
    const back = await resolveOAuthUser(
      profile({ providerUserId: 'attacker-gh', email: null, emailVerified: false }),
      login,
    );
    expect(back.ok && back.userId).not.toBe(squatted.id);
  });

  it("3d. a moderator's mark is not proof: the provider's verified address takes the account over", async () => {
    const marked = await makeUser({
      username: 'marked',
      email: 'octo@example.test',
      emailVerifiedByModerator: true,
      passwordHash: await bcrypt.hash('someone set this', 4),
      passwordAlgo: 'bcrypt',
    });
    await getDb()
      .insert(oauthAccounts)
      .values({ provider: 'discord', providerUserId: 'd-1', userId: marked.id });
    expect(await resolveOAuthUser(profile(), login)).toEqual({
      ok: true,
      userId: marked.id,
      outcome: 'linked_by_email',
    });
    const [after] = await getDb().select().from(users).where(eq(users.id, marked.id));
    expect(after).toMatchObject({ passwordHash: null, emailVerifiedByModerator: false });
    const links = await getDb().select().from(oauthAccounts).where(eq(oauthAccounts.userId, marked.id));
    expect(links.map((l) => l.provider)).toEqual(['github']);
  });

  it("3e. a proven address links without touching the account's other ways in", async () => {
    const owner = await makeUser({
      username: 'proven',
      email: 'octo@example.test',
      passwordHash: await bcrypt.hash('my own password', 4),
      passwordAlgo: 'bcrypt',
    });
    await getDb()
      .insert(oauthAccounts)
      .values({ provider: 'discord', providerUserId: 'd-2', userId: owner.id });
    expect(await resolveOAuthUser(profile(), login)).toEqual({
      ok: true,
      userId: owner.id,
      outcome: 'linked_by_email',
    });
    const [after] = await getDb().select().from(users).where(eq(users.id, owner.id));
    expect(after?.passwordHash).not.toBeNull();
    expect(await getDb().select().from(oauthAccounts).where(eq(oauthAccounts.userId, owner.id))).toHaveLength(
      2,
    );
  });

  it('3f. a suspended account squatting an address loses it to the verified claimant', async () => {
    const banned = await makeUser({
      username: 'banned-squatter',
      email: 'octo@example.test',
      emailVerifiedAt: null,
      bannedAt: new Date(),
    });
    const res = await resolveOAuthUser(profile(), login);
    expect(res.ok && res.outcome).toBe('created');
    const [created] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, res.ok ? res.userId : ''));
    expect(created?.email).toBe('octo@example.test');
    const [squatter] = await getDb().select().from(users).where(eq(users.id, banned.id));
    expect(squatter?.email).toBeNull();
    await getDb()
      .update(users)
      .set({ email: 'proven@example.test', emailVerifiedAt: new Date() })
      .where(eq(users.id, banned.id));
    expect(
      await resolveOAuthUser(profile({ providerUserId: '9', email: 'proven@example.test' }), login),
    ).toEqual({
      ok: false,
      error: 'suspended',
    });
  });

  it('3b. an unverified provider address never links to an existing account', async () => {
    const owner = await makeUser({ username: 'owner', email: 'octo@example.test' });
    const res = await resolveOAuthUser(profile({ emailVerified: false }), login);
    expect(res.ok && res.outcome).toBe('created');
    expect(res.ok && res.userId).not.toBe(owner.id);
    const [created] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, res.ok ? res.userId : ''));
    expect(created?.email).toBeNull();
  });

  it('4. creates an account with a sanitised, unique username', async () => {
    await makeUser({ username: 'octo-cat' });
    const res = await resolveOAuthUser(profile(), login);
    expect(res.ok && res.outcome).toBe('created');
    const [created] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, res.ok ? res.userId : ''));
    expect(created?.username).toBe('octo-cat-2');
    expect(created?.email).toBe('octo@example.test');
    expect(created?.emailVerifiedAt).not.toBeNull();
  });
});

describe.runIf(dbAvailable())('email change (no SMTP)', () => {
  beforeEach(async () => {
    await truncateAll();
    resetAllRateLimits();
  });

  it('needs the current password, then saves the address unverified', async () => {
    const { requestEmailChange } = await import('./email');
    const u = await makeUser({
      username: 'mover',
      passwordHash: await bcrypt.hash('my password', 4),
      passwordAlgo: 'bcrypt',
    });
    const base = { userId: u.id, sessionId: 'none', newEmail: 'moved@example.test', ip: '1.1.1.1' };
    expect((await requestEmailChange({ ...base, currentPassword: 'wrong' })).ok).toBe(false);
    expect(await requestEmailChange({ ...base, currentPassword: 'my password' })).toEqual({
      ok: true,
      value: { pending: false },
    });
    const [after] = await getDb().select().from(users).where(eq(users.id, u.id));
    expect(after?.email).toBe('moved@example.test');
    expect(after?.emailVerifiedAt).toBeNull();
  });
});
