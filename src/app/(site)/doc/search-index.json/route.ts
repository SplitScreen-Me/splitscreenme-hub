import { getSearchIndex } from '@/components/docs/load';

/**
 * The docs search index, fetched by the search box on first use. Built from the compiled MDX at build time
 * (force-static): it changes only with a deploy.
 */
export const dynamic = 'force-static';

export async function GET() {
  const index = await getSearchIndex();
  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'noindex',
    },
  });
}
