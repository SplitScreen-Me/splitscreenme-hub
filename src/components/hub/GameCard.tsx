import Link from 'next/link';
import { CoverImage, Icon, formatCount } from '@/components/ui';
import { cn } from '@/lib/cn';
import { paths } from '@/lib/urls';
import type { PublicHandler } from '@/server/public/types';
import { InputIcons, Pips } from './Pips';
import { handlerVariant } from './variant';
import './hub.css';

/** Where a card links: the game page for the primary handler, the handler page otherwise. */
export const handlerHref = (h: Pick<PublicHandler, 'id' | 'gameSlug'>, primaryIds: ReadonlySet<string>) =>
  paths.handler(h.gameSlug, h.id, primaryIds.has(h.id));

/** A game on the shelf: cover, game name (+ handler variant), author, downloads, players, inputs. */
export function GameCard({
  handler: h,
  href,
  eager,
  headingLevel = 3,
}: {
  handler: PublicHandler;
  href: string;
  /** above the fold: load the cover eagerly */
  eager?: boolean;
  headingLevel?: 2 | 3;
}) {
  const variant = handlerVariant(h.title, h.gameName);
  const H = `h${headingLevel}` as const;
  return (
    <Link className="hub-card" href={href}>
      <div className="relative">
        <CoverImage imageId={h.coverImageId} alt={h.gameName} priority={eager} />
        {h.verified && (
          <span className="hub-seal" title="Verified handler">
            <Icon name="seal" label="Verified handler" />
          </span>
        )}
      </div>
      <div className="hub-card-body">
        <H className="hub-card-title">
          {h.gameName}
          {variant && <span className="hub-card-variant"> {variant}</span>}
        </H>
        <div className="hub-card-row">
          <span className="hub-card-by">{h.authorName}</span>
          <span className="hub-dl" title={`${h.downloads.toLocaleString('en-US')} downloads`}>
            <Icon name="download" />
            <span className="data">{formatCount(h.downloads)}</span>
            <span className="sr-only"> downloads</span>
          </span>
        </div>
        <div className="hub-card-row">
          <Pips count={h.maxPlayers} />
          <InputIcons inputs={h.inputs} />
        </div>
      </div>
    </Link>
  );
}

/** A shelf of game cards (real links, crawlable). */
export function Shelf({
  handlers,
  primaryIds,
  eagerCount = 0,
  className,
  label,
}: {
  handlers: PublicHandler[];
  primaryIds: ReadonlySet<string>;
  /** how many covers to load eagerly (above the fold) */
  eagerCount?: number;
  className?: string;
  label?: string;
}) {
  return (
    <ul className={cn('hub-shelf', className)} aria-label={label}>
      {handlers.map((h, i) => (
        <li key={h.id}>
          <GameCard handler={h} href={handlerHref(h, primaryIds)} eager={i < eagerCount} />
        </li>
      ))}
    </ul>
  );
}
