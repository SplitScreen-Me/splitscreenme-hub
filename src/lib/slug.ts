/** Game slugs: docs/ARCHITECTURE.md section 2.3. */

export const SLUG_MAX = 80;

/** Shadowed by static segments under /hub or kept for later. Never given to a game. */
export const RESERVED_GAME_SLUGS: ReadonlySet<string> = new Set([
  'genres',
  'authors',
  'search',
  'new',
  'page',
  'api',
]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** NFKD, accents stripped, lower case, runs of anything else to "-", trimmed, at most 80 chars. */
export function slugify(input: string, max: number = SLUG_MAX): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/**
 * A slug no other game uses: the name's slug, then `-<releaseYear>`, then `-<igdbId>`, then a counter.
 * `isTaken` answers for slugs and old slugs (redirects) of other games.
 */
export async function uniqueGameSlug(
  name: string,
  facts: { releaseYear?: number | null; igdbId?: number | null },
  isTaken: (slug: string) => boolean | Promise<boolean>,
): Promise<string> {
  const base = slugify(name) || 'game';
  const candidates = [base];
  if (facts.releaseYear) candidates.push(`${base}-${facts.releaseYear}`);
  if (facts.igdbId) candidates.push(`${base}-${facts.igdbId}`);
  for (const c of candidates) {
    const slug = c.slice(0, SLUG_MAX).replace(/-+$/, '');
    if (!RESERVED_GAME_SLUGS.has(slug) && !(await isTaken(slug))) return slug;
  }
  for (let n = 2; n < 1000; n++) {
    const slug = `${base.slice(0, SLUG_MAX - 4)}-${n}`;
    if (!(await isTaken(slug))) return slug;
  }
  throw new Error(`no free slug for "${name}"`);
}
