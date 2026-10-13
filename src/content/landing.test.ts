import { readFileSync } from 'node:fs';
import path from 'node:path';
import GithubSlugger from 'github-slugger';
import { describe, expect, it } from 'vitest';
import { resolveCollections } from '@/components/landing/resolve';
import type { PublicHandler } from '@/server/public/types';
import { collections, heroScenes, landingFaq } from './collections';
import { findDocPage } from './docs/nav';
import { allReleasesUrl, RELEASES_PATH, release, releaseSize, stableRelease } from './release';

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

  it.each([
    ['release', release],
    ['stableRelease', stableRelease],
  ])('%s info is complete', (_, r) => {
    expect(r.version).toMatch(/^\d+\.\d+\.\d+(-beta-\d+)?$/);
    expect(r.channel).toBe(r.version.includes('-beta-') ? 'beta' : 'stable');
    expect(r.label.length).toBeGreaterThan(0);
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(r.date))).toBe(false);
    expect(Number.isInteger(r.sizeBytes) && r.sizeBytes > 1_000_000).toBe(true);
    if (r.sha256 !== null) expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.downloadUrl.endsWith(`/${r.fileName}`)).toBe(true);
    if (r.downloadUrl.startsWith('/')) {
      // Hosted on this site: a plain file under RELEASES_PATH, named after the version, with a checksum.
      expect(r.downloadUrl).toBe(`${RELEASES_PATH}${r.fileName}`);
      expect(r.fileName).toMatch(/^[A-Za-z0-9._-]+\.zip$/);
      expect(r.fileName).toContain(r.version);
      expect(r.sha256).not.toBeNull();
    } else {
      expect(r.downloadUrl).toContain(r.version);
    }
    for (const url of [r.downloadUrl, r.notesUrl, allReleasesUrl]) {
      if (url === null || url.startsWith('/')) continue;
      expect(url).toMatch(/^https:\/\/github\.com\/SplitScreen-Me\/splitscreenme-nucleus\/releases/);
    }
  });

  it('a beta keeps a stable release to fall back on', () => {
    expect(stableRelease.channel).toBe('stable');
    expect(stableRelease.notesUrl).not.toBeNull();
    if (release.channel === 'stable') expect(release.version).toBe(stableRelease.version);
  });

  it('formats the size in MB', () => {
    expect(releaseSize({ ...release, sizeBytes: 43_498_485 })).toBe('43 MB');
    expect(releaseSize({ ...release, sizeBytes: 97_396_862 })).toBe('97 MB');
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
