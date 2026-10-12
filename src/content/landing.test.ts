import { readFileSync } from 'node:fs';
import path from 'node:path';
import GithubSlugger from 'github-slugger';
import { describe, expect, it } from 'vitest';
import { resolveCollections } from '@/components/landing/resolve';
import type { PublicHandler } from '@/server/public/types';
import { collections, heroScenes, landingFaq } from './collections';
import { findDocPage } from './docs/nav';
import { release } from './release';

function headingIds(file: string): Set<string> {
  const src = readFileSync(path.resolve('src/content/docs', `${file}.mdx`), 'utf8');
  const slugger = new GithubSlugger();
  const ids = new Set<string>();
  let fence = false;
  for (const line of src.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && line.match(/^#{2,6} (.+)$/);
    if (m) ids.add(slugger.slug(m[1]!.replace(/[`*]/g, '')));
  }
  return ids;
}

describe('landing content', () => {
  it('FAQ answers link to existing docs pages and anchors', () => {
    for (const item of landingFaq) {
      const [pathname = '', hash] = item.href.split('#');
      const page = findDocPage(pathname.replace(/^\/doc\/?/, ''));
      expect(page, item.href).toBeDefined();
      if (hash) expect(headingIds(page!.file).has(hash), item.href).toBe(true);
    }
  });

  it('collections and hero scenes are well formed', () => {
    expect(new Set(collections.map((c) => c.key)).size).toBe(collections.length);
    for (const c of collections) {
      expect(c.games.length, c.key).toBeGreaterThanOrEqual(3);
      for (const g of c.games) expect(g.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    for (const s of heroScenes) expect(Number.isInteger(s.steamAppId) && s.steamAppId > 0).toBe(true);
    expect(heroScenes.length).toBeGreaterThanOrEqual(2);
  });

  it('release info is complete', () => {
    expect(release.version).toMatch(/^\d+\.\d+(\.\d+)?$/);
    expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const url of [release.downloadUrl, release.notesUrl, release.allReleasesUrl]) {
      expect(url).toMatch(/^https:\/\/github\.com\/SplitScreen-Me\/splitscreenme-nucleus\/releases/);
    }
    expect(release.downloadUrl).toContain(release.version);
  });
});

describe('resolveCollections', () => {
  const handler = (gameSlug: string, gameName: string, id = gameSlug): PublicHandler =>
    ({ id, gameSlug, gameName, coverImageId: null, maxPlayers: 4, downloads: 10, verified: true }) as PublicHandler;

  it('matches by slug, then by name, skips missing games and small collections', () => {
    const catalog = [
      handler('left-4-dead-2', 'Left 4 Dead 2'),
      handler('left-4-dead-2', 'Left 4 Dead 2', 'second-handler'),
      handler('dying-light-2015', 'Dying Light'),
      handler('valheim', 'Valheim'),
    ];
    const out = resolveCollections(
      [
        { key: 'a', name: 'A', blurb: '', games: [{ slug: 'left-4-dead-2', name: 'Left 4 Dead 2' }, { slug: 'dying-light', name: 'Dying Light' }, { slug: 'nope', name: 'Nope' }] },
        { key: 'b', name: 'B', blurb: '', games: [{ slug: 'valheim', name: 'Valheim' }, { slug: 'nope', name: 'Nope' }] },
      ],
      catalog,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.games.map((g) => g.slug)).toEqual(['left-4-dead-2', 'dying-light-2015']);
  });
});
