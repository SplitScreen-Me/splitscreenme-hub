import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { gameCrumbs } from '@/components/hub/crumbs';
import { HandlerView } from '@/components/hub/HandlerView';
import { JsonLd } from '@/components/seo/JsonLd';
import { getCurrentUser } from '@/lib/auth/current-user';
import { handlerMetaDescription, handlerPageTitle, howToJsonLd, howToSteps } from '@/lib/seo/game';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { LEGACY_ID, loadHandlerPage, parseCommentsCursor } from '@/server/hub';
import { getGameBySlug, getHandler, getViewerStars } from '@/server/public';

type Props = {
  params: Promise<{ slug: string; handlerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The listed handler of this URL. The primary handler of a game lives on the game page (308 there), and
 * a handler reached under another game's slug moves to its own (308).
 */
async function handlerOr404(slug: string, handlerId: string) {
  if (!LEGACY_ID.test(handlerId)) notFound();
  const h = await getHandler(handlerId);
  if (!h) notFound();
  if (h.isPrimary) permanentRedirect(paths.game(h.gameSlug));
  if (h.gameSlug !== slug) permanentRedirect(paths.handler(h.gameSlug, h.id));
  return h;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, handlerId } = await params;
  const h = LEGACY_ID.test(handlerId) ? await getHandler(handlerId) : null;
  if (!h || h.isPrimary || h.gameSlug !== slug) return {};
  return buildMetadata({
    title: handlerPageTitle(h.title, h.gameName),
    description: handlerMetaDescription(h),
    path: paths.handler(h.gameSlug, h.id),
    type: 'article',
  });
}

/** A non-primary handler of a game, in full. */
export default async function HandlerPage({ params, searchParams }: Props) {
  const { slug, handlerId } = await params;
  const h = await handlerOr404(slug, handlerId);
  const lookup = await getGameBySlug(h.gameSlug);
  if (lookup?.kind !== 'game') notFound();
  const game = lookup.game;
  const commentsBefore = parseCommentsCursor((await searchParams).before);
  const [data, user] = await Promise.all([loadHandlerPage(game, h.id, { commentsBefore }), getCurrentUser()]);
  if (!data) notFound();
  const starred = user ? (await getViewerStars(user.id, [h.id])).has(h.id) : false;

  const pagePath = paths.handler(game.slug, h.id);
  const steps = howToSteps(data.handler);
  const crumbs = [...gameCrumbs(game), { label: h.title, href: pagePath }];
  return (
    <>
      <JsonLd data={[howToJsonLd(game.name, steps, pagePath), breadcrumbJsonLd(crumbs)]} />
      <HandlerView
        data={data}
        mode="handler"
        pagePath={pagePath}
        steps={steps}
        crumbs={crumbs}
        starred={starred}
        commentsBefore={commentsBefore}
      />
    </>
  );
}
