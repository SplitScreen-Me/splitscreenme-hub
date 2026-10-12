import { slugify } from './slug';

/**
 * Hub genres are IGDB genre names (stored as is in games.genres). URLs use a short slug, chips and lists
 * a short label (same labels as the desktop app's catalog.ts).
 */
export interface GenreInfo {
  /** IGDB name, as stored in the database. */
  name: string;
  /** URL segment of /hub/genres/[genre]. */
  slug: string;
  /** Short label for chips and headings. */
  label: string;
}

const KNOWN: GenreInfo[] = [
  { name: 'Adventure', slug: 'adventure', label: 'Adventure' },
  { name: 'Arcade', slug: 'arcade', label: 'Arcade' },
  { name: 'Card & Board Game', slug: 'card-and-board', label: 'Card and board' },
  { name: 'Fighting', slug: 'fighting', label: 'Fighting' },
  { name: "Hack and slash/Beat 'em up", slug: 'hack-and-slash', label: 'Hack and slash' },
  { name: 'Indie', slug: 'indie', label: 'Indie' },
  { name: 'MOBA', slug: 'moba', label: 'MOBA' },
  { name: 'Music', slug: 'music', label: 'Music' },
  { name: 'Pinball', slug: 'pinball', label: 'Pinball' },
  { name: 'Platform', slug: 'platformer', label: 'Platformer' },
  { name: 'Point-and-click', slug: 'point-and-click', label: 'Point-and-click' },
  { name: 'Puzzle', slug: 'puzzle', label: 'Puzzle' },
  { name: 'Quiz/Trivia', slug: 'quiz-trivia', label: 'Quiz' },
  { name: 'Racing', slug: 'racing', label: 'Racing' },
  { name: 'Real Time Strategy (RTS)', slug: 'real-time-strategy', label: 'Real-time strategy' },
  { name: 'Role-playing (RPG)', slug: 'role-playing', label: 'Role-playing' },
  { name: 'Shooter', slug: 'shooter', label: 'Shooter' },
  { name: 'Simulator', slug: 'simulation', label: 'Simulation' },
  { name: 'Sport', slug: 'sports', label: 'Sports' },
  { name: 'Strategy', slug: 'strategy', label: 'Strategy' },
  { name: 'Tactical', slug: 'tactical', label: 'Tactical' },
  { name: 'Turn-based strategy (TBS)', slug: 'turn-based-strategy', label: 'Turn-based strategy' },
  { name: 'Visual Novel', slug: 'visual-novel', label: 'Visual novel' },
];

const BY_NAME = new Map(KNOWN.map((g) => [g.name, g]));
const BY_SLUG = new Map(KNOWN.map((g) => [g.slug, g]));

export const KNOWN_GENRES: readonly GenreInfo[] = KNOWN;

/** Info for any IGDB genre name, including ones added to IGDB after this list was written. */
export function genreInfo(name: string): GenreInfo {
  return BY_NAME.get(name) ?? { name, slug: slugify(name), label: name };
}

export const genreLabel = (name: string) => genreInfo(name).label;
export const genreSlug = (name: string) => genreInfo(name).slug;

/** Resolves a URL slug back to an IGDB name; `available` lets unknown genres from the DB resolve too. */
export function genreFromSlug(slug: string, available: readonly string[] = []): GenreInfo | undefined {
  return BY_SLUG.get(slug) ?? available.map(genreInfo).find((g) => g.slug === slug);
}
