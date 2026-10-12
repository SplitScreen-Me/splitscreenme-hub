import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsShell } from '@/components/docs/DocsShell';
import { Marked } from '@/components/docs/DocsSearch';
import { getSearchIndex } from '@/components/docs/load';
import { search } from '@/components/docs/search';
import { Breadcrumbs, EmptyState, LinkButton } from '@/components/ui';
import { COMMUNITY, paths } from '@/lib/urls';

/** Server-side docs search: the no-JavaScript path of the search box, and its "Enter" fallback. */
export const metadata: Metadata = {
  title: { absolute: 'Search the docs | SplitScreen.Me' },
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function DocsSearchPage({ searchParams }: Props) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100).trim() ?? '';
  const hits = q ? search(await getSearchIndex(), q, 30, 5) : [];

  return (
    <DocsShell currentTitle="Search" query={q}>
      <article className="pane doc-article">
        <header className="doc-head">
          <Breadcrumbs items={[{ label: 'Docs', href: paths.doc() }, { label: 'Search' }]} />
          <h1 className="h1 doc-title">{q ? `Results for “${q}”` : 'Search the docs'}</h1>
          {q && (
            <p className="lede doc-lede">
              {hits.length === 0 ? 'No page matches.' : `${hits.length} section${hits.length > 1 ? 's' : ''} match.`}
            </p>
          )}
        </header>
        {q && hits.length === 0 && (
          <EmptyState
            icon="search"
            title="Nothing found"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <LinkButton href={paths.doc('troubleshooting')} icon="book">
                  Troubleshooting
                </LinkButton>
                <LinkButton href={COMMUNITY.discord} variant="ghost" icon="discord">
                  Ask on Discord
                </LinkButton>
              </div>
            }
          >
            <p>Try fewer or other words, or browse the troubleshooting pages.</p>
          </EmptyState>
        )}
        {hits.length > 0 && (
          <ol className="doc-results">
            {hits.map((hit) => (
              <li key={hit.href}>
                <Link href={hit.href}>
                  <span className="docs-search-where">
                    {hit.section} › {hit.pageTitle}
                  </span>
                  <span className="doc-results-title">
                    <Marked text={hit.heading || hit.pageTitle} words={hit.words} />
                  </span>
                  {hit.excerpt && (
                    <span className="docs-search-excerpt">
                      <Marked text={hit.excerpt} words={hit.words} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </article>
    </DocsShell>
  );
}
