import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/**
 * Player colours (--p1..--p8) mean a player, a slot or a device: never decoration, never status.
 * `player` is 1-based, in join order; beyond 8 the colours repeat.
 */
export const PLAYER_NAMES = ['ember', 'azure', 'sun', 'mint', 'pink', 'violet', 'teal', 'lime'] as const;

const slot = (player: number) => (((player - 1) % 8) + 8) % 8;
export const playerVar = (player: number) => `var(--p${slot(player) + 1})`;
const pc = (player: number) => ({ '--pc': playerVar(player) }) as CSSProperties;

/** Player LED: the light a device shows when it belongs to someone. */
export function PlayerDot({
  player,
  live,
  className,
}: {
  player: number;
  live?: boolean;
  className?: string;
}) {
  return <span className={cn('led', live && 'is-live', className)} style={pc(player)} aria-hidden="true" />;
}

/** "P1" tag, filled or outlined. */
export function PlayerTag({
  player,
  outline,
  className,
}: {
  player: number;
  outline?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('ptag', outline && 'is-outline', className)} style={pc(player)}>
      P{player}
    </span>
  );
}

/** A row of N player swatches: "up to N players" at a glance. */
export function PlayerBar({
  count,
  max = 8,
  className,
}: {
  count: number;
  max?: number;
  className?: string;
}) {
  const shown = Math.min(count, max);
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      role="img"
      aria-label={`Up to ${count} players`}
    >
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="h-2 w-4 rounded-sm" style={{ background: playerVar(i + 1) }} />
      ))}
      {count > max && <span className="micro faint ml-1">+{count - max}</span>}
    </span>
  );
}
