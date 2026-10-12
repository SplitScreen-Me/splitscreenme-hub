import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { gameCrumbs } from '@/components/hub/crumbs';
import { HandlerView } from '@/components/hub/HandlerView';
import { JsonLd } from '@/components/seo/JsonLd';
import { getCurrentUser } from '@/lib/auth/current-user';
import { gameMetaDescription, howToHeading, howToJsonLd, howToSteps, videoGameJsonLd } from '@/lib/seo/game';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { loadHandlerPage, parseCommentsCursor } from '@/server/hub';
import { getGameBySlug, getViewerStars, type PublicGame } from '@/server/public';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The public game, or a 308 to its current slug, or a 404 (unknown, or no listed handler). */
async function gameOr404(slug: string): Promise<PublicGame> {
  const lookup = await getGameBySlug(slug.toLowerCase());
  if (!lookup) notFound();
  if (lookup.kind === 'redirect') permanentRedirect(paths.game(lookup.slug));
  if (lookup.game.slug !== slug) permanentRedirect(paths.game(lookup.game.slug));
  return lookup.game;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lookup = await getGameBySlug((await params).slug.toLowerCase());
  if (lookup?.kind !== 'game') return {};
  const { game } = lookup;
  const primary = game.handlers[0]!;
  return buildMetadata({
    title: howToHeading(game.name),
    description: gameMetaDescription(primary),
    path: paths.game(game.slug),
    type: 'article',
  });
}

/** Game page: "How to play <Game> split screen on PC", rendering the primary handler in full. */
export default async function GamePage({ params, searchParams }: Props) {
  const game = await gameOr404((await params).slug);
  const commentsBefore = parseCommentsCursor((await searchParams).before);
  const [data, user] = await Promise.all([
    loadHandlerPage(game, game.primaryHandlerId, { commentsBefore }),
    getCurrentUser(),
  ]);
  if (!data) notFound();
  const starred = user ? (await getViewerStars(user.id, [data.handler.id])).has(data.handler.id) : false;

  const pagePath = paths.game(game.slug);
  const steps = howToSteps(data.handler);
  const crumbs = gameCrumbs(game);
  return (
    <>
      <JsonLd
        data={[
          videoGameJsonLd(game, data.handler, gameMetaDescription(data.handler)),
          howToJsonLd(game.name, steps, pagePath),
          breadcrumbJsonLd(crumbs),
        ]}
      />
      <HandlerView
        data={data}
        mode="game"
        pagePath={pagePath}
        steps={steps}
        crumbs={crumbs}
        starred={starred}
        commentsBefore={commentsBefore}
      />
    </>
  );
}
