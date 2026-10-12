import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Small crypto helpers on node:crypto (no third-party code in the auth path).
 */

export const sha256Hex = (input: string | Uint8Array) => createHash('sha256').update(input).digest('hex');

export const hmacHex = (secret: string, input: string) =>
  createHmac('sha256', Buffer.from(secret, 'hex')).update(input).digest('hex');

export const randomBase64Url = (bytes: number) => randomBytes(bytes).toString('base64url');

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC 4648 base32, lower case, no padding (session tokens: 20 bytes -> 32 chars). */
export function base32LowerNoPadding(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
  return out;
}

export const randomBase32 = (bytes: number) => base32LowerNoPadding(randomBytes(bytes));

/** Constant-time comparison of two strings (false on length mismatch). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
