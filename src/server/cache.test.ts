import { beforeEach, describe, expect, it } from 'vitest';
import { cached, cacheStats, clearCache, invalidate } from './cache';

describe('cache', () => {
  beforeEach(() => clearCache());

  it('stores values, shares concurrent loads and invalidates by tag', async () => {
    let loads = 0;
    const load = async () => ({ n: ++loads });
    const [a, b] = await Promise.all([cached('k', 60_000, load, ['t']), cached('k', 60_000, load, ['t'])]);
    expect(a).toBe(b);
    expect(loads).toBe(1);
    expect(await cached('k', 60_000, load, ['t'])).toEqual({ n: 1 });
    invalidate('t');
    expect(await cached('k', 60_000, load, ['t'])).toEqual({ n: 2 });
  });

  it('keeps misses out of the tag index and forgets them on any invalidation', async () => {
    let loads = 0;
    const load = async () => {
      loads++;
      return null;
    };
    for (let i = 0; i < 50; i++)
      expect(await cached(`game:probe-${i}`, 60_000, load, [`game:probe-${i}`])).toBeNull();
    expect(cacheStats()).toMatchObject({ entries: 0, tags: 0, taggedKeys: 0, misses: 50 });
    await cached('game:probe-0', 60_000, load, ['game:probe-0']);
    expect(loads).toBe(50);
    invalidate('anything');
    expect(cacheStats().misses).toBe(0);
  });

  it('cleans the tag index when entries are evicted', async () => {
    for (let i = 0; i < 2_500; i++)
      await cached(`handler:${i}`, 60_000, async () => ({ i }), [`handler:${i}`, 'catalog']);
    const stats = cacheStats();
    expect(stats.entries).toBe(2_000);
    expect(stats.tags).toBe(2_001);
    expect(stats.taggedKeys).toBe(4_000);
    invalidate('catalog');
    expect(cacheStats()).toMatchObject({ entries: 0, tags: 0, taggedKeys: 0 });
  });

  it('does not store a load that an invalidation of its tag overtook', async () => {
    let release!: (v: { v: number }) => void;
    const first = cached('slow', 60_000, () => new Promise<{ v: number }>((r) => (release = r)), ['t']);
    invalidate('other');
    invalidate('t');
    release({ v: 1 });
    expect(await first).toEqual({ v: 1 });
    expect(await cached('slow', 60_000, async () => ({ v: 2 }), ['t'])).toEqual({ v: 2 });
  });

  it('a load survives invalidations of unrelated tags', async () => {
    let release!: (v: { v: number }) => void;
    const first = cached('slow', 60_000, () => new Promise<{ v: number }>((r) => (release = r)), ['t']);
    invalidate('other');
    release({ v: 1 });
    await first;
    expect(await cached('slow', 60_000, async () => ({ v: 2 }), ['t'])).toEqual({ v: 1 });
  });

  it('never caches oversized keys', async () => {
    let loads = 0;
    const key = 'x'.repeat(300);
    await cached(key, 60_000, async () => ++loads);
    await cached(key, 60_000, async () => ++loads);
    expect(loads).toBe(2);
    expect(cacheStats().entries).toBe(0);
  });
});
