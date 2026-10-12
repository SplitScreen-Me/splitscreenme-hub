import type {
  GenreCount,
  HubStats,
  PublicAuthor,
  PublicComment,
  PublicGame,
  PublicHandler,
  PublicHandlerDetail,
  PublicVersion,
  Screenshot,
} from '@/server/public';
import { absoluteUrl, apiDownloadUrl, igdbImageUrl, paths } from '../urls';
import type { AuthorDto, CommentDto } from './schemas/community';
import type { GameDto, GenreDto, StatsDto } from './schemas/games';
import type { HandlerDetailDto, HandlerSummaryDto, ScreenshotDto, VersionDto } from './schemas/handlers';

/**
 * Domain types of src/server/public -> API payloads (docs/ARCHITECTURE.md 5.3): ISO dates, absolute URLs,
 * nothing that is not in the schemas. Pure functions; the tests check their output against the schemas.
 */

/** What a summary needs beyond the handler row to build its links. */
export interface LinkContext {
  /** Primary handler of each public game (its canonical page is the game page). */
  primaryIds: ReadonlySet<string>;
  /** Authors whose public profile does not exist (suspended accounts). */
  hiddenAuthorIds: ReadonlySet<string>;
}

const iso = (d: Date) => d.toISOString();

export function handlerUrl(h: Pick<PublicHandler, 'id' | 'gameSlug'>, isPrimary: boolean): string {
  return absoluteUrl(paths.handler(h.gameSlug, h.id, isPrimary));
}

export function toHandlerSummary(h: PublicHandler, ctx: LinkContext): HandlerSummaryDto {
  const authorVisible = h.authorId !== null && !ctx.hiddenAuthorIds.has(h.authorId);
  return {
    id: h.id,
    title: h.title,
    url: handlerUrl(h, ctx.primaryIds.has(h.id)),
    gameName: h.gameName,
    gameSlug: h.gameSlug,
    igdbGameId: h.igdbGameId,
    coverImageId: h.coverImageId,
    genres: h.genres,
    authorId: h.authorId,
    authorName: h.authorName,
    authorUrl: authorVisible ? absoluteUrl(paths.author(h.authorName)) : null,
    version: h.version,
    verified: h.verified,
    maxPlayers: h.maxPlayers,
    inputs: { ...h.inputs },
    downloads: h.downloads,
    stars: h.stars,
    comments: h.comments,
    trendScore: h.trendScore,
    createdAt: iso(h.createdAt),
    updatedAt: iso(h.updatedAt),
    publishedAt: iso(h.publishedAt),
  };
}

export function toVersion(handlerId: string, v: PublicVersion): VersionDto {
  return {
    id: v.id,
    version: v.version,
    releaseNotes: v.releaseNotes,
    createdAt: iso(v.createdAt),
    verified: v.verified,
    sizeBytes: v.sizeBytes,
    sha256: v.sha256,
    fileName: v.fileName,
    downloads: v.downloads,
    downloadUrl: apiDownloadUrl(handlerId, v.version),
  };
}

/** IGDB screenshots; an id that is not a valid IGDB image id is dropped rather than failing the payload. */
export function toScreenshots(list: Screenshot[]): ScreenshotDto[] {
  const out: ScreenshotDto[] = [];
  for (const s of list) {
    try {
      out.push({
        imageId: s.imageId,
        width: s.width,
        height: s.height,
        url: igdbImageUrl(s.imageId, 't_screenshot_big'),
        thumbUrl: igdbImageUrl(s.imageId, 't_screenshot_med'),
      });
    } catch {
      // invalid image id in the database: skip it
    }
  }
  return out;
}

export function toHandlerDetail(h: PublicHandlerDetail, ctx: LinkContext): HandlerDetailDto {
  // `isPrimary` comes fresh with the detail; the context may be a few minutes older.
  const primaryIds = new Set(ctx.primaryIds);
  if (h.isPrimary) primaryIds.add(h.id);
  else primaryIds.delete(h.id);
  return {
    ...toHandlerSummary(h, { ...ctx, primaryIds }),
    description: h.description,
    gameDescription: h.gameSummary,
    igdbUrl: h.igdbUrl,
    steamAppId: h.steamAppId,
    releaseYear: h.releaseYear,
    screenshots: toScreenshots(h.screenshots),
    currentVersion: toVersion(h.id, h.currentVersion),
    isPrimary: h.isPrimary,
  };
}

export function toComment(c: PublicComment): CommentDto {
  return {
    id: c.id,
    handlerId: c.handlerId,
    parentId: c.parentId,
    authorId: c.authorId,
    authorName: c.authorName,
    body: c.body,
    createdAt: iso(c.createdAt),
    editedAt: c.editedAt ? iso(c.editedAt) : null,
  };
}

export function toGame(g: PublicGame, ctx: LinkContext): GameDto {
  // The game's own order is authoritative for its primary handler.
  const primaryIds = new Set(ctx.primaryIds);
  for (const h of g.handlers) primaryIds.delete(h.id);
  primaryIds.add(g.primaryHandlerId);
  const linkCtx = { ...ctx, primaryIds };
  return {
    slug: g.slug,
    name: g.name,
    url: absoluteUrl(paths.game(g.slug)),
    igdbGameId: g.igdbGameId,
    igdbUrl: g.igdbUrl,
    summary: g.summary,
    coverImageId: g.coverImageId,
    steamAppId: g.steamAppId,
    releaseYear: g.releaseYear,
    genres: g.genres,
    screenshots: toScreenshots(g.screenshots),
    primaryHandlerId: g.primaryHandlerId,
    handlers: g.handlers.map((h) => toHandlerSummary(h, linkCtx)),
  };
}

export function toGenre(g: GenreCount): GenreDto {
  return {
    slug: g.slug,
    name: g.name,
    label: g.label,
    url: absoluteUrl(paths.genre(g.slug)),
    count: g.count,
  };
}

export function toAuthor(a: PublicAuthor, ctx: LinkContext): AuthorDto {
  return {
    id: a.id,
    username: a.username,
    url: absoluteUrl(paths.author(a.username)),
    joinedAt: iso(a.joinedAt),
    handlers: a.handlers.map((h) => toHandlerSummary(h, ctx)),
  };
}

export function toStats(s: HubStats): StatsDto {
  return {
    publicHandlers: s.publicHandlers,
    games: s.games,
    downloads: s.downloads,
    members: s.members,
    comments: s.comments,
    generatedAt: iso(s.generatedAt),
  };
}
