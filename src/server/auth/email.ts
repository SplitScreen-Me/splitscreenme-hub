import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { audit } from '@/lib/audit';
import { checkNewPassword, hashPassword } from '@/lib/auth/password';
import { invalidateUserSessions } from '@/lib/auth/session';
import { smtpEnabled } from '@/lib/env';
import { sendMail } from '@/lib/mail';
import { changeEmailMessage, resetPasswordMessage, verifyEmailMessage } from '@/lib/mail/templates';
import { hit } from '@/lib/rate-limit';
import { absoluteUrl } from '@/lib/urls';
import { confirmPassword } from './account';
import { fail, ok, rateLimited, type Result } from './result';
import { emailProven, normalizeEmail, PASSWORD_MESSAGES } from './rules';
import { releaseUnprovenEmail, takeOverByProof } from './takeover';
import { createAuthToken, peekAuthToken, useAuthToken } from './tokens';
import { findUserByEmail, getUserById } from './users';

/**
 * Email flows: verification, password reset, email change. All of them need SMTP; without it they are
 * disabled and the UI says so (docs/ARCHITECTURE.md section 4.3).
 */

const tokenLink = (path: string, token: string) => absoluteUrl(`${path}#token=${token}`);

export async function sendVerificationEmail(user: {
  id: string;
  username: string;
  email: string;
}): Promise<boolean> {
  if (!smtpEnabled()) return false;
  const token = await createAuthToken(user.id, 'verify_email', user.email);
  return sendMail(verifyEmailMessage(user.email, user.username, tokenLink('/verify-email', token)));
}

/** "Send the link again" from the account page. */
export async function resendVerification(userId: string): Promise<Result> {
  if (!smtpEnabled()) return fail('Emails are not available on this site yet.');
  const limited = hit('verify-resend', userId);
  if (!limited.ok) return rateLimited(limited.retryAfter);
  const user = await getUserById(userId);
  if (!user?.email) return fail('Add an email address first.');
  if (user.emailVerifiedAt) return fail('Your address is already confirmed.');
  const sent = await sendVerificationEmail({ id: user.id, username: user.username, email: user.email });
  return sent ? ok() : fail('The email could not be sent. Try again later.');
}

/**
 * Reset request. Always the same answer whether the account exists or not; the rate limits are per
 * address and per IP.
 */
export async function requestPasswordReset(rawEmail: string, ip: string): Promise<Result> {
  if (!smtpEnabled()) return fail('Password reset by email is not available on this site yet.');
  const email = normalizeEmail(rawEmail);
  if (!email) return fail('Enter a valid email address.', { email: ['Enter a valid email address.'] });
  const perIp = hit('password-reset:ip', ip);
  if (!perIp.ok) return rateLimited(perIp.retryAfter);
  const perEmail = hit('password-reset:email', email);
  // Over the per-address limit: answer as usual, send nothing.
  if (!perEmail.ok) return ok();
  const user = await findUserByEmail(email);
  if (user && !user.deletedAt && !user.bannedAt) {
    const token = await createAuthToken(user.id, 'reset_password', email);
    await sendMail(resetPasswordMessage(email, user.username, tokenLink('/reset-password', token)));
  }
  return ok();
}

/**
 * Sets the new password, proves the inbox, drops every session. The caller opens a new one. When the
 * address was held without proof, the reset is a takeover (section 4.4): the OAuth links and pending
 * tokens set up by the earlier holder go too.
 */
export async function resetPassword(
  token: unknown,
  password: string,
  ip: string,
): Promise<Result<{ userId: string }>> {
  const row = await peekAuthToken(token, ['reset_password']);
  if (!row) return fail('This link is invalid or expired. Ask for a new one.');
  const user = await getUserById(row.userId);
  if (!user || user.deletedAt || user.bannedAt)
    return fail('This link is invalid or expired. Ask for a new one.');
  const problem = checkNewPassword(password, { username: user.username, email: user.email });
  if (problem) return fail('Please choose another password.', { password: [PASSWORD_MESSAGES[problem]] });
  const hash = await hashPassword(password);

  const done = await db.transaction(async (tx) => {
    if (!(await useAuthToken(row.id, tx))) return false;
    const sameAddress = !!user.email && row.email === user.email.toLowerCase();
    if (sameAddress && !emailProven(user)) {
      await takeOverByProof(tx, user, { via: 'reset', password: { hash, algo: 'bcrypt' }, ip });
      return true;
    }
    await tx.update(users).set({ passwordHash: hash, passwordAlgo: 'bcrypt' }).where(eq(users.id, user.id));
    await invalidateUserSessions(user.id, undefined, tx);
    await audit(tx, {
      actor: { id: user.id, role: user.role },
      action: 'auth.password_reset',
      target: { type: 'user', id: user.id },
      ip,
    });
    return true;
  });
  return done ? ok({ userId: user.id }) : fail('This link was already used. Ask for a new one.');
}

