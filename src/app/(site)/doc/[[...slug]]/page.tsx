import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsShell, PrevNext } from '@/components/docs/DocsShell';
import { loadDoc, neighbours } from '@/components/docs/load';
import { OnThisPage } from '@/components/docs/OnThisPage';
import { JsonLd } from '@/components/seo/JsonLd';
import { Breadcrumbs, DateTime, type Crumb } from '@/components/ui';
import { docArticleJsonLd, docTitle } from '@/lib/seo/docs';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';

/**
 * Docs: one MDX file per nav entry, compiled at build by @next/mdx and loaded per request (no
 * generateStaticParams: pages are dynamic because of the CSP nonce). The nav (src/content/docs/nav.ts) drives
 * the sidebar, breadcrumbs and prev/next; headings for "On this page" are read from the compiled MDX.
 */
type Props = { params: Promise<{ slug?: string[] }> };

const slugOf = (parts: string[] | undefined) => (parts ?? []).join('/');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = slugOf((await params).slug);
  const doc = await loadDoc(slug);
  if (!doc) return {};
  return buildMetadata({
    title: docTitle(doc.meta.title, slug),
    description: doc.meta.description || undefined,
    path: paths.doc(slug),
    type: 'article',
  });
}

export default async function DocPage({ params }: Props) {
  const slug = slugOf((await params).slug);
  const doc = await loadDoc(slug);
  if (!doc) notFound();
  const { meta, Content, tree, section } = doc;
  const { prev, next } = neighbours(slug);

  const crumbs: Crumb[] = [{ label: 'Home', href: '/' }, { label: 'Docs', href: paths.doc() }];
  if (slug !== '') {
    if (section !== 'Overview' && section !== meta.title) crumbs.push({ label: section });
    crumbs.push({ label: meta.title });
  }
  // Only linked crumbs go in the JSON-LD trail, plus the page itself.
  const trail = [...crumbs.filter((c) => c.href), ...(slug !== '' ? [{ label: meta.title, href: paths.doc(slug) }] : [])];

  return (
    <DocsShell
      current={slug}
      currentTitle={slug === '' ? 'Documentation' : meta.title}
      rail={tree.headings.length > 1 ? <OnThisPage headings={tree.headings} variant="rail" /> : undefined}
    >
      <JsonLd
        data={[
          docArticleJsonLd({ title: meta.title, description: meta.description, path: paths.doc(slug), updated: meta.updated, section }),
          breadcrumbJsonLd(trail),
        ]}
      />
      <article className="pane doc-article">
        <header className="doc-head">
          {slug !== '' && <Breadcrumbs items={crumbs.slice(1)} />}
          <h1 className={slug === '' ? 'display doc-title' : 'h1 doc-title'}>{meta.title}</h1>
          {meta.description && <p className="lede doc-lede">{meta.description}</p>}
        </header>
        {tree.headings.length > 1 && <OnThisPage headings={tree.headings} variant="inline" />}
        <div className="doc-prose prose prose-invert prose-bezel max-w-none">
          <Content />
        </div>
        <footer className="doc-foot">
          {meta.updated && (
            <p className="small faint">
              Updated <DateTime value={`${meta.updated}T00:00:00Z`} />
            </p>
          )}
          <PrevNext prev={prev} next={next} />
        </footer>
      </article>
    </DocsShell>
  );
}
