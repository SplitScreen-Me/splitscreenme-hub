/**
 * Domain types of public data (not API DTOs: src/lib/api/dto.ts maps these to the API schemas).
 * Everything here is about listed handlers only.
 */

export interface Inputs {
  controllers: boolean | null;
  keyboardMouse: boolean | null;
  multiKeyboardMouse: boolean | null;
}

export interface PublicHandler {
  id: string;
  title: string;
  gameId: number;
  gameName: string;
  gameSlug: string;
  igdbGameId: number | null;
  coverImageId: string | null;
  genres: string[];
  /** null when the author's account was deleted */
  authorId: string | null;
  /** username, or "Deleted user" */
  authorName: string;
  version: number;
  versionId: string;
  /** current version verified by a moderator */
  verified: boolean;
  maxPlayers: number;
  inputs: Inputs;
  downloads: number;
  stars: number;
  comments: number;
  trendScore: number;
  createdAt: Date;
  updatedAt: Date;
  /** last private -> public switch; falls back to createdAt */
  publishedAt: Date;
}

export interface PublicVersion {
  id: string;
  version: number;
  releaseNotes: string;
  createdAt: Date;
  verified: boolean;
  sizeBytes: number;
  sha256: string;
  fileName: string;
  downloads: number;
}

/** What a download needs (storage key) on top of the public facts. */
export interface PublicVersionFile extends PublicVersion {
  handlerId: string;
  storageKey: string;
}

export interface PublicVersionDetail extends PublicVersion {
  manifest: { path: string; size: number }[];
  /** stamped handler.js */
  script: string;
}

export interface Screenshot {
  imageId: string;
  width: number | null;
  height: number | null;
}

export interface PublicHandlerDetail extends PublicHandler {
  description: string;
  gameSummary: string | null;
  igdbUrl: string | null;
  steamAppId: number | null;
  releaseYear: number | null;
  screenshots: Screenshot[];
  currentVersion: PublicVersion;
  /** this handler is rendered on the game page itself */
  isPrimary: boolean;
}

export interface PublicGame {
  id: number;
  slug: string;
  name: string;
  igdbGameId: number | null;
  igdbUrl: string | null;
  summary: string | null;
  coverImageId: string | null;
  steamAppId: number | null;
  releaseYear: number | null;
  genres: string[];
  screenshots: Screenshot[];
  primaryHandlerId: string;
  /** listed handlers, primary first */
  handlers: PublicHandler[];
}

export type GameLookup = { kind: 'game'; game: PublicGame } | { kind: 'redirect'; slug: string } | null;

export interface PublicComment {
  id: string;
  handlerId: string;
  /** null for root comments and for replies whose root is gone */
  parentId: string | null;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
}

export interface GenreCount {
  name: string;
  slug: string;
  label: string;
  /** public games with this genre */
  count: number;
}

export interface PublicAuthor {
  id: string;
  username: string;
  joinedAt: Date;
  handlers: PublicHandler[];
}

export interface TopAuthor {
  id: string;
  username: string;
  handlers: number;
  downloads: number;
}

export interface HubStats {
  publicHandlers: number;
  games: number;
  downloads: number;
  members: number;
  comments: number;
  generatedAt: Date;
}

export type PlayersFilter = '2' | '3-4' | '5-8' | '9+';
export type InputFilter = 'controllers' | 'keyboardMouse' | 'multiKeyboardMouse';
export type SortKey = 'trending' | 'downloads' | 'updated' | 'az' | 'stars' | 'newest';

export interface SearchParams {
  q?: string;
  /** genre URL slug */
  genre?: string;
  players?: PlayersFilter;
  inputs?: InputFilter[];
  verified?: boolean;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const DELETED_USER_NAME = 'Deleted user';
