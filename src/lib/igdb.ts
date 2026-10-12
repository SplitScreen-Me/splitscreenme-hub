import { env, igdbEnabled } from './env';

/**
 * IGDB v4 client (Twitch client-credentials). Token cached in memory until shortly before expiry;
 * requests are spaced to stay under IGDB's 4 requests per second.
 */

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API = 'https://api.igdb.com/v4';

export class IgdbDisabledError extends Error {
  constructor() {
    super('IGDB credentials are not configured');
  }
}

export class IgdbError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

let token: { value: string; expiresAt: number } | undefined;
let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const { IGDB_CLIENT_ID, IGDB_CLIENT_SECRET } = env();
  const body = new URLSearchParams({
    client_id: IGDB_CLIENT_ID!,
    client_secret: IGDB_CLIENT_SECRET!,
    grant_type: 'client_credentials',
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new IgdbError(`IGDB token request failed (${res.status})`, res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

/** Escapes user text for an IGDB Apicalypse string literal: control chars stripped, quotes and backslashes escaped, 100 chars max. */
export function escapeIgdbString(input: string): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 100)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/** Runs one Apicalypse query on an endpoint (`games`, `genres`...). Serialised and throttled. */
export function igdbQuery<T>(endpoint: string, query: string): Promise<T[]> {
  if (!igdbEnabled()) return Promise.reject(new IgdbDisabledError());
  if (!/^[a-z_]+$/.test(endpoint)) return Promise.reject(new IgdbError('invalid endpoint'));
  const run = async (): Promise<T[]> => {
    const wait = lastRequestAt + 260 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    const res = await fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': env().IGDB_CLIENT_ID!,
        Authorization: `Bearer ${await getToken()}`,
        Accept: 'application/json',
        'Content-Type': 'text/plain',
      },
      body: query,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) token = undefined;
    if (!res.ok) throw new IgdbError(`IGDB ${endpoint} query failed (${res.status})`, res.status);
    return (await res.json()) as T[];
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

export interface IgdbGame {
  id: number;
  name: string;
  slug?: string;
  url?: string;
  summary?: string;
  first_release_date?: number;
  cover?: { image_id: string };
  genres?: { name: string }[];
  screenshots?: { image_id: string; width?: number; height?: number }[];
  external_games?: { uid?: string; external_game_source?: number }[];
}

/** IGDB external game source id of Steam. */
export const IGDB_SOURCE_STEAM = 1;

export const GAME_FIELDS =
  'fields name,slug,first_release_date,summary,url,cover.image_id,genres.name,screenshots.image_id,screenshots.width,screenshots.height,external_games.uid,external_games.external_game_source;';

export async function fetchGamesByIds(ids: number[]): Promise<IgdbGame[]> {
  const clean = ids.filter((n) => Number.isSafeInteger(n) && n > 0);
  if (clean.length === 0) return [];
  if (clean.length > 500) throw new IgdbError('at most 500 ids per request');
  return igdbQuery<IgdbGame>('games', `${GAME_FIELDS} where id = (${clean.join(',')}); limit 500;`);
}

/** Search for the "create a handler" game picker. */
export function searchGames(q: string, limit = 12): Promise<IgdbGame[]> {
  const term = escapeIgdbString(q.trim());
  if (!term) return Promise.resolve([]);
  return igdbQuery<IgdbGame>(
    'games',
    `search "${term}"; fields name,first_release_date,cover.image_id; where version_parent = null; limit ${Math.min(Math.max(limit, 1), 50)};`,
  );
}

/** Steam app id from IGDB external games, if any. */
export function steamAppIdOf(game: IgdbGame): number | null {
  const steam = game.external_games?.find((e) => e.external_game_source === IGDB_SOURCE_STEAM && e.uid);
  const n = steam?.uid ? Number(steam.uid) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export const releaseYearOf = (game: IgdbGame): number | null =>
  game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null;
