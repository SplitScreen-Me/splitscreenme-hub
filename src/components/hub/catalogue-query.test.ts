import { describe, expect, it } from 'vitest';
import {
  catalogueHref,
  catalogueSearch,
  DEFAULT_QUERY,
  isRefined,
  MAX_PAGE,
  parseCatalogueQuery,
} from './catalogue-query';
import { handlerVariant, initial } from './variant';

describe('catalogue URL state', () => {
  it('parses search params leniently', () => {
    expect(parseCatalogueQuery({})).toEqual(DEFAULT_QUERY);
    expect(
      parseCatalogueQuery({
        q: '  left   4 dead ',
        players: '3-4',
        input: ['multiKeyboardMouse', 'controllers', 'bogus'],
        verified: '1',
        sort: 'az',
        page: '3',
      }),
    ).toEqual({
      q: 'left 4 dead',
      players: '3-4',
      inputs: ['controllers', 'multiKeyboardMouse'],
      verified: true,
      sort: 'az',
      page: 3,
    });
    const bad = parseCatalogueQuery({ players: '7', sort: 'drop table', page: '-2', verified: 'yes' });
    expect(bad).toEqual(DEFAULT_QUERY);
    expect(parseCatalogueQuery({ page: '999999' }).page).toBe(MAX_PAGE);
    expect(parseCatalogueQuery({ q: 'x'.repeat(500) }).q).toHaveLength(100);
    expect(parseCatalogueQuery(new URLSearchParams('input=controllers&input=keyboardMouse')).inputs).toEqual([
      'controllers',
      'keyboardMouse',
    ]);
  });

  it('builds clean URLs (no defaults, stable order) and resets the page on filter changes', () => {
    expect(catalogueSearch(DEFAULT_QUERY)).toBe('');
    const q = parseCatalogueQuery({ sort: 'downloads', input: 'keyboardMouse', q: 'ab c', page: '4' });
    expect(catalogueSearch(q)).toBe('?q=ab+c&input=keyboardMouse&sort=downloads&page=4');
    expect(catalogueHref('/hub', q, { verified: true })).toBe(
      '/hub?q=ab+c&input=keyboardMouse&verified=1&sort=downloads',
    );
    expect(catalogueHref('/hub/genres/shooter', q, { page: 2 })).toBe(
      '/hub/genres/shooter?q=ab+c&input=keyboardMouse&sort=downloads&page=2',
    );
    // Round trip.
    expect(parseCatalogueQuery(new URLSearchParams(catalogueSearch(q)))).toEqual(q);
  });

  it('refined variants are the noindex ones; plain pagination is not', () => {
    expect(isRefined(DEFAULT_QUERY)).toBe(false);
    expect(isRefined({ ...DEFAULT_QUERY, page: 5 })).toBe(false);
    expect(isRefined({ ...DEFAULT_QUERY, sort: 'az' })).toBe(true);
    expect(isRefined({ ...DEFAULT_QUERY, q: 'x' })).toBe(true);
    expect(isRefined({ ...DEFAULT_QUERY, inputs: ['controllers'] })).toBe(true);
  });
});

describe('handler variant', () => {
  it('keeps only a meaningful suffix of the game name', () => {
    expect(handlerVariant('Call of Duty: Black Ops II Zombies', 'Call of Duty: Black Ops II')).toBe(
      'Zombies',
    );
    expect(handlerVariant('Elden Ring Seamless Co-op', 'Elden Ring')).toBe('Seamless Co-op');
    expect(handlerVariant('Portal 2', 'Portal 2')).toBe('');
    expect(handlerVariant('Portal 2 (PC)', 'Portal 2')).toBe('');
    expect(handlerVariant('Halo: The Master Chef Collection', 'Halo: The Master Chief Collection')).toBe('');
    expect(handlerVariant('Pokémon Party', 'Pokemon')).toBe('Party');
    expect(initial('  _x')).toBe('X');
    expect(initial('***')).toBe('?');
  });
});
