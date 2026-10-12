/**
 * Catalogue URL state (`/hub?q=&players=&input=&verified=&sort=&page=`): parsing and clean URLs. Shared by
 * the server pages and the client form, so no server-only imports here. Same parameter names and values as
 * GET /api/v3/handlers.
 */

export type PlayersValue = '2' | '3-4' | '5-8' | '9+';
export type InputValue = 'controllers' | 'keyboardMouse' | 'multiKeyboardMouse';
export type SortValue = 'trending' | 'downloads' | 'updated' | 'newest' | 'az' | 'stars';

export interface CatalogueQuery {
  q: string;
  players: PlayersValue | null;
  inputs: InputValue[];
  verified: boolean;
  sort: SortValue;
  page: number;
}

export const PAGE_SIZE = 48;
export const MAX_PAGE = 500;
export const Q_MAX = 100;

export const PLAYER_OPTIONS: { value: PlayersValue; label: string; long: string }[] = [
  { value: '2', label: '2', long: '2 players' },
  { value: '3-4', label: '3–4', long: '3 to 4 players' },
  { value: '5-8', label: '5–8', long: '5 to 8 players' },
  { value: '9+', label: '9+', long: '9 players or more' },
];

export const INPUT_OPTIONS: { value: InputValue; label: string; icon: 'pad' | 'kbm' | 'multi' }[] = [
  { value: 'controllers', label: 'Controllers', icon: 'pad' },
  { value: 'keyboardMouse', label: 'Keyboard and mouse', icon: 'kbm' },
  { value: 'multiKeyboardMouse', label: 'Several keyboards and mice', icon: 'multi' },
];

export const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'trending', label: 'Popular now' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'newest', label: 'Newest' },
  { value: 'az', label: 'Name (A–Z)' },
  { value: 'stars', label: 'Most starred' },
];

export const DEFAULT_QUERY: CatalogueQuery = {
  q: '',
  players: null,
  inputs: [],
  verified: false,
  sort: 'trending',
  page: 1,
};

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

const all = (raw: RawParams, key: string): string[] => {
  if (raw instanceof URLSearchParams) return raw.getAll(key);
  const v = raw[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
};
const first = (raw: RawParams, key: string) => all(raw, key)[0];

/** Lenient parse: unknown values fall back to the defaults (a bad link still shows the catalogue). */
export function parseCatalogueQuery(raw: RawParams): CatalogueQuery {
  const q = (first(raw, 'q') ?? '').replace(/\s+/g, ' ').trim().slice(0, Q_MAX);
  const players = first(raw, 'players');
  const inputs = new Set(all(raw, 'input'));
  const sort = first(raw, 'sort');
  const verified = first(raw, 'verified');
  const page = Number.parseInt(first(raw, 'page') ?? '', 10);
  return {
    q,
    players: PLAYER_OPTIONS.some((o) => o.value === players) ? (players as PlayersValue) : null,
    inputs: INPUT_OPTIONS.map((o) => o.value).filter((v) => inputs.has(v)),
    verified: verified === '1' || verified === 'true',
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as SortValue) : 'trending',
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** Query string without defaults, in a stable order ("" when everything is default). */
export function catalogueSearch(query: Partial<CatalogueQuery>): string {
  const p = new URLSearchParams();
  if (query.q) p.set('q', query.q);
  if (query.players) p.set('players', query.players);
  for (const i of INPUT_OPTIONS) if (query.inputs?.includes(i.value)) p.append('input', i.value);
  if (query.verified) p.set('verified', '1');
  if (query.sort && query.sort !== 'trending') p.set('sort', query.sort);
  if (query.page && query.page > 1) p.set('page', String(query.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** `base` + clean query; `patch` overrides fields of `query` (and resets the page unless it sets one). */
export function catalogueHref(base: string, query: CatalogueQuery, patch: Partial<CatalogueQuery> = {}) {
  const next = { ...query, page: 1, ...patch };
  return `${base}${catalogueSearch(next)}`;
}

/** Any filter, search or non-default sort: such variants are `noindex,follow` with the base canonical. */
export const isRefined = (q: CatalogueQuery) =>
  !!q.q || !!q.players || q.inputs.length > 0 || q.verified || q.sort !== 'trending';
