import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { downloadDedup, handlerDownloadDays, handlerVersions, handlers } from '@/db/schema';
import { keyedHash, utcDay } from '@/lib/request';

/**
 * Counted downloads (docs/ARCHITECTURE.md 5.5). Per client address and UTC day, a handler counts once
 * (handler total, daily row, so the trend) and each of its versions counts once (version total): asking
 * for every version does not multiply the handler's numbers. Dedup keys are HMACs, so no address is stored.
 */

/** User agents that never count: crawlers, link previews, command-line tools. */
export const NON_COUNTING_AGENT = /bot|crawler|spider|preview|curl\/|wget\//i;

export interface CountRequest {
  method: string;
  /** `count` query parameter (default true) */
  count: boolean;
  /** `Range` header, if any */
  range: string | null;
  userAgent: string | null;
}

/** Whether this request may count: GET, `count` not false, whole file, not a bot or a script. */
export function shouldCount(r: CountRequest): boolean {
  if (r.method !== 'GET' || !r.count) return false;
  if (r.range !== null && r.range.replace(/\s+/g, '') !== 'bytes=0-') return false;
  return !NON_COUNTING_AGENT.test(r.userAgent ?? '');
}

/** Version-level key: one count per address, version and day. */
export const dedupKey = (ip: string, handlerId: string, version: number, day: string) =>
  keyedHash(`${ip}|${handlerId}|${version}|${day}`);

/** Handler-level key: one count per address, handler and day, whatever the version. */
export const handlerDedupKey = (ip: string, handlerId: string, day: string) =>
  keyedHash(`${ip}|${handlerId}|handler|${day}`);

/**
 * Records one download in one transaction: the version counter when this address has not downloaded
 * this version today, the handler counter and daily row when it has not downloaded this handler today.
 * Returns false when neither counted. `updated_at` of the handler is kept: a download is not an edit.
 */
export async function recordDownload(input: {
  ip: string;
  handlerId: string;
  versionId: string;
  version: number;
  now?: Date;
}): Promise<boolean> {
  const day = utcDay(input.now);
  const versionKey = dedupKey(input.ip, input.handlerId, input.version, day);
  const handlerKey = handlerDedupKey(input.ip, input.handlerId, day);
  return db.transaction(async (tx) => {
    const fresh = new Set(
      (
        await tx
          .insert(downloadDedup)
          .values([{ key: versionKey }, { key: handlerKey }])
          .onConflictDoNothing()
          .returning({ key: downloadDedup.key })
      ).map((r) => r.key),
    );
    if (fresh.has(versionKey)) {
      await tx
        .update(handlerVersions)
        .set({ downloadCount: sql`${handlerVersions.downloadCount} + 1` })
        .where(eq(handlerVersions.id, input.versionId));
    }
    if (!fresh.has(handlerKey)) return fresh.size > 0;
    await tx
      .update(handlers)
      .set({ downloadCount: sql`${handlers.downloadCount} + 1`, updatedAt: sql`${handlers.updatedAt}` })
      .where(eq(handlers.id, input.handlerId));
    await tx
      .insert(handlerDownloadDays)
      .values({ handlerId: input.handlerId, day, downloads: 1 })
      .onConflictDoUpdate({
        target: [handlerDownloadDays.handlerId, handlerDownloadDays.day],
        set: { downloads: sql`${handlerDownloadDays.downloads} + 1` },
      });
    return true;
  });
}

/** `Repr-Digest` value (RFC 9530) of a hex SHA-256. */
export const reprDigest = (sha256Hex: string) =>
  `sha-256=:${Buffer.from(sha256Hex, 'hex').toString('base64')}:`;

/**
 * A single `bytes=` range of a file of `size` bytes, or null when absent, multi-range or not satisfiable
 * (then the whole file is sent, as RFC 9110 allows).
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.replace(/\s+/g, ''));
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || start > end || start >= size) return null;
  return { start, end };
}
