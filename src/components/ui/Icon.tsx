import { cn } from '@/lib/cn';
import { ICONS, type IconName } from './icons';

export type { IconName };

/** Inline SVG icon (server-rendered, no sprite, no script). Decorative unless `label` is given. */
export function Icon({ name, className, label }: { name: IconName; className?: string; label?: string }) {
  const icon: { d: string; fill?: boolean } = ICONS[name];
  return (
    <svg
      className={cn('i', className)}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={icon.d} {...(icon.fill ? { fill: 'currentColor', stroke: 'none' } : {})} />
    </svg>
  );
}
