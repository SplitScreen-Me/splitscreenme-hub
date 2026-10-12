/**
 * Pure mapping from Meteor documents to Postgres rows (docs/ARCHITECTURE.md section 3). No I/O here, so
 * every rule is unit-tested on synthetic fixtures (transform.test.ts). Nothing in this file logs.
 */
import { ID_PATTERN } from '../../src/lib/ids';
import type { MComment, MDate, MHandler, MPackage, MUser } from './types';

export const PROVIDERS = ['discord', 'github', 'google', 'facebook'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Counts by reason, merged into the final report. */
export type Counts = Record<string, number>;
const bump = (c: Counts, key: string, n = 1) => {
  c[key] = (c[key] ?? 0) + n;
};

// ---------- scalars ----------

export function toDate(v: MDate): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC day of a Meteor "local midnight" timestamp: shifting by 12 h absorbs any server time zone. */
export function utcDay(d: Date): string {
  return new Date(d.getTime() + 12 * 3600_000).toISOString().slice(0, 10);
}

/** Postgres text cannot hold NUL characters (some legacy scripts and notes contain them): they are dropped. */
export const NUL = /\u0000/g;
export const str = (v: unknown): string => (typeof v === 'string' ? v.replace(NUL, '') : '');
export const hasNul = (v: unknown): boolean => typeof v === 'string' && v.includes('\u0000');
export const trimmed = (v: unknown): string => str(v).trim();
export const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** A finite integer from a Mongo number (Int32, Double, Long as number) or a numeric string. */
export function int(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Non-negative counter that fits a Postgres integer. */
export const counter = (v: unknown): number => Math.min(Math.max(int(v) ?? 0, 0), 2_147_483_647);

export const isId = (v: unknown): v is string => typeof v === 'string' && ID_PATTERN.test(v);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(v: unknown): string | null {
  const e = trimmed(v).toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

/** alanning:roles 1.2 stores an array, or `{ group: [...] }` with `__global_roles__`. */
export function roleOf(roles: unknown): 'admin' | 'user' {
  const list: unknown[] = Array.isArray(roles)
    ? roles
    : roles && typeof roles === 'object'
      ? Object.values(roles as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : []))
      : [];
  return list.includes('admin') ? 'admin' : 'user';
}

// ---------- users ----------

export interface Activity {
  handlers: number;
  comments: number;
}

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  passwordAlgo: 'meteor_sha256_bcrypt' | null;
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface OAuthRow {
  provider: Provider;
  providerUserId: string;
  userId: string;
  providerUsername: string | null;
  createdAt: Date;
}

export interface UsersPlan {
  users: UserRow[];
  oauth: OAuthRow[];
  /** user id -> starred handler ids (deduplicated, unfiltered) */
  stars: Map<string, string[]>;
  counts: Counts;
}

/** Usernames and emails (lower-cased) already used in the target by accounts the import does not own. */
export interface Taken {
  usernames: Set<string>;
  emails: Set<string>;
}

const BCRYPT = /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/;

function providerEmail(u: MUser): { email: string; verified: boolean } | null {
  const s = u.services ?? {};
  const candidates: [unknown, boolean][] = [
    [s.google?.email, s.google?.verified_email === true],
    [s.github?.email, true], // GitHub only exposes verified public addresses
    [s.discord?.email, s.discord?.verified === true],
    [s.facebook?.email, true],
  ];
  for (const [raw, verified] of candidates) {
    const email = normalizeEmail(raw);
    if (email) return { email, verified };
  }
  return null;
}

/**
 * Users, OAuth identities, stars and the placeholder rows of missing handler owners.
 * Ties on a username (case-insensitive) or an email go to the account with the most handlers, then
 * comments, then the oldest, then the smallest id; the others are renamed `-2`, `-3`... or lose the email.
 */
export function planUsers(
  source: MUser[],
  activity: Map<string, Activity>,
  placeholderIds: string[],
  taken: Taken,
  now: Date,
): UsersPlan {
  const counts: Counts = {};
  const usernames = new Set(taken.usernames);
  const emails = new Set(taken.emails);
  const users: UserRow[] = [];
  const oauth: OAuthRow[] = [];
  const stars = new Map<string, string[]>();
  const oauthSeen = new Set<string>();

  const valid = source.filter((u) => {
    if (isId(u._id)) return true;
    bump(counts, 'skippedInvalidId');
    return false;
  });
  const rank = (u: MUser) => activity.get(u._id) ?? { handlers: 0, comments: 0 };
  const ordered = [...valid].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return (
      rb.handlers - ra.handlers ||
      rb.comments - ra.comments ||
      (toDate(a.createdAt)?.getTime() ?? Infinity) - (toDate(b.createdAt)?.getTime() ?? Infinity) ||
      (a._id < b._id ? -1 : a._id > b._id ? 1 : 0)
    );
  });

  const claimUsername = (base: string): string => {
    let name = base;
    for (let n = 2; usernames.has(name.toLowerCase()); n++) name = `${base}-${n}`;
    usernames.add(name.toLowerCase());
    return name;
  };

  // Placeholders first: their names are derived from ids and must stay predictable.
  for (const id of placeholderIds) {
    users.push({
      id,
      username: claimUsername(`deleted-${id.slice(0, 6)}`),
      email: null,
      emailVerifiedAt: null,
      passwordHash: null,
      passwordAlgo: null,
      role: 'user',
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });
    bump(counts, 'placeholders');
  }

  for (const u of ordered) {
    const s = u.services ?? {};
    const createdAt = toDate(u.createdAt) ?? now;

    let base = trimmed(u.profile?.username);
    if (!base) {
      base = trimmed(s.discord?.username) || trimmed(s.github?.username) || `user-${u._id.slice(0, 6)}`;
      bump(counts, 'usernameFromFallback');
    }
    const username = claimUsername(base);
    if (username !== base) bump(counts, 'usernameRenamed');

    let email: string | null = null;
    let verified = false;
    const first = u.emails?.[0];
    const primary = normalizeEmail(first?.address);
    if (primary) {
      email = primary;
      verified = first?.verified === true;
    } else {
      if (first?.address !== undefined) bump(counts, 'emailInvalid');
      const p = providerEmail(u);
      if (p) {
        email = p.email;
        verified = p.verified;
        bump(counts, 'emailFromProvider');
      }
    }
    if (email && emails.has(email)) {
      bump(counts, 'emailDuplicateDropped');
      email = null;
      verified = false;
    }
    if (email) emails.add(email);
    else bump(counts, 'withoutEmail');

    const bcrypt = str(s.password?.bcrypt);
    const hasPassword = BCRYPT.test(bcrypt);
    if (bcrypt && !hasPassword) bump(counts, 'passwordHashUnrecognised');
    if (hasPassword) bump(counts, 'withLegacyPassword');

    const role = roleOf(u.roles);
    if (role === 'admin') bump(counts, 'admins');

    users.push({
      id: u._id,
      username,
      email,
      emailVerifiedAt: email && verified ? createdAt : null,
      passwordHash: hasPassword ? bcrypt : null,
      passwordAlgo: hasPassword ? 'meteor_sha256_bcrypt' : null,
      role,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });

    for (const provider of PROVIDERS) {
      const raw = s[provider]?.id;
      const providerUserId = typeof raw === 'number' ? String(raw) : trimmed(raw);
      if (!providerUserId) continue;
      const key = `${provider}:${providerUserId}`;
      if (oauthSeen.has(key)) {
        bump(counts, 'oauthDuplicateDropped');
        continue;
      }
      oauthSeen.add(key);
      const name =
        provider === 'discord'
          ? trimmed(s.discord?.username)
          : provider === 'github'
            ? trimmed(s.github?.username)
            : '';
      oauth.push({ provider, providerUserId, userId: u._id, providerUsername: name || null, createdAt });
      bump(counts, `oauth_${provider}`);
    }

    const starred = u.profile?.starredHandlers;
    if (Array.isArray(starred)) {
      const ids = [...new Set(starred.filter(isId))];
      if (ids.length) stars.set(u._id, ids);
    }
  }

  return { users, oauth, stars, counts };
}

