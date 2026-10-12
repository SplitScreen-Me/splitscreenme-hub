import { env } from './env';

/**
 * Canonical paths and external image URLs. Paths are relative (`/hub/...`); `absoluteUrl` prefixes
 * SITE_URL for canonicals, sitemaps, API payloads and emails. Nothing here hardcodes a host.
 */

const enc = encodeURIComponent;

export const paths = {
  home: () => '/',
  download: () => '/download',
  hub: () => '/hub',
  hubSearch: (q: string) => `/hub?q=${enc(q)}`,
  genre: (genreSlug: string) => `/hub/genres/${enc(genreSlug)}`,
  author: (username: string) => `/hub/authors/${enc(username)}`,
  game: (gameSlug: string) => `/hub/${enc(gameSlug)}`,
  /** The primary handler of a game lives on the game page itself. */
  handler: (gameSlug: string, handlerId: string, isPrimary = false) =>
    isPrimary ? `/hub/${enc(gameSlug)}` : `/hub/${enc(gameSlug)}/${enc(handlerId)}`,
  versions: (gameSlug: string, handlerId: string) => `/hub/${enc(gameSlug)}/${enc(handlerId)}/versions`,
  version: (gameSlug: string, handlerId: string, version: number) =>
    `/hub/${enc(gameSlug)}/${enc(handlerId)}/versions/${version}`,
  doc: (slug = '') => (slug ? `/doc/${slug}` : '/doc'),
  legal: (page: 'privacy' | 'terms' | 'notice') => `/legal/${page}`,
  login: (next?: string) => (next ? `/login?next=${enc(next)}` : '/login'),
  register: () => '/register',
  account: () => '/account',
  dashboard: () => '/dashboard',
  dashboardHandler: (handlerId: string) => `/dashboard/handlers/${enc(handlerId)}`,
  admin: () => '/admin',
  apiDocs: () => '/api/v3/docs',
  openApi: () => '/api/v3/openapi.json',
} as const;

/** `${SITE_URL}${path}` */
export function absoluteUrl(path: string): string {
  return `${env().SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export const apiBase = () => `${env().SITE_URL}/api/v3`;

/** Public download URL of a handler package (counted unless `count=false`). */
export function apiDownloadUrl(handlerId: string, version?: number): string {
  const q = version === undefined ? '' : `?version=${version}`;
  return `${apiBase()}/handlers/${enc(handlerId)}/download${q}`;
}

const SAME_SITE_BASE = 'https://same-site.invalid';
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/**
 * Only redirect targets inside the site. A prefix check is not enough: URL parsers drop tabs and newlines
 * (`/\t/evil.com` becomes `//evil.com`) and read `\` as `/`, so control characters and backslashes are
 * refused outright, then the path is resolved against a fixed origin and must stay on it.
 */
export function safeNextPath(next: unknown, fallback = '/'): string {
  if (typeof next !== 'string' || !next.startsWith('/') || CONTROL_OR_BACKSLASH.test(next)) return fallback;
  let url: URL;
  try {
    url = new URL(next, SAME_SITE_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== SAME_SITE_BASE) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  // `/.//evil.com` normalises to `//evil.com`: still protocol-relative once sent as a Location.
  return path.startsWith('//') ? fallback : path;
}

// ---------- third-party images ----------

export type IgdbSize =
  | 't_thumb'
  | 't_cover_small'
  | 't_cover_big'
  | 't_screenshot_med'
  | 't_screenshot_big'
  | 't_720p'
  | 't_1080p';

const IMAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function igdbImageUrl(imageId: string, size: IgdbSize = 't_cover_big'): string {
  if (!IMAGE_ID.test(imageId)) throw new Error('invalid IGDB image id');
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

export const igdbCoverUrl = (imageId: string | null | undefined, size: IgdbSize = 't_cover_big') =>
  imageId ? igdbImageUrl(imageId, size) : null;

export const steamStoreUrl = (appId: number) => `https://store.steampowered.com/app/${appId}/`;
export const steamHeroUrl = (appId: number) =>
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`;
export const steamCapsuleUrl = (appId: number) =>
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;

// ---------- community links ----------

export const COMMUNITY = {
  discord: 'https://discord.com/invite/QDUt8HpCvr',
  reddit: 'https://www.reddit.com/r/nucleuscoop/',
  github: 'https://github.com/SplitScreen-Me/splitscreenme-nucleus',
  githubReleases: 'https://github.com/SplitScreen-Me/splitscreenme-nucleus/releases',
  steamCurator: 'https://store.steampowered.com/curator/26348881-Nucleus-Coop/',
  patreon: 'https://patreon.com/nucleus_coop',
} as const;
