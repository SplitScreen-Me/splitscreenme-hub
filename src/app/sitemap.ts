import type { MetadataRoute } from 'next';
import { docPages } from '@/content/docs/nav';
import { absoluteUrl, paths } from '@/lib/urls';
import { getSitemapData } from '@/server/hub';

export const dynamic = 'force-dynamic';

/**
 * Sitemap (docs/ARCHITECTURE.md section 7): landing, download, catalogue, docs, legal, every public game,
 * non-primary handler pages, genre pages and authors with listed handlers. Version pages are left out
 * (noindex). Hub data comes from src/server/hub (listed handlers only), cached 1 hour.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hub = await getSitemapData();
  const staticPaths = [
    paths.home(),
    paths.download(),
    paths.hub(),
    paths.legal('privacy'),
    paths.legal('terms'),
    paths.legal('notice'),
  ];
  return [
    ...staticPaths.map((p) => ({ url: absoluteUrl(p) })),
    ...docPages.map((d) => ({ url: absoluteUrl(paths.doc(d.slug)) })),
    ...hub.genres.map((slug) => ({ url: absoluteUrl(paths.genre(slug)) })),
    ...hub.games.map((g) => ({ url: absoluteUrl(paths.game(g.slug)), lastModified: g.lastModified })),
    ...hub.handlers.map((h) => ({
      url: absoluteUrl(paths.handler(h.gameSlug, h.id)),
      lastModified: h.lastModified,
    })),
    ...hub.authors.map((a) => ({ url: absoluteUrl(paths.author(a.username)), lastModified: a.lastModified })),
  ];
}
