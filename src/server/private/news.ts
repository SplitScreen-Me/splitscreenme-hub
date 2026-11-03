import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { news, users, type NewsSeverity } from '@/db/schema';
import { audit } from '@/lib/audit';
import { can, type Actor } from '@/lib/auth/permissions';
import { newId } from '@/lib/ids';
import {
  compareNews,
  floorToMinute,
  NEWS_MESSAGE_MAX,
  NEWS_SEVERITIES,
  newsStatus,
  normalizeNewsMessage,
  normalizeNewsUrl,
  parseUtcDateTime,
  type NewsStatus,
} from '@/lib/news';
import { hit } from '@/lib/rate-limit';
import { invalidate, TAGS } from '@/server/cache';
import { fail, ok, rateLimited, type Fail, type Result } from '@/server/auth/result';

/**
 * App news, the backoffice side (admins only, `news.manage`): reads for /admin/news and every write,
 * each checking `can()` itself, rate-limited with the `admin-write` bucket, audited in the same
 * transaction, then invalidating the API's cached rows. The public read is src/server/public/news.ts.
 */

export interface NewsFields {
  message: string;
  url: string | null;
  severity: NewsSeverity;
  startsAt: Date;
  endsAt: Date | null;
}

const FIX = 'Please fix the fields below.';

/** A `datetime-local` value in UTC; empty is null (the caller decides what that means). */
const dateField = z.string().transform((v, ctx) => {
  if (!v.trim()) return null;
  const d = parseUtcDateTime(v);
  if (!d) {
    ctx.addIssue({ code: 'custom', message: 'A date and a time, such as 2026-11-03 09:00.' });
    return z.NEVER;
  }
  return d;
});

const NewsFormSchema = z.object({
  message: z
    .string()
    .transform(normalizeNewsMessage)
    .pipe(
      z
        .string()
        .min(1, 'Write the message.')
        .max(NEWS_MESSAGE_MAX, `At most ${NEWS_MESSAGE_MAX} characters (line breaks count as spaces).`),
    ),
  url: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const checked = normalizeNewsUrl(v);
    if (!checked.ok) {
      ctx.addIssue({ code: 'custom', message: checked.error });
      return z.NEVER;
    }
    return checked.url;
  }),
  severity: z.enum(NEWS_SEVERITIES, 'Pick info, warning or critical.'),
  startsAt: dateField,
  endsAt: dateField,
});

/**
 * Validates the backoffice form: one-line message of 1..500 characters (line breaks collapsed), optional
 * http(s) link, severity, start (empty = now, to the minute) and optional end, after the start. On an edit,
 * a start left at its displayed minute keeps the stored value, seconds included.
 */
export function parseNewsInput(
  input: Record<string, unknown>,
  opts: { now?: Date; currentStartsAt?: Date } = {},
): Result<NewsFields> {
  const parsed = NewsFormSchema.safeParse(input);
  const fields = parsed.success ? {} : (z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
  // The window is checked even when another field failed, so that every error shows at once.
  const start = dateField.safeParse(input.startsAt);
  const end = dateField.safeParse(input.endsAt);
  let startsAt: Date | null = null;
  if (start.success) {
    startsAt = start.data ?? floorToMinute(opts.now ?? new Date());
    const kept = opts.currentStartsAt;
    if (start.data && kept && floorToMinute(kept).getTime() === start.data.getTime()) startsAt = kept;
  }
  if (startsAt && end.success && end.data && end.data <= startsAt) {
    fields.endsAt = ['Must be after the start.'];
  }
  if (!parsed.success || !startsAt || Object.keys(fields).length) return fail(FIX, fields);
  const { startsAt: _start, ...rest } = parsed.data;
  return ok({ ...rest, startsAt });
}

const DENIED = fail('You are not allowed to do this.');

function guard(actor: Actor): Fail | null {
  if (!can(actor, 'news.manage')) return DENIED;
  const limited = hit('admin-write', actor.id);
  return limited.ok ? null : rateLimited(limited.retryAfter);
}

/** What the audit log keeps of a message: enough to recognise it. */
const excerpt = (message: string) => (message.length > 200 ? `${message.slice(0, 199)}…` : message);

// ---------- reads ----------

export interface AdminNews {
  id: string;
  message: string;
  url: string | null;
  severity: NewsSeverity;
  published: boolean;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorId: string | null;
  authorName: string | null;
  status: NewsStatus;
}

const adminColumns = {
  id: news.id,
  message: news.message,
  url: news.url,
  severity: news.severity,
  published: news.published,
  startsAt: news.startsAt,
  endsAt: news.endsAt,
  createdAt: news.createdAt,
  updatedAt: news.updatedAt,
  authorId: news.createdBy,
  authorName: users.username,
};

/** Shown on one page: years of announcements stay far below it. */
export const ADMIN_NEWS_LIMIT = 200;

const STATUS_ORDER: Record<NewsStatus, number> = { live: 0, scheduled: 1, draft: 2, expired: 3 };

/**
 * Every announcement for the backoffice list: live ones first, in the order the app shows them, then the
 * scheduled ones (next first), the drafts and the expired ones (latest first).
 */
export async function listNewsForAdmin(now: Date = new Date()): Promise<AdminNews[]> {
  const rows = await db
    .select(adminColumns)
    .from(news)
    .leftJoin(users, eq(users.id, news.createdBy))
    .orderBy(desc(news.createdAt))
    .limit(ADMIN_NEWS_LIMIT);
  return rows
    .map((r) => ({ ...r, status: newsStatus(r, now) }))
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus) return byStatus;
      if (a.status === 'live') return compareNews(a, b);
      if (a.status === 'scheduled') return a.startsAt.getTime() - b.startsAt.getTime();
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
}