// ---------- games ----------

export interface GamePlan {
  key: string;
  igdbId: number | null;
  name: string;
  summary: string | null;
  coverImageId: string | null;
  igdbUrl: string | null;
  genres: string[];
}

export const MAX_GENRES = 3;

/** IGDB id when the handler has a valid one. */
export function igdbIdOf(h: MHandler): number | null {
  const n = int(h.gameId);
  return n !== null && n > 0 && n <= 2_147_483_647 ? n : null;
}

/** `igdb:<id>`, or `name:<lower-cased name>` for handlers without an IGDB id. */
export function gameKeyOf(h: MHandler): string {
  const id = igdbIdOf(h);
  return id !== null ? `igdb:${id}` : `name:${trimmed(h.gameName).toLowerCase() || 'unknown game'}`;
}

/** IGDB image id from a stored cover: an id, or an old full image URL. */
export function coverIdOf(v: unknown): string | null {
  const s = trimmed(v);
  if (!s) return null;
  const fromUrl = /\/t_[a-z0-9_]+\/([a-z0-9]+)\.(?:jpe?g|png|webp)$/i.exec(s);
  if (fromUrl) return fromUrl[1]!;
  return /^[a-z0-9]{1,40}$/i.test(s) ? s : null;
}

/** One game per IGDB id (or name). When handlers disagree, the most downloaded handler wins. */
export function planGames(handlers: MHandler[]): Map<string, GamePlan> {
  const best = new Map<string, MHandler>();
  for (const h of handlers) {
    const key = gameKeyOf(h);
    const cur = best.get(key);
    if (!cur || counter(h.downloadCount) > counter(cur.downloadCount)) best.set(key, h);
  }
  const out = new Map<string, GamePlan>();
  for (const [key, h] of best) {
    const genres = Array.isArray(h.genres)
      ? [...new Set(h.genres.map(trimmed).filter(Boolean))].slice(0, MAX_GENRES)
      : [];
    out.set(key, {
      key,
      igdbId: igdbIdOf(h),
      name: trimmed(h.gameName) || 'Unknown game',
      summary: trimmed(h.gameDescription) || null,
      coverImageId: coverIdOf(h.gameCover),
      igdbUrl: /^https:\/\/www\.igdb\.com\//.test(trimmed(h.gameUrl)) ? trimmed(h.gameUrl) : null,
      genres,
    });
  }
  return out;
}

