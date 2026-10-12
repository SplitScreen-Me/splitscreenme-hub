import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { checkNewPassword, hashPassword, verifyPassword } from '@/lib/auth/password';
import { smtpEnabled } from '@/lib/env';
import { newId } from '@/lib/ids';
import { check, hit, hitAll, reset } from '@/lib/rate-limit';
import { fail, isUniqueViolation, ok, rateLimited, type Result } from './result';
import { normalizeEmail, PASSWORD_MESSAGES, USERNAME_MESSAGES, usernameProblem } from './rules';
import { sendVerificationEmail } from './email';
import { emailTaken, findUserByIdentifier, usernameTaken } from './users';

/**
 * Email or username + password: docs/ARCHITECTURE.md sections 3.1 (legacy hashes) and 4.3.
 * Sessions are opened by the caller (the Server Action sets the cookie).
 */

const GENERIC_LOGIN_ERROR = 'Wrong username, email or password.';

export async function passwordLogin(input: {
  identifier: string;
  password: string;
  ip: string;
}): Promise<Result<{ userId: string }>> {
  const identifier = input.identifier.trim().slice(0, 254);
  if (!identifier || !input.password) return fail(GENERIC_LOGIN_ERROR);

  const limited = hitAll([
    ['login:ip-identifier', `${input.ip}|${identifier.toLowerCase()}`],
    ['login:ip', input.ip],
  ]);
  if (!limited.ok) return rateLimited(limited.retryAfter);

  const user = await findUserByIdentifier(identifier);
  if (user) {
    const failures = check('login:account-failures', user.id);
    if (!failures.ok) return rateLimited(failures.retryAfter);
  }
  // Unknown users still pay for a bcrypt compare (constant timing).
  const result = await verifyPassword(
    input.password,
    user ? { hash: user.passwordHash, algo: user.passwordAlgo } : null,
  );
  if (!user || !result.ok) {
    if (user) hit('login:account-failures', user.id);
    return fail(GENERIC_LOGIN_ERROR);
  }
  if (user.bannedAt) return fail('This account is suspended.');

  reset('login:account-failures', user.id);
  await db
    .update(users)
    .set({
      lastLoginAt: new Date(),
      ...(result.rehash && { passwordHash: result.rehash.hash, passwordAlgo: result.rehash.algo }),
    })
    .where(eq(users.id, user.id));
  return ok({ userId: user.id });
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  acceptTerms: boolean;
  ip: string;
}

export async function registerUser(input: RegisterInput): Promise<Result<{ userId: string }>> {
  const fields: Record<string, string[]> = {};
  const username = input.username.trim();
  const uProblem = usernameProblem(username);
  if (uProblem) fields.username = [USERNAME_MESSAGES[uProblem]];
  const email = normalizeEmail(input.email);
  if (!email) fields.email = ['Enter a valid email address.'];
  const pProblem = checkNewPassword(input.password, { username, email });
  if (pProblem) fields.password = [PASSWORD_MESSAGES[pProblem]];
  if (!input.acceptTerms) fields.acceptTerms = ['Please accept the terms to create an account.'];
  if (Object.keys(fields).length) return fail('Please fix the fields below.', fields);

  const limited = hit('register', input.ip);
  if (!limited.ok) return rateLimited(limited.retryAfter);

  if (await usernameTaken(username))
    return fail('Please fix the fields below.', { username: ['This name is taken.'] });
  if (await emailTaken(email!)) {
    return fail('Please fix the fields below.', {
      email: ['An account already uses this address. Log in or reset your password.'],
    });
  }

  const id = newId();
  try {
    await db.insert(users).values({
      id,
      username,
      email,
      passwordHash: await hashPassword(input.password),
      passwordAlgo: 'bcrypt',
      lastLoginAt: new Date(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return fail('This name or address was just taken. Try another one.');
    throw err;
  }
  if (smtpEnabled()) await sendVerificationEmail({ id, username, email: email! });
  return ok({ userId: id });
}
