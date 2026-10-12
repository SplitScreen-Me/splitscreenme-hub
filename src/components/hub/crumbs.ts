import type { Crumb } from '@/components/ui';
import { genreInfo } from '@/lib/genres';
import { paths } from '@/lib/urls';

/**
 * Home > Games > <Genre> > <Game> (section 7). Every crumb keeps its href so the BreadcrumbList JSON-LD can
 * use the same list; the Breadcrumbs component renders the last one as the current page.
 */
export function gameCrumbs(game: { name: string; slug: string; genres: readonly string[] }): Crumb[] {
  const genre = game.genres[0] ? genreInfo(game.genres[0]) : null;
  return [
    { label: 'Home', href: paths.home() },
    { label: 'Games', href: paths.hub() },
    ...(genre ? [{ label: genre.label, href: paths.genre(genre.slug) }] : []),
    { label: game.name, href: paths.game(game.slug) },
  ];
}
