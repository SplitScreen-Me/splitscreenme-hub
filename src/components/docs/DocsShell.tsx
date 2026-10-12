import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { docsNav, type DocPage } from '@/content/docs/nav';
import { cn } from '@/lib/cn';
import { COMMUNITY, paths } from '@/lib/urls';
import { DocsSearch } from './DocsSearch';
import './docs.css';

function NavList({ current }: { current?: string }) {
  return (
    <nav aria-label="Documentation" className="doc-nav">
      {docsNav.map((section) => (
        <div key={section.title} className="doc-nav-group">
          {section.title !== 'Overview' && <p className="doc-side-title">{section.title}</p>}
          <ul>
            {section.pages.map((p) => (
              <li key={p.slug}>
                <Link href={paths.doc(p.slug)} aria-current={p.slug === current ? 'page' : undefined}>
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * The docs frame: the sidebar pane (search + nav), the article pane, and an optional right rail.
 * On narrow screens the nav folds into a disclosure above the article (no JavaScript needed).
 */
export function DocsShell({
  current,
  currentTitle,
  query,
  rail,
  children,
}: {
  current?: string;
  currentTitle?: string;
  /** search box value (the search page) */
  query?: string;
  rail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn('docs', rail ? 'has-rail' : undefined)}>
      <aside className="pane docs-side" aria-label="Documentation menu">
        <DocsSearch initial={query} />
        <NavList current={current} />
        <div className="doc-side-help">
          <p>Stuck? The community answers fast.</p>
          <a href={COMMUNITY.discord} rel="noopener">
            <Icon name="discord" /> Ask on Discord
          </a>
        </div>
      </aside>
      <details className="pane docs-mobile-nav">
        <summary>
          <Icon name="book" />
          <span>{currentTitle ?? 'Documentation'}</span>
          <Icon name="chev-d" className="docs-mobile-chev" />
        </summary>
        <div className="docs-mobile-body">
          <DocsSearch />
          <NavList current={current} />
        </div>
      </details>
      <div className="docs-main">{children}</div>
      {rail && <aside className="pane docs-rail">{rail}</aside>}
    </div>
  );
}

export function PrevNext({ prev, next }: { prev?: DocPage; next?: DocPage }) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="Previous and next page" className="doc-pager">
      {prev ? (
        <Link href={paths.doc(prev.slug)} rel="prev" className="doc-pager-link">
          <span className="doc-pager-dir">
            <Icon name="chev-l" /> Previous
          </span>
          <span className="doc-pager-title">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={paths.doc(next.slug)} rel="next" className="doc-pager-link is-next">
          <span className="doc-pager-dir">
            Next <Icon name="chev-r" />
          </span>
          <span className="doc-pager-title">{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
