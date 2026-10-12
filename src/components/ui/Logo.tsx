import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * The mark: a screen split for two, and one more player about to join (top pane, bottom-left pane, and a
 * dot where the next screen will open). `color` uses the first three player colours.
 */
export function LogoMark({
  variant = 'mono',
  className,
}: {
  variant?: 'mono' | 'color';
  className?: string;
}) {
  const [a, b, c] =
    variant === 'color'
      ? ['var(--p1)', 'var(--p2)', 'var(--p3)']
      : ['currentColor', 'currentColor', 'currentColor'];
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="2" y="3" width="28" height="12.5" rx="3.4" fill={a} />
      <rect x="2" y="17.5" width="13" height="11.5" rx="3.4" fill={b} />
      <circle cx="23.5" cy="23.25" r="5.75" fill={c} />
    </svg>
  );
}

/** Mark + wordmark, linking home. */
export function Logo({ variant = 'mono', className }: { variant?: 'mono' | 'color'; className?: string }) {
  return (
    <Link className={cn('logo', className)} href="/" aria-label="SplitScreen.Me home">
      <LogoMark variant={variant} />
      <span className="wordmark">
        SplitScreen<span>.Me</span>
      </span>
    </Link>
  );
}