// ---------- handlers ----------

export interface HandlerRow {
  id: string;
  gameId: number;
  ownerId: string;
  title: string;
  description: string;
  maxPlayers: number;
  supportsControllers: boolean | null;
  supportsKeyboardMouse: boolean | null;
  supportsMultiKeyboardMouse: boolean | null;
  isPublic: boolean;
  approvedAt: Date | null;
  publishedAt: Date | null;
  downloadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function mapHandler(h: MHandler, gameId: number, ownerId: string, now: Date): HandlerRow {
  const createdAt = toDate(h.createdAt) ?? now;
  const updatedAt = toDate(h.updatedAt) ?? createdAt;
  const lastPublication = toDate(h.lastPublicationAt);
  const isPublic = h.private !== true;
  const players = int(h.maxPlayers);
  return {
    id: h._id,
    gameId,
    ownerId,
    title: trimmed(h.title) || 'Untitled handler',
    description: str(h.description),
    maxPlayers: players === null ? 2 : Math.min(Math.max(players, 1), 64),
    supportsControllers: bool(h.playableControllers),
    supportsKeyboardMouse: bool(h.playableMouseKeyboard),
    supportsMultiKeyboardMouse: bool(h.playableMultiMouseKeyboard),
    isPublic,
    approvedAt: h.publicAuthorized === true ? (lastPublication ?? updatedAt) : null,
    publishedAt: lastPublication ?? (isPublic ? updatedAt : null),
    downloadCount: counter(h.downloadCount),
    createdAt,
    updatedAt,
  };
}

// ---------- versions ----------

export interface VersionPlan {
  /** package id -> version number, for every importable package (known handler, GridFS file id) */
  numbers: Map<string, number>;
  /** handlers whose old unnumbered packages got the free numbers just below the first numbered one */
  filled: Set<string>;
  /** handlers whose packages were all renumbered 1..n by release date */
  renumbered: Set<string>;
  /** package ids of unknown handlers */
  orphans: string[];
  /** package ids without a GridFS file id (uploads that never completed): never imported */
  noFile: string[];
}

const byRelease = (a: MPackage, b: MPackage) =>
  (toDate(a.meta?.releaseDate)?.getTime() ?? 0) - (toDate(b.meta?.releaseDate)?.getTime() ?? 0) ||
  (a._id < b._id ? -1 : a._id > b._id ? 1 : 0);

/**
 * Version numbers of the importable packages (known handler and a GridFS file id; uploads that never
 * completed consumed no number in Meteor and are left out):
 * - every package has a distinct positive `meta.handlerVersion`: kept as is;
 * - packages from before `handlerVersion` existed are all older than the numbered ones and fit below the
 *   first number: they take the numbers just below it, in release order (v1..v(k) when k uploads came
 *   before the first numbered v(k+1)), the numbered ones are kept;
 * - anything else (duplicates, interleaved dates, too many): all renumbered 1..n by release date.
 */
export function planVersions(packages: MPackage[], handlerIds: Set<string>): VersionPlan {
  const byHandler = new Map<string, MPackage[]>();
  const orphans: string[] = [];
  const noFile: string[] = [];
  for (const p of packages) {
    const hid = p.meta?.handlerId;
    if (!isId(p._id) || !isId(hid) || !handlerIds.has(hid)) {
      orphans.push(String(p._id));
      continue;
    }
    if (!gridFsIdOf(p)) {
      noFile.push(p._id);
      continue;
    }
    const list = byHandler.get(hid) ?? [];
    list.push(p);
    byHandler.set(hid, list);
  }
  const numbers = new Map<string, number>();
  const filled = new Set<string>();
  const renumbered = new Set<string>();
  for (const [hid, list] of byHandler) {
    const numbered = list.filter((p) => (int(p.meta?.handlerVersion) ?? 0) > 0);
    const missing = list.filter((p) => (int(p.meta?.handlerVersion) ?? 0) <= 0).sort(byRelease);
    const values = numbered.map((p) => int(p.meta?.handlerVersion)!);
    const distinct = new Set(values).size === values.length;
    if (distinct && missing.length === 0) {
      for (const p of numbered) numbers.set(p._id, int(p.meta?.handlerVersion)!);
      continue;
    }
    if (distinct && numbered.length > 0) {
      const first = Math.min(...values);
      const firstDate = Math.min(...numbered.map((p) => toDate(p.meta?.releaseDate)?.getTime() ?? 0));
      const lastMissingDate = Math.max(...missing.map((p) => toDate(p.meta?.releaseDate)?.getTime() ?? 0));
      if (missing.length < first && lastMissingDate <= firstDate) {
        for (const p of numbered) numbers.set(p._id, int(p.meta?.handlerVersion)!);
        missing.forEach((p, i) => numbers.set(p._id, first - missing.length + i));
        filled.add(hid);
        continue;
      }
    }
    if (numbered.length > 0) renumbered.add(hid);
    else filled.add(hid); // only pre-handlerVersion packages: 1..n by release date
    [...list].sort(byRelease).forEach((p, i) => numbers.set(p._id, i + 1));
  }
  return { numbers, filled, renumbered, orphans, noFile };
}

const STAMP = /^[ \t]*Hub\.Handler\.Version[ \t]*=[ \t]*(\d{1,9})[ \t]*;/m;

/** `Hub.Handler.Version` stamped at the top of a handler script by the hub, or null. */
export function stampedVersion(script: unknown): number | null {
  if (typeof script !== 'string') return null;
  const m = STAMP.exec(script.slice(0, 8192));
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : null;
}

/**
 * Numbers of a handler whose plan does not come from `handlerVersion` alone (duplicate or missing
 * values) aligned on the
 * `Hub.Handler.Version` stamped in each package script, which installed copies report to the app's
 * update check (an update shows when the hub's current number is greater than the installed one):
 * - each stamped value is kept by one package: the current package for its own value, else the latest
 *   released package carrying it. The current version then matches what its users installed, and the
 *   next upload (max + 1) numbers above every installed copy;
 * - the other packages take the lowest free numbers, in release order.
 * `packages` are the importable packages of one handler. Returns null when none is stamped (the
 * renumbering stays), else the new numbers by package id.
 */
export function alignOnStamps(
  packages: MPackage[],
  currentPackage: unknown,
  stampOf: (p: MPackage) => number | null,
): Map<string, number> | null {
  const list = [...packages].sort(byRelease);
  const holder = new Map<number, MPackage>();
  for (const p of list) {
    const s = stampOf(p);
    if (s !== null) holder.set(s, p); // release order: the latest carrier wins
  }
  if (holder.size === 0) return null;
  const current = list.find((p) => p._id === currentPackage);
  const currentStamp = current ? stampOf(current) : null;
  if (current && currentStamp !== null) holder.set(currentStamp, current);
  const numbers = new Map<string, number>();
  for (const [s, p] of holder) numbers.set(p._id, s);
  const used = new Set(holder.keys());
  let next = 1;
  for (const p of list) {
    if (numbers.has(p._id)) continue;
    while (used.has(next)) next++;
    numbers.set(p._id, next);
    used.add(next);
  }
  return numbers;
}

/** The current version: `currentPackage` when it was imported, else the highest imported version. */
export function pickCurrent(
  currentPackage: unknown,
  imported: { id: string; version: number }[],
): { id: string; version: number } | null {
  if (imported.length === 0) return null;
  const named = imported.find((v) => v.id === currentPackage);
  if (named) return named;
  return imported.reduce((a, b) => (b.version > a.version ? b : a));
}

/** `24` hex chars: the string form of a GridFS ObjectId. */
export function gridFsIdOf(p: MPackage): string | null {
  const id = p.versions?.original?.meta?.gridFsFileId;
  return typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id) ? id.toLowerCase() : null;
}

