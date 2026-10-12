import { SITE_NAME } from './metadata';
import { absoluteUrl } from '../urls';

/**
 * Structured data of a docs page: TechArticle (the BreadcrumbList comes from `breadcrumbJsonLd`).
 */
export function docArticleJsonLd(doc: {
  title: string;
  description: string;
  path: string;
  updated?: string;
  section: string;
}) {
  const url = absoluteUrl(doc.path);
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: doc.title,
    description: doc.description || undefined,
    url,
    mainEntityOfPage: url,
    articleSection: doc.section,
    inLanguage: 'en',
    ...(doc.updated && /^\d{4}-\d{2}-\d{2}$/.test(doc.updated) ? { dateModified: doc.updated } : {}),
    about: { '@type': 'SoftwareApplication', name: 'Nucleus Co-op', operatingSystem: 'Windows' },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
  };
}

/** `<title>` of a docs page: "<Title> · Docs", the suffix added by buildMetadata. */
export const docTitle = (title: string, slug: string) => (slug === '' ? 'Documentation' : `${title} · Docs`);
