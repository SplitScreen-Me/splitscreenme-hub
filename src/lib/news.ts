/**
 * App news (the desktop app's one-line ticker, GET /api/v3/news): the rules shared by the API, the
 * backoffice and its live preview. Pure and dependency-free on purpose: the preview is a client
 * component, and zod must stay out of client bundles (docs/ARCHITECTURE.md 9.2).
 */

export const NEWS_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type NewsSeverityName = (typeof NEWS_SEVERITIES)[number];

export const NEWS_MESSAGE_MAX = 500;
export const NEWS_URL_MAX = 2048;
/** At most this many live items in the API answer. */
export const NEWS_LIVE_LIMIT = 10;

/** Line breaks, tabs and the Unicode separators: what the app cannot show on one line. */
const BREAKS = /[\t\n\v\f\r\u0085\u2028\u2029]+/g;
/** Other control characters (NUL is refused by Postgres text). */
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

/** One line: line breaks become single spaces, control characters go, spaces around them collapse. */
export function normalizeNewsMessage(raw: string): string {
  return raw.replace(BREAKS, ' ').replace(CONTROL, '').replace(/ {2,}/g, ' ').trim();
}

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * The "Learn more" link: an absolute http(s) URL without credentials, at most 2048 characters once
 * normalised (the stored form is the parser's `href`, so what the app opens is what the admin saw).
 */
export function normalizeNewsUrl(raw: string): UrlCheck {
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: 'A full address, starting with https://.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Only http:// and https:// links.' };
  }
  if (!parsed.hostname) return { ok: false, error: 'A full address, starting with https://.' };
  if (parsed.username || parsed.password)
    return { ok: false, error: 'No user name or password in the link.' };
  if (parsed.href.length > NEWS_URL_MAX) {
    return { ok: false, error: `At most ${NEWS_URL_MAX.toLocaleString('en')} characters.` };
  }
  return { ok: true, url: parsed.href };
}

/**
 * A `datetime-local` value read as UTC (the backoffice shows and takes every date in UTC):
 * `YYYY-MM-DDTHH:mm` with optional seconds. null when malformed or not a real date.
 */
export function parseUtcDateTime(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((p) => Number(p ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Date.UTC rolls 31 February over to March: refuse anything that does not round-trip.
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== mi
  ) {
    return null;
  }
  return date;
}

/** The value of a `datetime-local` input for a date, in UTC, to the minute. */
export const toUtcInputValue = (date: Date): string => date.toISOString().slice(0, 16);

/** The date floored to the minute (the precision of the backoffice form). */
export const floorToMinute = (date: Date): Date => new Date(Math.floor(date.getTime() / 60_000) * 60_000);

export type NewsStatus = 'live' | 'scheduled' | 'expired' | 'draft';

export interface NewsWindow {
  published: boolean;
  startsAt: Date;
  endsAt: Date | null;
}

/** Live = published, started and not ended: the same predicate as the API query. */
export function isLiveNews(n: NewsWindow, now: Date = new Date()): boolean {
  return n.published && n.startsAt <= now && (n.endsAt === null || n.endsAt > now);
}

export function newsStatus(n: NewsWindow, now: Date = new Date()): NewsStatus {
  if (!n.published) return 'draft';
  if (n.endsAt !== null && n.endsAt <= now) return 'expired';
  if (n.startsAt > now) return 'scheduled';
  return 'live';
}

const SEVERITY_RANK: Record<NewsSeverityName, number> = { critical: 0, warning: 1, info: 2 };

/** API order: critical, warning, info; then the latest start first; then the newest, then the id. */
export function compareNews(
  a: { severity: NewsSeverityName; startsAt: Date; createdAt: Date; id: string },
  b: { severity: NewsSeverityName; startsAt: Date; createdAt: Date; id: string },
): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.startsAt.getTime() - a.startsAt.getTime() ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
