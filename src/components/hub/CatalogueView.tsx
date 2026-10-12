import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, LinkButton, Pagination } from '@/components/ui';
import { cn } from '@/lib/cn';
import { COMMUNITY, paths } from '@/lib/urls';
import type { GenreCount, Page, PublicHandler } from '@/server/public/types';
import { CatalogueEnhancer } from './CatalogueEnhancer';
import {
  catalogueHref,
  INPUT_OPTIONS,
  isRefined,
  PAGE_SIZE,
  PLAYER_OPTIONS,
  SORT_OPTIONS,
  type CatalogueQuery,
} from './catalogue-query';
import { Shelf } from './GameCard';
import './hub.css';

const FORM_ID = 'hub-catalogue';
const RESULTS_ID = 'hub-results';

/**
 * The catalogue: search pane, filters, results shelf and pagination (mockup `web/games.html`). Server
 * rendered from the URL; a plain GET form that CatalogueEnhancer makes live. Used by /hub and genre pages.
 */
export function CatalogueView({
  base,
  query,
  result,
  primaryIds,
  eyebrow,
  heading,
  intro,
  genres,
  currentGenre,
  children,
}: {
  /** path of this listing: /hub or /hub/genres/<slug> */
  base: string;
  query: CatalogueQuery;
  result: Page<PublicHandler>;
  primaryIds: ReadonlySet<string>;
  eyebrow?: string;
  heading: string;
  intro: ReactNode;
  genres: GenreCount[];
  currentGenre?: string;
  /** extra content under the results (genre page text, links) */
  children?: ReactNode;
}) {
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const refined = isRefined(query);
  const activeFilters = (query.players ? 1 : 0) + query.inputs.length + (query.verified ? 1 : 0);
  const first = (query.page - 1) * PAGE_SIZE + 1;
  const last = first + result.items.length - 1;

  const tokens: { label: string; href: string }[] = [
    ...(query.q ? [{ label: `“${query.q}”`, href: catalogueHref(base, query, { q: '' }) }] : []),
    ...(query.players
      ? [
          {
            label: PLAYER_OPTIONS.find((o) => o.value === query.players)!.long,
            href: catalogueHref(base, query, { players: null }),
          },
        ]
      : []),
    ...query.inputs.map((i) => ({
      label: INPUT_OPTIONS.find((o) => o.value === i)!.label,
      href: catalogueHref(base, query, { inputs: query.inputs.filter((x) => x !== i) }),
    })),
    ...(query.verified
      ? [{ label: 'Verified only', href: catalogueHref(base, query, { verified: false }) }]
      : []),
  ];

  return (
    <>
      <section className="pane hub-cat-search" aria-labelledby="hub-cat-title">
        <div className="hub-cat-intro">
          <div>
            {eyebrow && <p className="hub-eyebrow">{eyebrow}</p>}
            <h1 id="hub-cat-title" className="h1">
              {heading}
            </h1>
          </div>
          <div className="hub-cat-lede">{intro}</div>
        </div>
        <div className="field hub-cat-field" role="search">
          <Icon name="search" />
          <input
            id="hub-q"
            type="search"
            name="q"
            form={FORM_ID}
            defaultValue={query.q}
            maxLength={100}
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Search by game or handler author"
            aria-label="Search games"
            aria-describedby="hub-res-summary"
          />
          <span className="count data" aria-hidden="true">
            {result.total.toLocaleString('en-US')} {result.total === 1 ? 'handler' : 'handlers'}
          </span>
          <button type="submit" form={FORM_ID} className="btn btn-sm">
            Search
          </button>
        </div>
        {genres.length > 0 && (
          <ul className="hub-genre-row" aria-label="Browse by genre">
            <li>
              <Link href={paths.hub()} className={cn('chip', !currentGenre && 'is-on')}>
                All games
              </Link>
            </li>
            {genres.map((g) => (
              <li key={g.slug}>
                <Link
                  href={paths.genre(g.slug)}
                  className={cn('chip', currentGenre === g.slug && 'is-on')}
                  aria-current={currentGenre === g.slug ? 'page' : undefined}
                >
                  {g.label}
                  <span className="count">{g.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="hub-cat-body">
        <form id={FORM_ID} action={base} method="get" className="pane hub-filters" aria-label="Filters">
          <details className="hub-filters-details">
            <summary className="hub-filters-toggle">
              <Icon name="filter" />
              Filters
              {activeFilters > 0 && <span className="count data">{activeFilters}</span>}
              <Icon name="chev-d" className="chev" />
            </summary>
            <div className="hub-filters-body">
              <fieldset className="hub-fgroup">
                <legend>Maximum players</legend>
                <div className="hub-seg">
                  <label>
                    <input type="radio" name="players" value="" defaultChecked={!query.players} />
                    Any
                  </label>
                  {PLAYER_OPTIONS.map((o) => (
                    <label key={o.value} title={o.long}>
                      <input
                        type="radio"
                        name="players"
                        value={o.value}
                        defaultChecked={query.players === o.value}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
                <p className="hub-hint">The most players the handler supports at once.</p>
              </fieldset>

              <fieldset className="hub-fgroup">
                <legend>Works with</legend>
                {INPUT_OPTIONS.map((o) => (
                  <label key={o.value} className="hub-check">
                    <input
                      type="checkbox"
                      name="input"
                      value={o.value}
                      defaultChecked={query.inputs.includes(o.value)}
                    />
                    <span className="box" aria-hidden="true">
                      <Icon name="check" />
                    </span>
                    <span>{o.label}</span>
                    <Icon name={o.icon} />
                  </label>
                ))}
                <p className="hub-hint">Every ticked input must be supported.</p>
              </fieldset>

              <div className="hub-fgroup">
                <label className="switch hub-switch-row">
                  <span>
                    Verified only<small>Checked by hub moderators</small>
                  </span>
                  <input type="checkbox" name="verified" value="1" defaultChecked={query.verified} />
                </label>
              </div>

              <button type="submit" className="btn btn-primary hub-apply">
                Show games
              </button>
              {refined && (
                <Link href={base} className="hub-clear">
                  Clear all filters
                </Link>
              )}
            </div>
          </details>
        </form>

        <section className="pane hub-results" id={RESULTS_ID} aria-labelledby="hub-res-summary">
          <div className="hub-res-head">
            <p className="summary" id="hub-res-summary" aria-live="polite">
              {result.total === 0 ? (
                'No handler found'
              ) : (
                <>
                  <b className="data">{result.total.toLocaleString('en-US')}</b>{' '}
                  {result.total === 1 ? 'handler' : 'handlers'}
                  {pageCount > 1 && (
                    <span className="faint">
                      {' '}
                      · {first}–{last}
                    </span>
                  )}
                </>
              )}
            </p>
            {tokens.length > 0 && (
              <ul className="hub-tokens" aria-label="Active filters">
                {tokens.map((t) => (
                  <li key={t.label}>
                    <Link href={t.href} className="hub-token" aria-label={`Remove filter: ${t.label}`}>
                      {t.label}
                      <Icon name="x" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="hub-res-tools">
              <label className="hub-sort">
                <span>Sort by</span>
                <select name="sort" form={FORM_ID} defaultValue={query.sort} aria-label="Sort games">
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {result.items.length > 0 ? (
            <Shelf
              handlers={result.items}
              primaryIds={primaryIds}
              eagerCount={query.page === 1 ? 6 : 0}
              label="Games"
            />
          ) : (
            <div className="hub-noresults">
              <div className="hub-ghost-screen" aria-hidden="true">
                <i />
                <i />
              </div>
              <h2 className="h2">No handler matches yet</h2>
              <p>
                Try fewer filters, or ask the community for this game: handler authors pick requests on
                Discord.
              </p>
              <div className="actions">
                {refined && (
                  <LinkButton href={base} variant="primary">
                    Clear filters
                  </LinkButton>
                )}
                <LinkButton href={COMMUNITY.discord} variant="ghost" icon="external">
                  Request it on Discord
                </LinkButton>
              </div>
            </div>
          )}

          {pageCount > 1 && (
            <div className="hub-pager">
              <Pagination
                page={query.page}
                pageCount={pageCount}
                href={(n) => catalogueHref(base, query, { page: n })}
                label="Catalogue pages"
              />
              <p>
                Page {query.page} of {pageCount}
              </p>
            </div>
          )}
          {children}
        </section>
      </div>
      <CatalogueEnhancer formId={FORM_ID} resultsId={RESULTS_ID} base={base} />
    </>
  );
}
