import 'server-only';
import { cached, TAGS } from '@/server/cache';
import { getComments, getHandler, getVersions } from '@/server/public';
import type {
  PublicComment,
  PublicGame,
  PublicHandler,
  PublicHandlerDetail,
  PublicVersion,
} from '@/server/public/types';
import { getAuthorStats, type AuthorStats } from './authors';
import { getPrimaryHandlerIds } from './primary';
import { getRelatedGames } from './related';

export const COMMENTS_PER_PAGE = 50;

export interface HandlerPageData {
  game: PublicGame;
  handler: PublicHandlerDetail;
  /** newest first */
  versions: PublicVersion[];
  comments: { items: PublicComment[]; nextCursor: string | null };
  /** other listed handlers of the same game (primary first) */
  others: PublicHandler[];
  related: PublicHandler[];
  authorStats: AuthorStats | null;
  primaryIds: ReadonlySet<string>;
}

/** Versions of a listed handler, cached with the handler (60 s, dropped on handler writes). */
function cachedVersions(handlerId: string) {
  return cached(`hub:versions:${handlerId}`, 60_000, () => getVersions(handlerId), [
    TAGS.handler(handlerId),
    TAGS.catalog,
  ]);
}

/**
 * Everything the game page (primary handler) or a handler page shows. null when the handler is not
 * listed or does not belong to this game. Comments are read fresh (they change most).
 */
export async function loadHandlerPage(
  game: PublicGame,
  handlerId: string,
  options: { commentsBefore?: Date } = {},
): Promise<HandlerPageData | null> {
  const handler = await getHandler(handlerId);
  if (!handler || handler.gameId !== game.id) return null;
  const [versions, comments, related, authorStats, primaryIds] = await Promise.all([
    cachedVersions(handlerId),
    getComments(handlerId, { limit: COMMENTS_PER_PAGE, before: options.commentsBefore }),
    getRelatedGames({ id: game.id, genres: game.genres, maxPlayers: handler.maxPlayers }),
    handler.authorId ? getAuthorStats(handler.authorId) : Promise.resolve(null),
    getPrimaryHandlerIds(),
  ]);
  if (!versions || !comments) return null;
  return {
    game,
    handler,
    versions,
    comments,
    others: game.handlers.filter((h) => h.id !== handlerId),
    related,
    authorStats,
    primaryIds,
  };
}

/** Parses the `?before=` comments cursor (ISO date); undefined when absent or invalid. */
export function parseCommentsCursor(raw: string | string[] | undefined): Date | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || v.length > 40) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
