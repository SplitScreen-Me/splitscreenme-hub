import type { CSSProperties } from 'react';
import { PlayerTag } from '@/components/ui';
import { igdbImageUrl, steamHeroUrl } from '@/lib/urls';
import type { Screenshot } from '@/server/public/types';
import './hub.css';

/** Background crops of the same art, one per view, so the split reads as several players' screens. */
const WIDE_VIEWS: [string, string][] = [
  ['cover', '50% 45%'],
  ['250%', '12% 35%'],
  ['270%', '88% 40%'],
  ['185%', '30% 70%'],
];
const PORTRAIT_VIEWS: [string, string][] = [
  ['cover', '50% 22%'],
  ['cover', '50% 55%'],
  ['190%', '30% 40%'],
  ['210%', '70% 65%'],
];

/** Best wide art for a game: an IGDB screenshot, the Steam library hero, else the portrait cover. */
export function heroArt(game: {
  screenshots: Screenshot[];
  steamAppId: number | null;
  coverImageId: string | null;
}): { url: string; wide: boolean } | null {
  const shot = game.screenshots[0];
  if (shot) return { url: igdbImageUrl(shot.imageId, 't_1080p'), wide: true };
  if (game.steamAppId) return { url: steamHeroUrl(game.steamAppId), wide: true };
  if (game.coverImageId) return { url: igdbImageUrl(game.coverImageId, 't_1080p'), wide: false };
  return null;
}

/** The game as it will look, split the way Nucleus tiles it for its players (up to four views shown). */
export function SplitHero({
  gameName,
  maxPlayers,
  art,
}: {
  gameName: string;
  maxPlayers: number;
  art: { url: string; wide: boolean } | null;
}) {
  const seats = Math.max(2, Math.min(maxPlayers, 4));
  const layout = seats === 2 ? 'two' : seats === 3 ? 'three' : 'four';
  const views = (art?.wide === false ? PORTRAIT_VIEWS : WIDE_VIEWS).slice(0, seats);
  return (
    <div
      className="hub-screen"
      data-layout={layout}
      role="img"
      aria-label={`${gameName} split into ${seats} player views, the way Nucleus Co-op arranges the windows`}
    >
      {views.map(([size, pos], i) => {
        const style: CSSProperties = art
          ? { backgroundImage: `url("${art.url}")`, backgroundSize: size, backgroundPosition: pos }
          : {};
        return (
          <div key={i} className="hub-view" style={style}>
            <PlayerTag player={i + 1} />
            {i === seats - 1 && maxPlayers > 4 && (
              <span className="hub-screen-note">+{maxPlayers - 4} more players</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
