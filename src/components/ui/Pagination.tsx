import Link from 'next/link';
import { Icon } from './Icon';

/** Pages to show: first, last, current ±1, with gaps. */
export function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  const keep = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/** Real `<a href>` links (crawlable, works without JS). `href(n)` builds the URL of page n. */
export function Pagination({
  page,
  pageCount,
  href,
  label = 'Pages',
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
  label?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pagination" aria-label={label}>
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev" aria-label="Previous page">
          <Icon name="chev-l" className="h-4 w-4" />
        </Link>
      )}
      {pageWindow(page, pageCount).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="gap" aria-hidden="true">
            …
          </span>
        ) : p === page ? (
          <span key={p} aria-current="page">
            {p}
          </span>
        ) : (
          <Link key={p} href={href(p)}>
            {p}
          </Link>
        ),
      )}
      {page < pageCount && (
        <Link href={href(page + 1)} rel="next" aria-label="Next page">
          <Icon name="chev-r" className="h-4 w-4" />
        </Link>
      )}
    </nav>
  );
}
