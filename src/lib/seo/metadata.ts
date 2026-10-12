import type { Metadata } from 'next';
import { absoluteUrl } from '../urls';

/**
 * Page metadata. Canonicals are absolute (SITE_URL); the global NOINDEX flag is applied once in the root
 * layout, `noindex` here is for pages that are never indexed (accounts, backoffice, filtered lists...).
 * Game, catalogue, docs and landing builders live next to this file (owners a and d).
 *
 * buildMetadata reads SITE_URL: call it from `generateMetadata`, never in a static `metadata` export
 * (that one is evaluated at build time, without the runtime environment).
 */
export const SITE_NAME = 'SplitScreen.Me';
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;

export interface PageMeta {
  title: string;
  description?: string;
  /** Canonical path, e.g. /hub/minecraft. Omit for pages without a canonical. */
  path?: string;
  /** Never index this page (it can still be followed unless `nofollow`). */
  noindex?: boolean;
  nofollow?: boolean;
  /** Absolute or root-relative image URLs for Open Graph (1200x630). */
  images?: string[];
  /** Keep the title as is (no " | SplitScreen.Me" suffix), e.g. when it would exceed 60 chars. */
  absoluteTitle?: boolean;
  type?: 'website' | 'article';
}

/** `<title>` with the suffix, dropped when the whole would exceed 60 characters. */
export function pageTitle(title: string): string {
  return title.length + TITLE_SUFFIX.length > 60 ? title : `${title}${TITLE_SUFFIX}`;
}

export function buildMetadata(meta: PageMeta): Metadata {
  const title = meta.absoluteTitle ? meta.title : pageTitle(meta.title);
  const url = meta.path ? absoluteUrl(meta.path) : undefined;
  // Keys are only set when they have a value. In Next's metadata merge a key that is present but undefined
  // still counts: `robots` would drop the root layout's NOINDEX robots, and `images` would hide the
  // file-based opengraph-image of the route.
  const images = meta.images ? { images: meta.images } : {};
  return {
    title: { absolute: title },
    description: meta.description,
    alternates: url ? { canonical: url } : undefined,
    ...((meta.noindex || meta.nofollow) && { robots: { index: !meta.noindex, follow: !meta.nofollow } }),
    openGraph: {
      title,
      description: meta.description,
      url,
      siteName: SITE_NAME,
      type: meta.type ?? 'website',
      ...images,
    },
    twitter: { card: 'summary_large_image', title, description: meta.description, ...images },
  };
}

/** Metadata of pages that are never indexed (stubs, accounts, backoffice). */
export const privatePageMetadata = (title: string): Metadata => ({
  title: { absolute: pageTitle(title) },
  robots: { index: false, follow: false },
});

/** BreadcrumbList JSON-LD for the visible breadcrumbs (paths become absolute URLs). */
export function breadcrumbJsonLd(items: { label: string; href?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href && { item: absoluteUrl(c.href) }),
    })),
  };
}
