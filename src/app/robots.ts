import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { absoluteUrl } from '@/lib/urls';

export const dynamic = 'force-dynamic';

/**
 * robots.txt (section 7). Crawling stays allowed during the beta (NOINDEX on) so engines see the
 * noindex headers; the Sitemap line only appears once indexing is on (NOINDEX=0).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/account', '/dashboard', '/admin', '/login', '/register'],
    },
    ...(env().NOINDEX ? {} : { sitemap: absoluteUrl('/sitemap.xml') }),
  };
}
