import 'server-only';
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { log } from '@/lib/log';
import { storageRoot } from '@/lib/storage';
import { invalidate, TAGS } from './cache';

/**
 * In-process background jobs, started once from instrumentation.ts (single instance). Each job has an
 * overlap guard: a run that is still going when the next tick comes is not started twice.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** trend_score = downloads of the last 3 UTC days (today included), one UPDATE. */
export async function recomputeTrend(): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    with t as (
      select h.id, coalesce(sum(d.downloads), 0)::int as score
      from handlers h
      left join handler_download_days d on d.handler_id = h.id and d.day >= (now() at time zone 'utc')::date - 3
      group by h.id
    )
    update handlers set trend_score = t.score
    from t where handlers.id = t.id and handlers.trend_score is distinct from t.score
    returning handlers.id`);
  if (rows.length) invalidate(TAGS.catalog);
  return rows.length;
}

/** Hourly: expired sessions, old tokens, download dedup rows, abandoned uploads. */
export async function hourlyPurge(): Promise<Record<string, number>> {
  const count = async (q: ReturnType<typeof sql>) => (await db.execute(q)).count ?? 0;
  const out = {
    sessions: await count(sql`delete from sessions where expires_at < now()`),
    tokens: await count(
      sql`delete from auth_tokens where (used_at is not null or expires_at < now()) and created_at < now() - interval '7 days'`,
    ),
    dedup: await count(sql`delete from download_dedup where created_at < now() - interval '48 hours'`),
    uploads: await purgeTempUploads(HOUR),
  };
  return out;
}

async function purgeTempUploads(olderThanMs: number): Promise<number> {
  const dir = path.join(storageRoot(), 'uploads');
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      const s = await stat(full);
      if (Date.now() - s.mtimeMs > olderThanMs) {
        await rm(full, { force: true, recursive: true });
        removed++;
      }
    } catch {
      // vanished meanwhile
    }
  }
  return removed;
}

/**
 * Daily: recompute denormalised counters from source rows (logging any drift), clear reporter hashes
 * 30 days after resolution, apply the 2-year audit retention.
 */
export async function dailyMaintenance(): Promise<Record<string, number>> {
  const drift = async (q: ReturnType<typeof sql>) => (await db.execute(q)).count ?? 0;
  const out = {
    stars: await drift(sql`
      update handlers h set star_count = s.n from (
        select h2.id, count(s2.user_id)::int as n from handlers h2
        left join handler_stars s2 on s2.handler_id = h2.id group by h2.id
      ) s where h.id = s.id and h.star_count <> s.n`),
    comments: await drift(sql`
      update handlers h set comment_count = c.n from (
        select h2.id, count(c2.id) filter (where c2.deleted_at is null)::int as n from handlers h2
        left join comments c2 on c2.handler_id = h2.id group by h2.id
      ) c where h.id = c.id and h.comment_count <> c.n`),
    openReports: await drift(sql`
      update handlers h set open_report_count = r.n from (
        select h2.id, count(r2.id) filter (where r2.status = 'open')::int as n from handlers h2
        left join reports r2 on r2.handler_id = h2.id and r2.target_type = 'handler' group by h2.id
      ) r where h.id = r.id and h.open_report_count <> r.n`),
    reporterHashes: await drift(sql`
      update reports set reporter_hash = null
      where reporter_hash is not null and status <> 'open' and resolved_at < now() - interval '30 days'`),
    auditPurged: 0,
  };
  out.auditPurged = await db.transaction(async (tx) => {
    await tx.execute(sql`set local ssm.audit_purge = 'on'`);
    return (await tx.execute(sql`delete from audit_log where at < now() - interval '2 years'`)).count ?? 0;
  });
  if (out.stars || out.comments || out.openReports) {
    log.warn('jobs.counter_drift', {
      stars: out.stars,
      comments: out.comments,
      openReports: out.openReports,
    });
    invalidate(TAGS.catalog, TAGS.stats);
  }
  return out;
}

interface Job {
  name: string;
  everyMs: number;
  /** delay before the first run */
  firstAfterMs: number;
  run: () => Promise<unknown>;
}

const JOBS: Job[] = [
  { name: 'trend', everyMs: 15 * MINUTE, firstAfterMs: MINUTE, run: recomputeTrend },
  { name: 'hourly-purge', everyMs: HOUR, firstAfterMs: 5 * MINUTE, run: hourlyPurge },
  { name: 'daily-maintenance', everyMs: DAY, firstAfterMs: 30 * MINUTE, run: dailyMaintenance },
];

const state = globalThis as unknown as { __ssmJobs?: { timers: NodeJS.Timeout[]; running: Set<string> } };

async function tick(job: Job, running: Set<string>): Promise<void> {
  if (running.has(job.name)) {
    log.warn('jobs.overlap_skipped', { job: job.name });
    return;
  }
  running.add(job.name);
  const started = Date.now();
  try {
    const result = await job.run();
    log.info('jobs.done', { job: job.name, ms: Date.now() - started, result });
  } catch (err) {
    log.error('jobs.failed', { job: job.name, err });
  } finally {
    running.delete(job.name);
  }
}

/** Starts the timers once per process. */
export function startJobs(): void {
  if (state.__ssmJobs) return;
  const running = new Set<string>();
  const timers: NodeJS.Timeout[] = [];
  for (const job of JOBS) {
    const first = setTimeout(() => {
      void tick(job, running);
      const every = setInterval(() => void tick(job, running), job.everyMs);
      every.unref();
      timers.push(every);
    }, job.firstAfterMs);
    first.unref();
    timers.push(first);
  }
  state.__ssmJobs = { timers, running };
  log.info('jobs.started', { jobs: JOBS.map((j) => j.name) });
}

export function stopJobs(): void {
  for (const t of state.__ssmJobs?.timers ?? []) clearTimeout(t);
  state.__ssmJobs = undefined;
}
