import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui';
import type { Inputs } from '@/server/public/types';
import './hub.css';

/** One light per seat, in join order (player colours mean players): "up to N players" at a glance. */
export function Pips({ count, large, className }: { count: number; large?: boolean; className?: string }) {
  const shown = Math.max(1, Math.min(count, 8));
  return (
    <span
      className={cn('hub-pips', large && 'is-large', className)}
      role="img"
      aria-label={count === 1 ? '1 player' : `Up to ${count} players`}
    >
      {Array.from({ length: shown }, (_, i) => (
        <i key={i} className={`p${i + 1}`} />
      ))}
      <b className="data">{count}</b>
    </span>
  );
}

const INPUTS = [
  { key: 'controllers', icon: 'pad', label: 'Controllers' },
  { key: 'keyboardMouse', icon: 'kbm', label: 'Keyboard and mouse' },
  { key: 'multiKeyboardMouse', icon: 'multi', label: 'Several keyboards and mice' },
] as const;

/** Controller, keyboard and mouse, several keyboards and mice: lit when supported. */
export function InputIcons({ inputs, className }: { inputs: Inputs; className?: string }) {
  const on = INPUTS.filter((i) => inputs[i.key]).map((i) => i.label.toLowerCase());
  const label = on.length ? `Plays with ${on.join(', ')}` : 'Input support unknown';
  return (
    <span className={cn('inputs', className)} role="img" aria-label={label}>
      {INPUTS.map((i) => (
        <span key={i.key} title={inputs[i.key] ? i.label : `${i.label}: not supported`}>
          <Icon name={i.icon} className={inputs[i.key] ? undefined : 'is-off'} />
        </span>
      ))}
    </span>
  );
}