// ---------- comments ----------

export interface CommentRow {
  id: string;
  handlerId: string;
  authorId: string | null;
  parentId: string | null;
  body: string;
  createdAt: Date;
}

/** Comments of known handlers; a reply to a reply hangs off its root, a missing parent makes a root. */
export function planComments(
  source: MComment[],
  handlerIds: Set<string>,
  userIds: Set<string>,
  now: Date,
): { roots: CommentRow[]; replies: CommentRow[]; counts: Counts } {
  const counts: Counts = {};
  const byId = new Map<string, MComment>();
  for (const c of source) {
    if (!isId(c._id)) {
      bump(counts, 'skippedInvalidId');
      continue;
    }
    if (!isId(c.handlerId) || !handlerIds.has(c.handlerId)) {
      bump(counts, 'skippedOrphan');
      continue;
    }
    byId.set(c._id, c);
  }
  const rootOf = (c: MComment): string | null => {
    let parent = c.replyTo;
    const seen = new Set([c._id]);
    while (isId(parent)) {
      const p = byId.get(parent);
      if (!p || seen.has(p._id)) return null;
      if (!isId(p.replyTo)) return p.handlerId === c.handlerId ? p._id : null;
      seen.add(p._id);
      parent = p.replyTo;
    }
    return null;
  };
  const roots: CommentRow[] = [];
  const replies: CommentRow[] = [];
  for (const c of byId.values()) {
    const owner = c.owner;
    const authorId = isId(owner) && userIds.has(owner) ? owner : null;
    if (!authorId) bump(counts, 'authorUnknown');
    const parentId = isId(c.replyTo) ? rootOf(c) : null;
    if (isId(c.replyTo) && !parentId) bump(counts, 'parentMissing');
    if (parentId && parentId !== c.replyTo) bump(counts, 'reattachedToRoot');
    const row: CommentRow = {
      id: c._id,
      handlerId: c.handlerId as string,
      authorId,
      parentId,
      body: trimmed(c.content),
      createdAt: toDate(c.createdAt) ?? now,
    };
    (parentId ? replies : roots).push(row);
  }
  return { roots, replies, counts };
}

