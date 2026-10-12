'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { highlight, search, type SearchHit, type SearchIndex } from './search';

export const SEARCH_INDEX_URL = '/doc/search-index.json';

/** Matched words in <mark>, built from parts (never HTML strings). */
export function Marked({ text, words }: { text: string; words: string[] }) {
  return (
    <>
      {highlight(text, words).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : part.text))}
    </>
  );
}

let shared: Promise<SearchIndex> | null = null;
function fetchIndex(): Promise<SearchIndex> {
  shared ??= fetch(SEARCH_INDEX_URL, { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : Promise.reject(new Error(String(r.status)))))
    .catch((err: unknown) => {
      shared = null;
      throw err;
    });
  return shared;
}

/**
 * Docs search box (combobox). The index is fetched on first focus and searched in the browser. Without
 * JavaScript, or with Enter on no selection, the form opens /doc/search?q= which runs the same search on the
 * server. Ctrl+K (Cmd+K) focuses it.
 */
export function DocsSearch({ autoFocus = false, initial = '' }: { autoFocus?: boolean; initial?: string }) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const load = useCallback(() => {
    if (index) return;
    fetchIndex().then(
      (ix) => {
        setIndex(ix);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hits: SearchHit[] = useMemo(() => (index && q.trim() ? search(index, q, 8) : []), [index, q]);
  const showList = open && q.trim().length >= 2;

  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    router.push(href);
  };

  return (
    <form
      action="/doc/search"
      method="get"
      role="search"
      className="docs-search"
      onSubmit={(e) => {
        const hit = hits[active];
        if (hit) {
          e.preventDefault();
          go(hit.href);
        }
      }}
    >
      <label htmlFor={`${id}-q`} className="sr-only">
        Search the docs
      </label>
      <div className="field">
        <Icon name="search" />
        <input
          ref={input}
          id={`${id}-q`}
          name="q"
          type="search"
          value={q}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search the docs"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => {
            load();
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(-1, a - 1));
            } else if (e.key === 'Escape') {
              if (q) setQ('');
              else input.current?.blur();
              setActive(-1);
            }
          }}
        />
        <kbd className="key docs-search-key" aria-hidden="true">
          Ctrl K
        </kbd>
      </div>
      {showList && (
        <div className="docs-search-panel">
          {!index && !failed && <p className="docs-search-note">Loading the index…</p>}
          {failed && <p className="docs-search-note">Search is unavailable right now. Press Enter to search anyway.</p>}
          {index && hits.length === 0 && (
            <p className="docs-search-note">
              Nothing for “{q.trim()}”. Try another word, or ask on Discord.
            </p>
          )}
          <ul id={listId} role="listbox" aria-label="Search results" className="docs-search-list">
            {hits.map((hit, i) => (
              <li
                key={hit.href}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="docs-search-hit"
                onMouseEnter={() => setActive(i)}
              >
                <Link
                  href={hit.href}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    go(hit.href);
                  }}
                >
                  <span className="docs-search-where">
                    {hit.section} › {hit.pageTitle}
                  </span>
                  <span className="docs-search-title">
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
          </ul>
          {index && hits.length > 0 && (
            <p className="docs-search-note">
              <kbd className="key">↑</kbd> <kbd className="key">↓</kbd> to move, <kbd className="key">Enter</kbd> to
              open
            </p>
          )}
        </div>
      )}
    </form>
  );
}
