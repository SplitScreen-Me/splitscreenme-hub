import Link from 'next/link';
import type { MDXComponents, MDXContent } from 'mdx/types';
import type { ReactNode } from 'react';
import { Breadcrumbs, DateTime } from '@/components/ui';
import { paths } from '@/lib/urls';
import { walkDoc, walkerComponents } from './doc-tree';
import { OnThisPage } from './OnThisPage';
import './docs.css';

export interface LegalMeta {
  title: string;
  description: string;
  updated: string;
}

const PAGES = [
  { slug: 'privacy', title: 'Privacy policy' },
  { slug: 'terms', title: 'Terms and content rules' },
  { slug: 'notice', title: 'Legal notice' },
] as const;

/** A value the site owner still has to provide (publisher, host, contact): shown, so it can't be missed. */
export function Placeholder({ children }: { children?: ReactNode }) {
  return <mark className="legal-todo">[to complete: {children}]</mark>;
}

/** Privacy, terms, legal notice: one MDX file each (src/content/legal), in the docs reading layout. */
export function LegalPage({
  slug,
  meta,
  Content,
}: {
  slug: (typeof PAGES)[number]['slug'];
  meta: LegalMeta;
  Content: MDXContent;
}) {
  const { headings } = walkDoc(
    Content({ components: { ...walkerComponents, Placeholder: walkerComponents.Kbd } as MDXComponents }),
  );
  return (
    <div className={headings.length > 1 ? 'docs legal has-rail' : 'docs legal'}>
      <nav className="pane docs-side doc-nav" aria-label="Legal pages">
        <p className="doc-side-title">Legal</p>
        <ul>
          {PAGES.map((p) => (
            <li key={p.slug}>
              <Link href={paths.legal(p.slug)} aria-current={p.slug === slug ? 'page' : undefined}>
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="docs-main">
        <article className="pane doc-article">
          <header className="doc-head">
            <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Legal' }, { label: meta.title }]} />
            <h1 className="h1 doc-title">{meta.title}</h1>
            <p className="lede doc-lede">{meta.description}</p>
          </header>
          {headings.length > 1 && <OnThisPage headings={headings} variant="inline" />}
          <div className="doc-prose prose prose-invert prose-bezel max-w-none">
            <Content components={{ Placeholder }} />
          </div>
          <footer className="doc-foot">
            <p className="small faint">
              Last updated <DateTime value={`${meta.updated}T00:00:00Z`} />
            </p>
          </footer>
        </article>
      </div>
      {headings.length > 1 && (
        <aside className="pane docs-rail">
          <OnThisPage headings={headings} variant="rail" />
        </aside>
      )}
    </div>
  );
}
