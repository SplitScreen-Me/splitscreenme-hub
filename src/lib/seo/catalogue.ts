import { absoluteUrl } from '../urls';

/**
 * SEO builders of the catalogue, genre and author pages (docs/ARCHITECTURE.md section 7).
 */

export interface ListedItem {
  name: string;
  /** root-relative path of the item's page */
  path: string;
}

/** CollectionPage whose main entity is the ItemList of the items shown on this page. */
export function collectionPageJsonLd(opts: {
  name: string;
  description: string;
  path: string;
  items: ListedItem[];
  /** position of the first item (page offset + 1) */
  startPosition?: number;
}) {
  const start = opts.startPosition ?? 1;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.items.length,
      itemListElement: opts.items.map((it, i) => ({
        '@type': 'ListItem',
        position: start + i,
        name: it.name,
        url: absoluteUrl(it.path),
      })),
    },
  };
}

/** "1,234" */
export const formatInt = (n: number) => n.toLocaleString('en-US');

/** "600+" style rounded-down count for copy ("Browse 800+ games"). */
export function roundedCount(n: number): string {
  if (n < 20) return String(n);
  const step = n < 200 ? 10 : n < 2000 ? 50 : 500;
  return `${Math.floor(n / step) * step}+`;
}