export async function getNewsForAdmin(id: string, now: Date = new Date()): Promise<AdminNews | null> {
  const [row] = await db
    .select(adminColumns)
    .from(news)
    .leftJoin(users, eq(users.id, news.createdBy))
    .where(eq(news.id, id))
    .limit(1);
  return row ? { ...row, status: newsStatus(row, now) } : null;
}

// ---------- writes ----------

export async function createNews(
  actor: Actor,
  input: Record<string, unknown>,
  publish: boolean,
  ip: string,
): Promise<Result<{ id: string; status: NewsStatus }>> {
  const denied = guard(actor);
  if (denied) return denied;
  const parsed = parseNewsInput(input);
  if (!parsed.ok) return parsed;
  const f = parsed.value;
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(news).values({ id, ...f, published: publish, createdBy: actor.id });
    await audit(tx, {
      actor,
      action: 'news.create',
      target: { type: 'news', id },
      details: {
        message: excerpt(f.message),
        severity: f.severity,
        published: publish,
        hasUrl: f.url !== null,
        startsAt: f.startsAt.toISOString(),
        endsAt: f.endsAt?.toISOString() ?? null,
      },
      ip,
    });
  });
  invalidate(TAGS.news);
  return ok({ id, status: newsStatus({ published: publish, ...f }) });
}

export async function updateNews(
  actor: Actor,
  id: string,
  input: Record<string, unknown>,
  ip: string,
): Promise<Result<{ status: NewsStatus }>> {
  const denied = guard(actor);
  if (denied) return denied;
  const [current] = await db.select().from(news).where(eq(news.id, id)).limit(1);
  if (!current) return fail('Announcement not found.');
  const parsed = parseNewsInput(input, { currentStartsAt: current.startsAt });
  if (!parsed.ok) return parsed;
  const f = parsed.value;
  const time = (d: Date | null) => d?.getTime() ?? null;
  const changed = [
    f.message !== current.message && 'message',
    f.url !== current.url && 'url',
    f.severity !== current.severity && 'severity',
    time(f.startsAt) !== time(current.startsAt) && 'startsAt',
    time(f.endsAt) !== time(current.endsAt) && 'endsAt',
  ].filter((c): c is string => !!c);
  const status = newsStatus({ published: current.published, ...f });
  if (!changed.length) return ok({ status });
  await db.transaction(async (tx) => {
    await tx.update(news).set(f).where(eq(news.id, id));
    await audit(tx, {
      actor,
      action: 'news.update',
      target: { type: 'news', id },
      details: { fields: changed, ...(changed.includes('message') && { message: excerpt(f.message) }) },
      ip,
    });
  });
  invalidate(TAGS.news);
  return ok({ status });
}

export async function setNewsPublished(
  actor: Actor,
  id: string,
  publish: boolean,
  ip: string,
): Promise<Result<{ status: NewsStatus }>> {
  const denied = guard(actor);
  if (denied) return denied;
  const [current] = await db.select().from(news).where(eq(news.id, id)).limit(1);
  if (!current) return fail('Announcement not found.');
  const status = newsStatus({ ...current, published: publish });
  if (current.published === publish) return ok({ status });
  await db.transaction(async (tx) => {
    await tx.update(news).set({ published: publish }).where(eq(news.id, id));
    await audit(tx, {
      actor,
      action: publish ? 'news.publish' : 'news.unpublish',
      target: { type: 'news', id },
      ip,
    });
  });
  invalidate(TAGS.news);
  return ok({ status });
}

export async function deleteNews(actor: Actor, id: string, ip: string): Promise<Result> {
  const denied = guard(actor);
  if (denied) return denied;
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx.delete(news).where(eq(news.id, id)).returning();
    if (!row) return null;
    await audit(tx, {
      actor,
      action: 'news.delete',
      target: { type: 'news', id },
      details: { message: excerpt(row.message), severity: row.severity, wasPublished: row.published },
      ip,
    });
    return row;
  });
  if (!deleted) return fail('Announcement not found.');
  invalidate(TAGS.news);
  return ok();
}
