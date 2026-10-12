import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

/** A small pill: genre, fact, filter value. Links when `href` is given. */
export function Tag({
  href,
  icon,
  className,
  children,
}: {
  href?: string;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}) {
  const content = (
    <>
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={cn('tag', className)}>
      {content}
    </Link>
  ) : (
    <span className={cn('tag', className)}>{content}</span>
  );
}

export type BadgeTone = 'neutral' | 'verified' | 'ok' | 'warn' | 'danger';

/** Status badge: icon + words first, tint second (never a player colour). */
export function Badge({
  tone = 'neutral',
  icon,
  className,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'badge',
        tone === 'verified' && 'badge-verified',
        tone === 'ok' && 'badge-ok',
        tone === 'warn' && 'badge-warn',
        tone === 'danger' && 'badge-danger',
        className,
      )}
    >
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

/** "Verified" seal for a handler version checked by a moderator, or the clear "Unverified" state. */
export function VerifiedBadge({ verified, className }: { verified: boolean; className?: string }) {
  return verified ? (
    <Badge tone="verified" icon="seal" className={className}>
      Verified
    </Badge>
  ) : (
    <Badge tone="warn" icon="warning" className={className}>
      Unverified
    </Badge>
  );
}
