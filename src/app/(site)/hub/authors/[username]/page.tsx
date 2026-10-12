import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Shelf } from '@/components/hub/GameCard';
import { initial } from '@/components/hub/variant';
import { JsonLd } from '@/components/seo/JsonLd';
import { Breadcrumbs, DateTime, EmptyState, LinkButton, Stat, formatCount } from '@/components/ui';
import { truncate } from '@/lib/seo/game';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo/metadata';
import { absoluteUrl, paths } from '@/lib/urls';
import { getPrimaryHandlerIds } from '@/server/hub';
import { getAuthor, type PublicAuthor } from '@/server/public';
import '@/components/hub/hub.css';

type Props = { params: Promise<{ username: string }> };

const USERNAME = /^[^/\\\s]{1,64}$/;

async function authorOr404(raw: string): Promise<PublicAuthor> {
  if (!USERNAME.test(raw)) notFound();
  const author = await getAuthor(raw);
  if (!author) notFound();
  if (author.username !== raw) permanentRedirect(paths.author(author.username));
  return author;
}

function describe(a: PublicAuthor): string {
  if (a.handlers.length === 0) return `${a.username} on SplitScreen.Me, the Nucleus Co-op handler hub.`;
  const games = [...new Set(a.handlers.map((h) => h.gameName))];
  return truncate(
    `${a.handlers.length} split-screen ${a.handlers.length === 1 ? 'handler' : 'handlers'} for Nucleus Co-op by ${a.username}: ${games.slice(0, 6).join(', ')}${games.length > 6 ? ' and more' : ''}.`,
    155,
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = (await params).username;
  const author = USERNAME.test(raw) ? await getAuthor(raw) : null;
  if (!author) return {};
  return buildMetadata({
    title: `${author.username}: Nucleus Co-op handlers`,
    description: describe(author),
    path: paths.author(author.username),
    // Indexed only with at least one listed handler (section 1).
    noindex: author.handlers.length === 0,
    type: 'website',
  });
}

/** Public profile of a handler author: their listed handlers, most downloaded first. */
export default async function AuthorPage({ params }: Props) {
  const author = await authorOr404((await params).username);
  const primaryIds = await getPrimaryHandlerIds();
  const downloads = author.handlers.reduce((n, h) => n + h.downloads, 0);
  const stars = author.handlers.reduce((n, h) => n + h.stars, 0);
  const path = paths.author(author.username);
  const crumbs = [
    { label: 'Home', href: paths.home() },
    { label: 'Games', href: paths.hub() },
    { label: author.username, href: path },
  ];
  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'ProfilePage',
            url: absoluteUrl(path),
            mainEntity: {
              '@type': 'Person',
              name: author.username,
              url: absoluteUrl(path),
              interactionStatistic: {
                '@type': 'InteractionCounter',
                interactionType: 'https://schema.org/WriteAction',
                userInteractionCount: author.handlers.length,
              },
            },
          },
          breadcrumbJsonLd(crumbs),
        ]}
      />
      <section className="pane hub-profile" aria-labelledby="author-title">
        <span className="hub-avatar" aria-hidden="true">
          {initial(author.username)}
        </span>
        <div>
          <Breadcrumbs items={crumbs} />
          <p className="hub-eyebrow mt-4">Handler author</p>
          <h1 className="h1" id="author-title">
            {author.username}
          </h1>
          <div className="hub-stats">
            <Stat
              value={author.handlers.length}
              label={author.handlers.length === 1 ? 'handler' : 'handlers'}
            />
            <Stat value={formatCount(downloads)} label="downloads" />
            <Stat value={formatCount(stars)} label="stars" />
            <Stat value={<DateTime value={author.joinedAt} />} label="joined" />
          </div>
        </div>
      </section>
      <section className="pane hub-section" aria-labelledby="author-handlers">
        <h2 className="h2" id="author-handlers">
          Games by {author.username}
        </h2>
        {author.handlers.length > 0 ? (
          <Shelf handlers={author.handlers} primaryIds={primaryIds} eagerCount={6} />
        ) : (
          <EmptyState
            icon="library"
            title="No public handler yet"
            action={<LinkButton href={paths.hub()}>Browse all games</LinkButton>}
          >
            <p>{author.username} has not published a handler on the hub yet.</p>
          </EmptyState>
        )}
      </section>
    </>
  );
}
