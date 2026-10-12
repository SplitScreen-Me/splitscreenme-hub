import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A row of filter links (`?key=value`), the current one pressed. Works without JavaScript. */
export function FilterLinks({
  base,
  param,
  current,
  options,
  keep = {},
}: {
  base: string;
  param: string;
  current: string;
  options: { value: string; label: ReactNode }[];
  keep?: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group">
      {options.map((o) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);
        q.set(param, o.value);
        return (
          <Link
            key={o.value}
            href={`${base}?${q.toString()}`}
            aria-current={o.value === current ? 'true' : undefined}
            className={cn('btn btn-sm', o.value === current ? 'btn-primary' : 'btn-ghost')}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Previous / next page links for long lists. */
export function Pager({
  page,
  hasMore,
  href,
}: {
  page: number;
  hasMore: boolean;
  href: (p: number) => string;
}) {
  if (page <= 1 && !hasMore) return null;
  return (
    <nav aria-label="Pages" className="flex items-center gap-2">
      {page > 1 && (
        <Link href={href(page - 1)} className="btn btn-sm btn-ghost" rel="prev">
          Previous
        </Link>
      )}
      <span className="small muted">Page {page}</span>
      {hasMore && (
        <Link href={href(page + 1)} className="btn btn-sm btn-ghost" rel="next">
          Next
        </Link>
      )}
    </nav>
  );
}

export const pageParam = (v: string | undefined) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
};