/**
 * Verification and email-change links. `currentSessionId` (the confirming browser's session, if any) is
 * kept when an email change drops the other sessions.
 */
export async function confirmEmailToken(
  token: unknown,
  ip: string,
  currentSessionId?: string,
): Promise<Result<{ kind: 'verified' | 'changed' }>> {
  const row = await peekAuthToken(token, ['verify_email', 'change_email']);
  const invalid = fail('This link is invalid or expired.');
  if (!row?.email) return invalid;
  const user = await getUserById(row.userId);
  if (!user || user.deletedAt || user.bannedAt) return invalid;

  if (row.purpose === 'verify_email') {
    if (user.email?.toLowerCase() !== row.email)
      return fail('This link is for an address you no longer use.');
    await db.transaction(async (tx) => {
      if (!(await useAuthToken(row.id, tx))) return;
      await tx
        .update(users)
        .set({
          emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
          emailVerifiedByModerator: false,
        })
        .where(eq(users.id, user.id));
    });
    return ok({ kind: 'verified' });
  }

  const newEmail = row.email;
  const changed = await db.transaction(async (tx): Promise<'ok' | 'used' | 'taken'> => {
    if (!(await useAuthToken(row.id, tx))) return 'used';
    // The link proves the inbox: an account holding the address without proof gives it up.
    if (!(await releaseUnprovenEmail(tx, newEmail, { id: user.id, role: user.role }, ip))) return 'taken';
    await tx
      .update(users)
      .set({ email: newEmail, emailVerifiedAt: new Date(), emailVerifiedByModerator: false })
      .where(and(eq(users.id, user.id), isNull(users.deletedAt)));
    await invalidateUserSessions(user.id, currentSessionId, tx);
    await audit(tx, {
      actor: { id: user.id, role: user.role },
      action: 'auth.email_changed',
      target: { type: 'user', id: user.id },
      details: { confirmedByLink: true },
      ip,
    });
    return 'ok';
  });
  if (changed === 'taken') return fail('Another account now uses this address.');
  return changed === 'ok' ? ok({ kind: 'changed' }) : fail('This link was already used.');
}

/**
 * Email change from the account page. With SMTP: a confirmation link goes to the new address and the
 * change happens when it is opened (an account holding that address without proof then gives it up).
 * Without SMTP: the address changes now, unverified, and only if no other account uses it.
 */
export async function requestEmailChange(input: {
  userId: string;
  sessionId: string;
  newEmail: string;
  /** Required when the account has a password. */
  currentPassword: string;
  ip: string;
}): Promise<Result<{ pending: boolean }>> {
  const email = normalizeEmail(input.newEmail);
  if (!email) return fail('Enter a valid email address.', { email: ['Enter a valid email address.'] });
  const user = await getUserById(input.userId);
  if (!user) return fail('Account not found.');
  if (user.email?.toLowerCase() === email)
    return fail('This is already your address.', { email: ['No change.'] });
  // Re-authentication: a stolen session alone must not be enough to move the account's recovery address.
  const confirmed = await confirmPassword(user.id, input.currentPassword);
  if (!confirmed.ok) return confirmed;
  const holder = await findUserByEmail(email);
  if (holder && holder.id !== user.id && (!smtpEnabled() || emailProven(holder))) {
    return fail('Another account uses this address.', { email: ['Another account uses this address.'] });
  }
  if (smtpEnabled()) {
    const limited = hit('verify-resend', user.id);
    if (!limited.ok) return rateLimited(limited.retryAfter);
    const token = await createAuthToken(user.id, 'change_email', email);
    const sent = await sendMail(changeEmailMessage(email, user.username, tokenLink('/verify-email', token)));
    return sent ? ok({ pending: true }) : fail('The email could not be sent. Try again later.');
  }
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ email, emailVerifiedAt: null, emailVerifiedByModerator: false })
      .where(eq(users.id, user.id));
    await invalidateUserSessions(user.id, input.sessionId, tx);
    await audit(tx, {
      actor: { id: user.id, role: user.role },
      action: 'auth.email_changed',
      target: { type: 'user', id: user.id },
      details: { confirmedByLink: false },
      ip: input.ip,
    });
  });
  return ok({ pending: false });
}
