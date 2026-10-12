'use client';

import { useEffect, useState } from 'react';
import type { DocHeading } from './doc-tree';

/**
 * "On this page": the h2/h3 of the article (read on the server from the compiled MDX), with the section in view
 * highlighted. Works as plain anchor links without JavaScript.
 */
export function OnThisPage({ headings, variant }: { headings: DocHeading[]; variant: 'rail' | 'inline' }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (variant !== 'rail' || headings.length === 0) return;
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = els.find((el) => visible.get(el.id));
        if (first) setCurrent(first.id);
      },
      { rootMargin: '0px 0px -65% 0px', threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings, variant]);

  if (headings.length === 0) return null;
  const list = (
    <ul className="doc-toc-list">
      {headings.map((h) => (
        <li key={h.id} className={h.depth === 3 ? 'is-sub' : undefined}>
          <a href={`#${h.id}`} aria-current={current === h.id ? 'location' : undefined}>
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
  if (variant === 'inline') {
    return (
      <details className="doc-toc-inline">
        <summary>On this page</summary>
        {list}
      </details>
    );
  }
  return (
    <nav aria-label="On this page" className="doc-toc">
      <p className="doc-side-title">On this page</p>
      {list}
    </nav>
  );
}
