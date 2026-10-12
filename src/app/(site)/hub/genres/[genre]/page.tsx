import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogueView } from '@/components/hub/CatalogueView';
import { handlerHref } from '@/components/hub/GameCard';
import { isRefined, PAGE_SIZE, parseCatalogueQuery } from '@/components/hub/catalogue-query';
import { JsonLd } from '@/components/seo/JsonLd';
import { Breadcrumbs } from '@/components/ui';
import { collectionPageJsonLd } from '@/lib/seo/catalogue';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { getPrimaryHandlerIds } from '@/server/hub';
import { getGenres, searchHandlers, type GenreCount } from '@/server/public';

type Props = {
  params: Promise<{ genre: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function findGenre(slug: string): Promise<{ genre: GenreCount; all: GenreCount[] } | null> {
  const all = await getGenres();
  const genre = all.find((g) => g.slug === slug);
  return genre ? { genre, all } : null;
}

const heading = (g: GenreCount) => `${g.label} games in split screen on PC`;
const description = (g: GenreCount) =>
  `${g.count} ${g.label.toLowerCase()} ${g.count === 1 ? 'game' : 'games'} you can play in split screen on one PC with Nucleus Co-op and a free community handler. Filter by players and inputs.`;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const found = await findGenre((await params).genre);
  if (!found) return buildMetadata({ title: 'Genre not found', noindex: true });
  const query = parseCatalogueQuery(await searchParams);
  const base = paths.genre(found.genre.slug);
  const path = !isRefined(query) && query.page > 1 ? `${base}?page=${query.page}` : base;
  return buildMetadata({
    title: query.page > 1 ? `${heading(found.genre)}, page ${query.page}` : heading(found.genre),
    description: description(found.genre),
    path,
    noindex: isRefined(query),
  });
}

export default async function GenrePage({ params, searchParams }: Props) {
  const found = await findGenre((await params).genre);
  if (!found) notFound();
  const { genre, all } = found;
  const query = parseCatalogueQuery(await searchParams);
  const base = paths.genre(genre.slug);
  const [result, primaryIds] = await Promise.all([
    searchHandlers({
      q: query.q || undefined,
      genre: genre.slug,
      players: query.players ?? undefined,
      inputs: query.inputs,
      verified: query.verified,
      sort: query.sort,
      page: query.page,
      pageSize: PAGE_SIZE,
    }),
    getPrimaryHandlerIds(),
  ]);
  if (query.page > 1 && result.items.length === 0) notFound();

  const crumbs = [
    { label: 'Home', href: paths.home() },
    { label: 'Games', href: paths.hub() },
    { label: genre.label },
  ];
  return (
    <>
      <JsonLd
        data={[
          collectionPageJsonLd({
            name: heading(genre),
            description: description(genre),
            path: query.page > 1 ? `${base}?page=${query.page}` : base,
            startPosition: (query.page - 1) * PAGE_SIZE + 1,
            items: result.items.map((h) => ({ name: h.gameName, path: handlerHref(h, primaryIds) })),
          }),
          breadcrumbJsonLd([...crumbs.slice(0, -1), { label: genre.label, href: base }]),
        ]}
      />
      <CatalogueView
        base={base}
        query={query}
        result={result}
        primaryIds={primaryIds}
        eyebrow={`Genre · ${genre.count} ${genre.count === 1 ? 'game' : 'games'}`}
        heading={heading(genre)}
        intro={
          <div className="grid gap-3">
            <Breadcrumbs items={crumbs} />
            <p className="m-0 max-w-[46ch]">
              {genre.label} games with a community handler for Nucleus Co-op: one PC, one copy of the game, a
              window per player.
            </p>
          </div>
        }
        genres={all}
        currentGenre={genre.slug}
      />
    </>
  );
}
