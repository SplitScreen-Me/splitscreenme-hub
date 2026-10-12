import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { handlers } from '@/db/schema';

/**
 * The listed predicate: the only handlers the public (pages, API, sitemap, OG images, search) ever sees.
 * docs/ARCHITECTURE.md section 2.3. Every query in src/server/public goes through it.
 */
export const listedHandler: SQL = and(
  isNull(handlers.deletedAt),
  eq(handlers.isPublic, true),
  isNotNull(handlers.approvedAt),
  isNotNull(handlers.currentVersionId),
)!;

/** Same rule in JS, for rows already loaded (owner/moderator views, tests). */
export function isListed(h: {
  deletedAt: Date | null;
  isPublic: boolean;
  approvedAt: Date | null;
  currentVersionId: string | null;
}): boolean {
  return h.deletedAt === null && h.isPublic && h.approvedAt !== null && h.currentVersionId !== null;
}

export type HandlerState = 'draft' | 'private' | 'awaiting_approval' | 'listed' | 'deleted';

/** The state shown to authors in the dashboard (plus the separate "current version unverified" flag). */
export function handlerState(h: {
  deletedAt: Date | null;
  isPublic: boolean;
  approvedAt: Date | null;
  currentVersionId: string | null;
}): HandlerState {
  if (h.deletedAt) return 'deleted';
  if (!h.currentVersionId) return 'draft';
  if (!h.isPublic) return 'private';
  if (!h.approvedAt) return 'awaiting_approval';
  return 'listed';
}
