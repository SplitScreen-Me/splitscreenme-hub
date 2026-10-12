import 'server-only';
import { LRUCache } from 'lru-cache';

/**
 * In-process cache for hot public data (catalogue, game pages, stats, sitemap), with tags so writes can
 * invalidate what they touched: `cached('catalog', 60_000, load, ['handlers'])` then `invalidate('handlers')`.
 * Single instance, so no distributed invalidation is needed. Concurrent misses share one load.
 *
 * Bounded by construction: the tag index only holds keys that are in the store (an entry leaving the
 * store, whatever the reason, leaves the index too), and misses (null or undefined, such as an unknown
 * slug) go to a small untagged cache, so probing random URLs can neither grow memory nor push real
 * entries out.
 */

const MAX_ENTRIES = 2_000;
const MAX_MISSES = 500;
const MISS_TTL_MS = 30_000;
/** Longer keys are never cached (callers validate their input; this is the backstop). */
const MAX_KEY_LENGTH = 256;

interface Entry {
  value: unknown;
  tags: readonly string[];
}

interface Load {
  promise: Promise<unknown>;
  tags: readonly string[];
  /** Set by invalidate(): the result predates the write, so it is returned but not stored. */
  stale: boolean;
}

const tagIndex = new Map<string, Set<string>>();

function untag(key: string, tags: readonly string[]): void {
  for (const t of tags) {
    const keys = tagIndex.get(t);
    if (!keys) continue;
    keys.delete(key);
    if (keys.size === 0) tagIndex.delete(t);
  }
}

// dispose runs on eviction, expiry (ttlAutopurge), delete, replacement and clear.
const store = new LRUCache<string, Entry>({
  max: MAX_ENTRIES,
  ttlAutopurge: true,
  dispose: (entry, key) => untag(key, entry.tags),
});
const misses = new LRUCache<string, { value: null | undefined }>({
  max: MAX_MISSES,
  ttl: MISS_TTL_MS,
  ttlAutopurge: true,
});
const inflight = new Map<string, Load>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  tags: readonly string[] = [],
): Promise<T> {
  if (key.length > MAX_KEY_LENGTH) return load();
  const hit = store.get(key);
  if (hit) return hit.value as T;
  const miss = misses.get(key);
  if (miss) return miss.value as T;
  const pending = inflight.get(key);
  if (pending) return pending.promise as Promise<T>;

  const entry: Load = { promise: Promise.resolve(), tags, stale: false };
  const p = load()
    .then((value) => {
      if (!entry.stale) {
        if (value === null || value === undefined) {
          misses.set(key, { value: value as null | undefined }, { ttl: Math.min(ttlMs, MISS_TTL_MS) });
        } else {
          store.set(key, { value, tags }, { ttl: ttlMs });
          for (const t of tags) {
            let keys = tagIndex.get(t);
            if (!keys) tagIndex.set(t, (keys = new Set()));
            keys.add(key);
          }
        }
      }
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === entry) inflight.delete(key);
    });
  entry.promise = p;
  inflight.set(key, entry);
  return p;
}

/**
 * Drops every entry carrying one of the tags, and every remembered miss (a write may have created what
 * was missing). Loads in flight that carry one of the tags are not stored. Call after the write
 * transaction committed.
 */
export function invalidate(...tags: string[]): void {
  const dropped = new Set(tags);
  for (const t of dropped) {
    const keys = tagIndex.get(t);
    if (!keys) continue;
    for (const k of [...keys]) store.delete(k);
    tagIndex.delete(t);
  }
  for (const [key, load] of inflight) {
    if (load.tags.some((t) => dropped.has(t))) {
      load.stale = true;
      inflight.delete(key);
    }
  }
  misses.clear();
}

/** Tests and the importer. */
export function clearCache(): void {
  for (const load of inflight.values()) load.stale = true;
  inflight.clear();
  store.clear();
  misses.clear();
  tagIndex.clear();
}

/** Test hook: sizes of the internal structures. */
export function cacheStats(): { entries: number; misses: number; tags: number; taggedKeys: number } {
  let taggedKeys = 0;
  for (const keys of tagIndex.values()) taggedKeys += keys.size;
  return { entries: store.size, misses: misses.size, tags: tagIndex.size, taggedKeys };
}

/** Tags used across the app. Handler-level tags: `handler:<id>`; game-level: `game:<slug>`. */
export const TAGS = {
  catalog: 'catalog',
  stats: 'stats',
  genres: 'genres',
  authors: 'authors',
  sitemap: 'sitemap',
  handler: (id: string) => `handler:${id}`,
  game: (slug: string) => `game:${slug}`,
  comments: (handlerId: string) => `comments:${handlerId}`,
} as const;
