/**
 * Account input rules: docs/ARCHITECTURE.md section 4.3. Pure functions, shared by the forms (messages)
 * and the server (enforcement).
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Days between two username changes. */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'moderator',
  'splitscreen',
  'splitscreenme',
  'nucleus',
  'system',
  'api',
  'root',
]);

export const isReservedUsername = (name: string) => {
  const lower = name.toLowerCase();
  return RESERVED_USERNAMES.has(lower) || lower.startsWith('deleted-');
};

export type UsernameProblem = 'too_short' | 'too_long' | 'invalid_chars' | 'reserved';

export function usernameProblem(name: string): UsernameProblem | null {
  if (name.length < USERNAME_MIN) return 'too_short';
  if (name.length > USERNAME_MAX) return 'too_long';
  if (!USERNAME_PATTERN.test(name)) return 'invalid_chars';
  if (isReservedUsername(name)) return 'reserved';
  return null;
}

export const USERNAME_MESSAGES: Record<UsernameProblem, string> = {
  too_short: `At least ${USERNAME_MIN} characters.`,
  too_long: `At most ${USERNAME_MAX} characters.`,
  invalid_chars: 'Letters, digits, "-" and "_" only.',
  reserved: 'This name is reserved.',
};

export const PASSWORD_MESSAGES = {
  too_short: 'At least 8 characters.',
  too_long: 'At most 72 bytes (bcrypt ignores the rest).',
  same_as_identity: 'Must differ from your username and email.',
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX = 254;

/** Trimmed, lower-cased address, or null when it does not look like one. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim().toLowerCase();
  return v.length <= EMAIL_MAX && EMAIL_PATTERN.test(v) ? v : null;
}

/**
 * Whether the account's address was proven by its inbox: a confirmation link, a password reset, a
 * provider's verified address, or the legacy hub. A moderator's mark lets the account post but is not
 * proof of ownership (section 4.4): sign-in linking by email does not trust it.
 */
export const emailProven = (u: {
  email: string | null;
  emailVerifiedAt: Date | null;
  emailVerifiedByModerator: boolean;
}): boolean => !!u.email && !!u.emailVerifiedAt && !u.emailVerifiedByModerator;

/**
 * A valid username from a provider handle (or an email local part): invalid characters become "-",
 * trimmed to 20, padded when too short, never reserved. Uniqueness is the caller's job.
 */
export function sanitizeUsername(raw: string | null | undefined, fallback = 'player'): string {
  let name = (raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, USERNAME_MAX);
  if (name.length < USERNAME_MIN) name = fallback;
  if (isReservedUsername(name)) name = `${name.replace(/^deleted-/i, '')}-player`.slice(0, USERNAME_MAX);
  if (usernameProblem(name)) name = fallback;
  return name;
}

/** `base`, then `base-2`, `base-3`... trimmed so that the whole stays within 20 characters. */
export function usernameCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = `-${attempt}`;
  return `${base.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
}

// ---------- comments ----------

export const COMMENT_MIN = 2;
export const COMMENT_MAX = 1000;

/** Trimmed body with at most two consecutive blank lines, or a problem. */
export function normalizeCommentBody(input: unknown): { body: string } | { problem: string } {
  if (typeof input !== 'string') return { problem: 'Write something first.' };
  const body = input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (body.length < COMMENT_MIN) return { problem: `At least ${COMMENT_MIN} characters.` };
  if (body.length > COMMENT_MAX) return { problem: `At most ${COMMENT_MAX} characters.` };
  return { body };
}
