import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Passwords: bcryptjs (pure JS), cost 11. Legacy Meteor hashes are bcrypt(SHA256-hex(password)) where the
 * SHA-256 input is the password encoded code unit by code unit (CESU-8 for characters outside the BMP).
 * docs/ARCHITECTURE.md sections 3.1 and 4.3.
 */

export const BCRYPT_COST = 11;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt ignores everything after 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordAlgo = 'bcrypt' | 'meteor_sha256_bcrypt';

/** Meteor's client-side digest (packages/sha/sha256.js): UTF-16 code units, each as 1 to 3 bytes. */
export function meteorDigest(password: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < password.length; i++) {
    const c = password.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return createHash('sha256').update(Uint8Array.from(bytes)).digest('hex');
}

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

/**
 * A valid bcrypt hash of a random string, compared against when the account does not exist (or has no
 * password) so that the response time does not reveal it.
 */
const DUMMY_HASH = '$2b$11$R2aT2L2G99MGMlsaXE9JMe69w0bu82qeMu16BusRzKCiwyqYyETHi';

export interface PasswordCheck {
  ok: boolean;
  /** Set when the stored hash should be replaced (legacy algorithm or lower cost), same request. */
  rehash?: { hash: string; algo: 'bcrypt' };
}

export async function verifyPassword(
  password: string,
  stored: { hash: string | null; algo: PasswordAlgo | null } | null,
): Promise<PasswordCheck> {
  if (!stored?.hash || !stored.algo) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false };
  }
  if (stored.algo === 'meteor_sha256_bcrypt') {
    const ok = await bcrypt.compare(meteorDigest(password), stored.hash);
    return ok ? { ok, rehash: { hash: await hashPassword(password), algo: 'bcrypt' } } : { ok };
  }
  const ok = await bcrypt.compare(password, stored.hash);
  if (ok && bcrypt.getRounds(stored.hash) < BCRYPT_COST) {
    return { ok, rehash: { hash: await hashPassword(password), algo: 'bcrypt' } };
  }
  return { ok };
}

export type PasswordProblem = 'too_short' | 'too_long' | 'same_as_identity';

/** Registration and password change rules. Returns the first problem, or null. */
export function checkNewPassword(
  password: string,
  identity: { username?: string | null; email?: string | null } = {},
): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return 'too_long';
  const lower = password.toLowerCase();
  if (
    (identity.username && lower === identity.username.toLowerCase()) ||
    (identity.email && lower === identity.email.toLowerCase())
  ) {
    return 'same_as_identity';
  }
  return null;
}
