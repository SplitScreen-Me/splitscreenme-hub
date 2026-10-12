import Link from 'next/link';

export interface Crumb {
  label: string;
  /** Omitted for the current page (last item). */
  href?: string;
}

/** Visible breadcrumbs. The matching BreadcrumbList JSON-LD comes from `breadcrumbJsonLd` in src/lib/seo. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={['breadcrumbs', className].filter(Boolean).join(' ')}>
      <ol>
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            {c.href && i < items.length - 1 ? (
              <Link href={c.href}>{c.label}</Link>
            ) : (
              <span aria-current="page">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
