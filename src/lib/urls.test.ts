import { describe, expect, it } from 'vitest';
import { safeNextPath } from './urls';

describe('safeNextPath', () => {
  it('keeps paths inside the site', () => {
    expect(safeNextPath('/hub')).toBe('/hub');
    expect(safeNextPath('/hub/some-game?tab=versions#top')).toBe('/hub/some-game?tab=versions#top');
    expect(safeNextPath('/account', '/x')).toBe('/account');
    expect(safeNextPath('/hub/%09x')).toBe('/hub/%09x');
  });

  it('refuses anything that could leave the site', () => {
    for (const bad of [
      undefined,
      42,
      '',
      'hub',
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r/evil.com',
      '/\u0000/evil.com',
      '\t//evil.com',
      '/%5C/evil.com'.replace('%5C', '\\'),
      '/.//evil.com',
    ]) {
      expect(safeNextPath(bad, '/fallback'), JSON.stringify(bad)).toBe('/fallback');
    }
  });

  it('never resolves to another origin', () => {
    for (const raw of ['/%5C/evil.com', '/%09/evil.com', '/%2F/evil.com']) {
      const out = safeNextPath(raw, '/fallback');
      expect(new URL(out, 'https://site.example').origin).toBe('https://site.example');
    }
  });
});
