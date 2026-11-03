import { describe, expect, it } from 'vitest';
import {
  compareNews,
  floorToMinute,
  isLiveNews,
  newsStatus,
  normalizeNewsMessage,
  normalizeNewsUrl,
  parseUtcDateTime,
  toUtcInputValue,
} from './news';

const NOW = new Date('2026-11-03T12:00:00.000Z');
const at = (offsetMinutes: number) => new Date(NOW.getTime() + offsetMinutes * 60_000);

describe('news message', () => {
  it('collapses line breaks, tabs and separators into single spaces on one line', () => {
    expect(normalizeNewsMessage('  XInput is broken \r\n\r\n by an update\there is the fix  ')).toBe(
      'XInput is broken by an update here is the fix',
    );
    expect(normalizeNewsMessage('a\u2028b\u2029c\u0085d\ve\ff')).toBe('a b c d e f');
  });

  it('drops other control characters and keeps the rest of Unicode as is', () => {
    expect(normalizeNewsMessage('a\u0000b\u0007c\u001bd\u007f')).toBe('abcd');
    expect(normalizeNewsMessage('Mise à jour\u00a0: corrigé 🎮')).toBe('Mise à jour\u00a0: corrigé 🎮');
    expect(normalizeNewsMessage(' \n\t ')).toBe('');
  });
});

describe('news link', () => {
  it('accepts absolute http and https URLs and stores the normalised form', () => {
    expect(normalizeNewsUrl(' https://v3.splitscreen.me/doc/faq#xinput ')).toEqual({
      ok: true,
      url: 'https://v3.splitscreen.me/doc/faq#xinput',
    });
    // Plain http is allowed (a local or legacy page); scheme and host are lower-cased.
    expect(normalizeNewsUrl('HTTP://LocalHost:3000/Doc')).toEqual({
      ok: true,
      url: 'http://localhost:3000/Doc',
    });
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com/file',
    'file:///C:/Windows',
    'nucleus://handler/abc',
    'mailto:someone@example.test',
  ])('refuses the %s scheme', (url) => {
    expect(normalizeNewsUrl(url)).toMatchObject({ ok: false, error: 'Only http:// and https:// links.' });
  });

  it('refuses relative or malformed addresses, credentials and anything over 2048 characters', () => {
    expect(normalizeNewsUrl('/doc/faq').ok).toBe(false);
    expect(normalizeNewsUrl('www.example.com').ok).toBe(false);
    expect(normalizeNewsUrl('https://').ok).toBe(false);
    expect(normalizeNewsUrl('https://user:pw@example.com/').ok).toBe(false);
    const base = 'https://example.com/';
    expect(normalizeNewsUrl(base + 'a'.repeat(2048 - base.length)).ok).toBe(true);
    expect(normalizeNewsUrl(base + 'a'.repeat(2049 - base.length))).toMatchObject({ ok: false });
  });
});

describe('news dates', () => {
  it('reads datetime-local values as UTC and refuses impossible dates', () => {
    expect(parseUtcDateTime('2026-11-03T09:30')?.toISOString()).toBe('2026-11-03T09:30:00.000Z');
    expect(parseUtcDateTime('2026-11-03T09:30:15')?.toISOString()).toBe('2026-11-03T09:30:15.000Z');
    expect(parseUtcDateTime('2026-02-31T09:30')).toBeNull();
    expect(parseUtcDateTime('2026-11-03 09:30')).toBeNull();
    expect(parseUtcDateTime('2026-11-03T24:30')).toBeNull();
    expect(parseUtcDateTime('2026-11-03T09:30Z')).toBeNull();
    expect(parseUtcDateTime('tomorrow')).toBeNull();
  });

  it('round-trips the form value to the minute', () => {
    const d = new Date('2026-11-03T09:30:59.900Z');
    expect(toUtcInputValue(d)).toBe('2026-11-03T09:30');
    expect(floorToMinute(d).toISOString()).toBe('2026-11-03T09:30:00.000Z');
  });
});

describe('news status', () => {
  it('is draft, scheduled, live or expired', () => {
    const w = (published: boolean, start: number, end: number | null) => ({
      published,
      startsAt: at(start),
      endsAt: end === null ? null : at(end),
    });
    expect(newsStatus(w(false, -60, null), NOW)).toBe('draft');
    expect(newsStatus(w(false, 60, null), NOW)).toBe('draft');
    expect(newsStatus(w(true, 60, null), NOW)).toBe('scheduled');
    expect(newsStatus(w(true, -60, -1), NOW)).toBe('expired');
    expect(newsStatus(w(true, -60, null), NOW)).toBe('live');
    expect(newsStatus(w(true, -60, 60), NOW)).toBe('live');
    // The start is included, the end excluded.
    expect(newsStatus(w(true, 0, 1), NOW)).toBe('live');
    expect(newsStatus(w(true, -1, 0), NOW)).toBe('expired');
    for (const [p, s, e] of [
      [true, -60, null],
      [true, 60, null],
      [false, -60, null],
      [true, -60, -1],
    ] as const) {
      expect(isLiveNews(w(p, s, e), NOW)).toBe(newsStatus(w(p, s, e), NOW) === 'live');
    }
  });

  it('orders critical, warning, info, then the latest start, then the newest', () => {
    const item = (id: string, severity: 'info' | 'warning' | 'critical', start: number, created = 0) => ({
      id,
      severity,
      startsAt: at(start),
      createdAt: at(created),
    });
    const list = [
      item('a', 'info', -10),
      item('b', 'critical', -100),
      item('c', 'warning', -5),
      item('d', 'critical', -1),
      item('e', 'info', -10, 5),
      item('f', 'info', -10, 5),
    ];
    expect(list.sort(compareNews).map((n) => n.id)).toEqual(['d', 'b', 'c', 'e', 'f', 'a']);
  });
});
