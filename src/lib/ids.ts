/**
 * Ids. Legacy Meteor ids (17 chars) stay the primary keys of users, handlers, versions and comments;
 * new ids use the same format so the desktop app (which stores handler ids) sees no difference.
 */
export const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz';
export const ID_LENGTH = 17;

/** What the API and the app accept for any id. */
export const ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;

export const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value);

// Largest multiple of the alphabet size that fits in a byte: bytes at or above it are rejected so every
// character is equally likely (no modulo bias).
const LIMIT = 256 - (256 % ID_ALPHABET.length);

export function newId(length: number = ID_LENGTH): string {
  let out = '';
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < LIMIT) out += ID_ALPHABET[b % ID_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}
