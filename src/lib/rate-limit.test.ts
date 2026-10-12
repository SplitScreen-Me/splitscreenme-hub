import { beforeEach, describe, expect, it } from 'vitest';
import { check, hit, hitAll, reset, resetAllRateLimits } from './rate-limit';

describe('rate limiter (fixed windows)', () => {
  beforeEach(() => resetAllRateLimits());

  it('allows up to the limit, then answers with Retry-After until the window ends', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(hit('register', 'ip-1', t0 + i).ok).toBe(true);
    const blocked = hit('register', 'ip-1', t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.retryAfter).toBe(3600);
    // other keys are independent
    expect(hit('register', 'ip-2', t0 + 10).ok).toBe(true);
    // a new window starts after an hour
    expect(hit('register', 'ip-1', t0 + 3_600_001).ok).toBe(true);
  });

  it('check() does not count, reset() clears', () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 10; i++) hit('login:account-failures', 'user-1', t0);
    expect(check('login:account-failures', 'user-1', t0).ok).toBe(false);
    reset('login:account-failures', 'user-1');
    expect(check('login:account-failures', 'user-1', t0).ok).toBe(true);
    expect(check('login:account-failures', 'user-1', t0).remaining).toBe(10);
  });

  it('hitAll counts nothing when one rule is exhausted', () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 5; i++) hit('login:ip-identifier', 'ip|alice', t0);
    const r = hitAll(
      [
        ['login:ip-identifier', 'ip|alice'],
        ['login:ip', 'ip'],
      ],
      t0,
    );
    expect(r.ok).toBe(false);
    expect(check('login:ip', 'ip', t0).remaining).toBe(30);
  });
});
