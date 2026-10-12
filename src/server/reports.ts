import 'server-only';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { handlerVersions, handlers, reports } from '@/db/schema';
import type { ReportInput } from '@/lib/api/schemas/community';
import { audit } from '@/lib/audit';
import { keyedHash } from '@/lib/request';
import { listedHandler } from '@/server/public';

/**
 * Reports to the moderators (docs/ARCHITECTURE.md 5.6). Anonymous: the reporter is a keyed hash of the
 * address, cleared 30 days after resolution by the daily job. One open report per handler and address per
 * 24 hours; a duplicate is answered like a new one but not stored.
 */

export interface HandlerReportInput {
  handlerId: string;
  reason: ReportInput['reason'];
  message?: string;
  version?: number;
  source: ReportInput['client'];
  /** raw client address: only its keyed hash is stored */
  ip: string;
}

export type ReportOutcome =
  | { status: 'created'; id: number }
  | { status: 'duplicate' }
  | { status: 'not_found' }
  | { status: 'unknown_version' };

export const reporterHash = (ip: string) => keyedHash(`report|${ip}`);

/** Control characters other than tab and line breaks (NUL is refused by Postgres text). */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const cleanMessage = (message: string | undefined) => {
  const m = message?.replace(CONTROL, '').trim();
  return m ? m.slice(0, 1000) : null;
};

export async function createHandlerReport(input: HandlerReportInput): Promise<ReportOutcome> {
  const [h] = await db
    .select({ id: handlers.id })
    .from(handlers)
    .where(and(eq(handlers.id, input.handlerId), listedHandler))
    .limit(1);
  if (!h) return { status: 'not_found' };

  if (input.version !== undefined) {
    const [v] = await db
      .select({ id: handlerVersions.id })
      .from(handlerVersions)
      .where(
        and(
          eq(handlerVersions.handlerId, input.handlerId),
          eq(handlerVersions.version, input.version),
          isNull(handlerVersions.deletedAt),
        ),
      )
      .limit(1);
    if (!v) return { status: 'unknown_version' };
  }

  const hash = reporterHash(input.ip);
  return db.transaction(async (tx): Promise<ReportOutcome> => {
    // Serialises concurrent reports from the same address on the same handler.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`report|${input.handlerId}|${hash}`}, 0))`,
    );
    const [open] = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.targetType, 'handler'),
          eq(reports.handlerId, input.handlerId),
          eq(reports.reporterHash, hash),
          eq(reports.status, 'open'),
          gt(reports.createdAt, sql`now() - interval '24 hours'`),
        ),
      )
      .limit(1);
    if (open) return { status: 'duplicate' };

    const [row] = await tx
      .insert(reports)
      .values({
        targetType: 'handler',
        handlerId: input.handlerId,
        version: input.version ?? null,
        reason: input.reason,
        message: cleanMessage(input.message),
        reporterId: null,
        reporterHash: hash,
        source: input.source,
      })
      .returning({ id: reports.id });
    await tx
      .update(handlers)
      .set({ openReportCount: sql`${handlers.openReportCount} + 1`, updatedAt: sql`${handlers.updatedAt}` })
      .where(eq(handlers.id, input.handlerId));
    await audit(tx, {
      actor: null,
      action: 'report.create',
      target: { type: 'report', id: row!.id },
      details: {
        handlerId: input.handlerId,
        reason: input.reason,
        version: input.version ?? null,
        source: input.source,
      },
      ip: input.ip,
    });
    return { status: 'created', id: row!.id };
  });
}
