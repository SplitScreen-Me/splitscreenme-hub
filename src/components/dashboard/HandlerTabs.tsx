import Link from 'next/link';
import { cn } from '@/lib/cn';
import { paths } from '@/lib/urls';

/** Details / Versions tabs of a dashboard handler (real links: each tab is a page). */
export function HandlerTabs({ handlerId, current }: { handlerId: string; current: 'details' | 'versions' }) {
  const base = paths.dashboardHandler(handlerId);
  const tabs = [
    { key: 'details', href: base, label: 'Details and stats' },
    { key: 'versions', href: `${base}/versions`, label: 'Versions' },
  ] as const;
  return (
    <nav aria-label="Handler sections" className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? 'page' : undefined}
          className={cn('btn btn-sm', t.key === current ? 'btn-primary' : 'btn-ghost')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
