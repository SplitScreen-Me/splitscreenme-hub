import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogueView } from '@/components/hub/CatalogueView';
import { handlerHref } from '@/components/hub/GameCard';
import { isRefined, PAGE_SIZE, parseCatalogueQuery } from '@/components/hub/catalogue-query';
import { JsonLd } from '@/components/seo/JsonLd';
import { collectionPageJsonLd, roundedCount } from '@/lib/seo/catalogue';
import { buildMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { getPrimaryHandlerIds } from '@/server/hub';
import { getGenres, getStats, searchHandlers } from '@/server/public';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TITLE = 'Split-screen PC games for Nucleus Co-op';

async function describe() {
  const stats = await getStats();
  return `Browse ${roundedCount(stats.games)} PC games you can play in split screen on one computer with Nucleus Co-op. Filter by players, controllers or keyboards and mice.`;
}

/** Filtered, searched or sorted variants: noindex,follow, canonical /hub. Plain pages: canonical to themselves. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseCatalogueQuery(await searchParams);
  const description = await describe();
  if (isRefined(query)) {
    return buildMetadata({
      title: query.q ? `“${query.q}”: games` : TITLE,
      description,
      path: paths.hub(),
      noindex: true,
    });
  }
  const path = query.page > 1 ? `${paths.hub()}?page=${query.page}` : paths.hub();
  return buildMetadata({
    title: query.page > 1 ? `${TITLE}, page ${query.page}` : TITLE,
    description,
    path,
  });
}

export default async function CataloguePage({ searchParams }: Props) {
  const query = parseCatalogueQuery(await searchParams);
  const [result, genres, primaryIds, stats, description] = await Promise.all([
    searchHandlers({
      q: query.q || undefined,
      players: query.players ?? undefined,
      inputs: query.inputs,
      verified: query.verified,
      sort: query.sort,
      page: query.page,
      pageSize: PAGE_SIZE,
    }),
    getGenres(),
    getPrimaryHandlerIds(),
    getStats(),
    describe(),
  ]);
  if (query.page > 1 && result.items.length === 0) notFound();

  const path = query.page > 1 ? `${paths.hub()}?page=${query.page}` : paths.hub();
  return (
    <>
      <JsonLd
        data={collectionPageJsonLd({
          name: TITLE,
          description,
          path,
          startPosition: (query.page - 1) * PAGE_SIZE + 1,
          items: result.items.map((h) => ({ name: h.gameName, path: handlerHref(h, primaryIds) })),
        })}
      />
      <CatalogueView
        base={paths.hub()}
        query={query}
        result={result}
        primaryIds={primaryIds}
        eyebrow={`${stats.games.toLocaleString('en-US')} games · ${stats.publicHandlers.toLocaleString('en-US')} handlers`}
        heading="Find a game to play together"
        intro={
          <p className="m-0 max-w-[46ch]">
            Every game here has a community handler for Nucleus Co-op. Pick one, install its handler, and hand
            out the controllers.
          </p>
        }
        genres={genres}
      />
    </>
  );
}