// ---------- download days ----------

/**
 * Sums `HandlersStats` per (handler, UTC day). Fed in ascending `date` order, it releases each day's
 * totals as soon as a later day starts, so memory stays at one day of handlers.
 */
export class DayAggregator {
  private day: string | null = null;
  private current = new Map<string, number>();
  readonly counts: Counts = {};

  constructor(private readonly handlerIds: Set<string>) {}

  /** Returns the finished rows of the previous day when `date` starts a new one. */
  add(
    handlerId: unknown,
    date: MDate,
    downloads: unknown,
  ): { handlerId: string; day: string; downloads: number }[] {
    const d = toDate(date);
    if (!isId(handlerId) || !this.handlerIds.has(handlerId)) {
      bump(this.counts, 'skippedOrphan');
      return [];
    }
    if (!d) {
      bump(this.counts, 'skippedNoDate');
      return [];
    }
    const day = utcDay(d);
    let out: { handlerId: string; day: string; downloads: number }[] = [];
    if (this.day !== null && day !== this.day) {
      if (day < this.day) throw new Error('HandlersStats must be read in ascending date order');
      out = this.flush();
    }
    this.day = day;
    const prev = this.current.get(handlerId);
    if (prev !== undefined) bump(this.counts, 'mergedSameDay');
    this.current.set(handlerId, Math.min((prev ?? 0) + counter(downloads), 2_147_483_647));
    return out;
  }

  flush(): { handlerId: string; day: string; downloads: number }[] {
    const day = this.day;
    const rows = day
      ? [...this.current].map(([handlerId, downloads]) => ({ handlerId, day, downloads }))
      : [];
    this.current = new Map();
    return rows;
  }
}
