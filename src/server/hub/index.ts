/**
 * Extra read queries of the public hub pages, built on src/server/public: every query applies
 * the listed predicate (docs/ARCHITECTURE.md 2.3, 6.1).
 */
export { getPrimaryHandlerIds } from './primary';
export { getRelatedGames } from './related';
export { getAuthorStats, type AuthorStats } from './authors';
export { getSitemapData, type SitemapData } from './sitemap';
export { legacyHandlerPath, legacyUserPath, LEGACY_ID } from './legacy';
export { goneFromHub, movedPermanently } from './legacy-response';
export {
  loadHandlerPage,
  parseCommentsCursor,
  COMMENTS_PER_PAGE,
  type HandlerPageData,
} from './handler-page';
