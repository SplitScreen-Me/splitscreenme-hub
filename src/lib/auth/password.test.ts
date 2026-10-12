import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { checkNewPassword, meteorDigest, verifyPassword } from './password';

describe('meteorDigest (vectors computed with Meteor sha256.js)', () => {
  it.each([
    ['password', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'],
    ['Pässwörd', 'b9fdf96f902f18de9c513b0b05383d0f47a06890832799cc0af2f583df530f61'],
    // outside the BMP: CESU-8, differs from UTF-8
    ['pa😀ss', 'c7d5eed2694b19366906134fce32b38721c59d229fcbe53adeccd709e1044fb4'],
  ])('%s', (input, digest) => {
    expect(meteorDigest(input)).toBe(digest);
  });
});

describe('verifyPassword', () => {
  it('accepts a legacy Meteor hash and asks for a bcrypt rehash', async () => {
    const legacy = await bcrypt.hash(meteorDigest('pa😀ss'), 4);
    const res = await verifyPassword('pa😀ss', { hash: legacy, algo: 'meteor_sha256_bcrypt' });
    expect(res.ok).toBe(true);
    expect(res.rehash?.algo).toBe('bcrypt');
    expect(await bcrypt.compare('pa😀ss', res.rehash!.hash)).toBe(true);
    expect(bcrypt.getRounds(res.rehash!.hash)).toBe(11);
  });

  it('rejects a wrong password on a legacy hash', async () => {
    const legacy = await bcrypt.hash(meteorDigest('right'), 4);
    expect((await verifyPassword('wrong', { hash: legacy, algo: 'meteor_sha256_bcrypt' })).ok).toBe(false);
  });

  it('rehashes a bcrypt hash below cost 11 only', async () => {
    const low = await bcrypt.hash('secret-pass', 4);
    expect((await verifyPassword('secret-pass', { hash: low, algo: 'bcrypt' })).rehash).toBeDefined();
    const ok = await bcrypt.hash('secret-pass', 11);
    const res = await verifyPassword('secret-pass', { hash: ok, algo: 'bcrypt' });
    expect(res).toEqual({ ok: true });
  });

  it('fails without a stored hash (dummy compare keeps the timing)', async () => {
    expect((await verifyPassword('anything', null)).ok).toBe(false);
    expect((await verifyPassword('anything', { hash: null, algo: null })).ok).toBe(false);
  });
});

describe('checkNewPassword', () => {
  it('enforces 8 chars, 72 bytes and differs from identity', () => {
    expect(checkNewPassword('short')).toBe('too_short');
    expect(checkNewPassword('é'.repeat(37))).toBe('too_long'); // 74 bytes
    expect(checkNewPassword('Player-One', { username: 'player-one' })).toBe('same_as_identity');
    expect(checkNewPassword('a@b.example', { email: 'A@B.example' })).toBe('same_as_identity');
    expect(checkNewPassword('correct horse battery')).toBeNull();
  });
});
