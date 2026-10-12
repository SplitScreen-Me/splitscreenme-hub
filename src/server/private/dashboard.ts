import 'server-only';
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { games, handlerDownloadDays, handlerVersions, handlers, users } from '@/db/schema';
import type { Actor } from '@/lib/auth/permissions';
import { handlerState } from '@/server/public';
import { loadEditable } from './handlers';

/** Owner (and moderator) reads for the dashboard: section 1 and 2.3 "handler states". */

export async function listMyHandlers(ownerId: string) {
  const rows = await db
    .select({
      id: handlers.id,
      title: handlers.title,
      gameName: games.name,
      gameSlug: games.slug,
      coverImageId: games.coverImageId,
      isPublic: handlers.isPublic,
      approvedAt: handlers.approvedAt,
      currentVersionId: handlers.currentVersionId,
      currentVersion: handlers.currentVersion,
      deletedAt: handlers.deletedAt,
      verifiedAt: handlerVersions.verifiedAt,
      downloadCount: handlers.downloadCount,
      starCount: handlers.starCount,
      commentCount: handlers.commentCount,
      openReportCount: handlers.openReportCount,
      updatedAt: handlers.updatedAt,
    })
    .from(handlers)
    .innerJoin(games, eq(games.id, handlers.gameId))
    .leftJoin(handlerVersions, eq(handlerVersions.id, handlers.currentVersionId))
    .where(and(eq(handlers.ownerId, ownerId), isNull(handlers.deletedAt)))
    .orderBy(desc(handlers.updatedAt));
  return rows.map((r) => ({
    ...r,
    state: handlerState(r),
    unverified: !!r.currentVersionId && !r.verifiedAt,
  }));
}

export type MyHandler = Awaited<ReturnType<typeof listMyHandlers>>[number];

/** The full editable handler (owner or moderator), with its versions; null = 404. */
export async function getHandlerForEdit(actor: Actor, handlerId: string) {
  const allowed = await loadEditable(actor, handlerId);
  if (!allowed) return null;
  const [h] = await db
    .select({
      id: handlers.id,
      title: handlers.title,
      description: handlers.description,
      maxPlayers: handlers.maxPlayers,
      supportsControllers: handlers.supportsControllers,
      supportsKeyboardMouse: handlers.supportsKeyboardMouse,
      supportsMultiKeyboardMouse: handlers.supportsMultiKeyboardMouse,
      isPublic: handlers.isPublic,
      approvedAt: handlers.approvedAt,
      currentVersionId: handlers.currentVersionId,
      currentVersion: handlers.currentVersion,
      publishedAt: handlers.publishedAt,
      deletedAt: handlers.deletedAt,
      ownerId: handlers.ownerId,
      ownerName: users.username,
      downloadCount: handlers.downloadCount,
      starCount: handlers.starCount,
      commentCount: handlers.commentCount,
      openReportCount: handlers.openReportCount,
      createdAt: handlers.createdAt,
      updatedAt: handlers.updatedAt,
      gameId: games.id,
      gameName: games.name,
      gameSlug: games.slug,
      coverImageId: games.coverImageId,
    })
    .from(handlers)
    .innerJoin(games, eq(games.id, handlers.gameId))
    .innerJoin(users, eq(users.id, handlers.ownerId))
    .where(eq(handlers.id, handlerId))
    .limit(1);
  if (!h) return null;
  const versions = await listVersions(handlerId);
  const current = versions.find((v) => v.id === h.currentVersionId) ?? null;
  return { ...h, state: handlerState(h), unverified: !!current && !current.verifiedAt, versions };
}

export type EditableHandler = NonNullable<Awaited<ReturnType<typeof getHandlerForEdit>>>;

export async function listVersions(handlerId: string, opts: { includeDeleted?: boolean } = {}) {
  return db
    .select({
      id: handlerVersions.id,
      version: handlerVersions.version,
      releaseNotes: handlerVersions.releaseNotes,
      fileName: handlerVersions.fileName,
      sizeBytes: handlerVersions.sizeBytes,
      sha256: handlerVersions.sha256,
      verifiedAt: handlerVersions.verifiedAt,
      downloadCount: handlerVersions.downloadCount,
      createdAt: handlerVersions.createdAt,
      deletedAt: handlerVersions.deletedAt,
      uploaderName: users.username,
      fileCount: sql<number>`jsonb_array_length(${handlerVersions.manifest})`.mapWith(Number),
    })
    .from(handlerVersions)
    .leftJoin(users, eq(users.id, handlerVersions.uploaderId))
    .where(
      and(
        eq(handlerVersions.handlerId, handlerId),
        opts.includeDeleted ? undefined : isNull(handlerVersions.deletedAt),
      ),
    )
    .orderBy(desc(handlerVersions.version));
}

/** Downloads per UTC day over the last `days` days (zero-filled), plus totals. */
export async function handlerStats(handlerId: string, days = 90) {
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({ day: handlerDownloadDays.day, downloads: handlerDownloadDays.downloads })
    .from(handlerDownloadDays)
    .where(and(eq(handlerDownloadDays.handlerId, handlerId), gte(handlerDownloadDays.day, since)))
    .orderBy(asc(handlerDownloadDays.day));
  const byDay = new Map(rows.map((r) => [r.day, r.downloads]));
  const series: { day: string; downloads: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    series.push({ day, downloads: byDay.get(day) ?? 0 });
  }
  const sum = (n: number) => series.slice(-n).reduce((s, d) => s + d.downloads, 0);
  return { series, last7: sum(7), last30: sum(30), lastN: sum(days) };
}
