import { describe, expect, it } from 'vitest';
import type { PublicGame, PublicHandler } from '@/server/public/types';
import {
  gameMetaDescription,
  gamePageTitle,
  handlerMetaDescription,
  handlerPageTitle,
  howToJsonLd,
  howToSteps,
  inputPhrase,
  joinOr,
  META_DESCRIPTION_MAX,
  truncate,
  videoGameJsonLd,
} from './game';
import { collectionPageJsonLd, roundedCount } from './catalogue';
import { buildMetadata } from './metadata';

const handler: PublicHandler = {
  id: 'listedHandler0001',
  title: 'Portal 2 coop',
  gameId: 1,
  gameName: 'Portal 2',
  gameSlug: 'portal-2',
  igdbGameId: 72,
  coverImageId: 'co1rs4',
  genres: ['Puzzle', 'Shooter'],
  authorId: 'ownerFixture00001',
  authorName: 'creator-01',
  version: 3,
  versionId: 'vlistedHandler000',
  verified: true,
  maxPlayers: 4,
  inputs: { controllers: true, keyboardMouse: true, multiKeyboardMouse: false },
  downloads: 1234,
  stars: 5,
  comments: 2,
  trendScore: 9,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-02-01T00:00:00Z'),
  publishedAt: new Date('2024-01-02T00:00:00Z'),
};

const game: PublicGame = {
  id: 1,
  slug: 'portal-2',
  name: 'Portal 2',
  igdbGameId: 72,
  igdbUrl: 'https://www.igdb.com/games/portal-2',
  summary: 'Sequel to Portal.',
  coverImageId: 'co1rs4',
  steamAppId: 620,
  releaseYear: 2011,
  genres: ['Puzzle', 'Shooter'],
  screenshots: [],
  primaryHandlerId: handler.id,
  handlers: [handler],
};

describe('game page copy', () => {
  it('titles answer the query and drop the suffix above 60 chars', () => {
    expect(gamePageTitle('Portal 2')).toBe('How to play Portal 2 split screen on PC | SplitScreen.Me');
    const long = gamePageTitle('Call of Duty: Black Ops II');
    expect(long).toBe('How to play Call of Duty: Black Ops II split screen on PC');
    expect(handlerPageTitle('Portal 2 coop', 'Portal 2')).toContain('Portal 2 coop: split screen handler');
    expect(handlerPageTitle('Seamless', 'Elden Ring')).toContain('Seamless: Elden Ring split screen handler');
  });

  it('meta descriptions follow the template and stay within 155 chars', () => {
    // The full template is 163 chars here: the optional "Step-by-step setup." goes first.
    expect(gameMetaDescription(handler)).toBe(
      'Play Portal 2 in split screen on one PC with up to 4 players. Free Nucleus Co-op handler by creator-01, with controllers or keyboard and mouse.',
    );
    expect(
      gameMetaDescription({
        ...handler,
        inputs: { controllers: true, keyboardMouse: false, multiKeyboardMouse: false },
      }),
    ).toBe(
      'Play Portal 2 in split screen on one PC with up to 4 players. Free Nucleus Co-op handler by creator-01, with controllers. Step-by-step setup.',
    );
    for (const name of ['X', 'A'.repeat(60), 'B'.repeat(80), `${'Long name '.repeat(16)}`]) {
      const h = { ...handler, gameName: name, title: name, authorName: 'someone-with-a-long-name' };
      expect(gameMetaDescription(h).length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
      expect(handlerMetaDescription(h).length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    }
    expect(gameMetaDescription({ ...handler, maxPlayers: 1 })).toContain('with friends');
  });

  it('input phrases and helpers', () => {
    expect(inputPhrase({ controllers: true, keyboardMouse: null, multiKeyboardMouse: true })).toBe(
      'with controllers or several keyboards and mice',
    );
    expect(inputPhrase({ controllers: null, keyboardMouse: null, multiKeyboardMouse: null })).toBe('');
    expect(joinOr(['a', 'b', 'c'])).toBe('a, b or c');
    expect(truncate('one two three four five', 16)).toBe('one two three…');
    expect(truncate('short', 16)).toBe('short');
    expect(roundedCount(889)).toBe('850+');
    expect(roundedCount(12)).toBe('12');
  });

  it('four steps, with the keyboard tip only when several keyboards are supported', () => {
    const steps = howToSteps(handler);
    expect(steps.map((s) => s.name)).toEqual([
      'Get Nucleus Co-op',
      'Install the Portal 2 handler',
      'Take a seat',
      'Launch and connect',
    ]);
    expect(steps[2]!.tip).toBeUndefined();
    const kbm = howToSteps({
      ...handler,
      inputs: { controllers: false, keyboardMouse: true, multiKeyboardMouse: true },
    });
    expect(kbm[2]!.tip).toMatch(/End/);
    expect(kbm[2]!.text).toMatch(/keyboard and mouse/);
  });
});

describe('JSON-LD', () => {
  it('VideoGame: no rating, no offers, players and sameAs', () => {
    const ld = videoGameJsonLd(game, handler, 'desc');
    expect(ld['@type']).toBe('VideoGame');
    expect(ld.url).toBe('http://localhost:3000/hub/portal-2');
    expect(ld.numberOfPlayers).toEqual({ '@type': 'QuantitativeValue', minValue: 2, maxValue: 4 });
    expect(ld.sameAs).toEqual([
      'https://www.igdb.com/games/portal-2',
      'https://store.steampowered.com/app/620/',
    ]);
    expect(ld.image).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/co1rs4.jpg');
    expect(ld).not.toHaveProperty('aggregateRating');
    expect(ld).not.toHaveProperty('offers');
    expect(ld.genre).toEqual(['Puzzle', 'Shooter']);
  });

  it('HowTo steps point at the page anchors', () => {
    const ld = howToJsonLd('Portal 2', howToSteps(handler), '/hub/portal-2');
    expect(ld.name).toBe('How to play Portal 2 split screen on PC');
    expect(ld.step).toHaveLength(4);
    expect(ld.step[0]).toMatchObject({
      '@type': 'HowToStep',
      position: 1,
      url: 'http://localhost:3000/hub/portal-2#step-1',
    });
    expect(ld.tool[0]!.name).toBe('Nucleus Co-op');
  });

  it('CollectionPage lists the page items with absolute URLs and offsets', () => {
    const ld = collectionPageJsonLd({
      name: 'Games',
      description: 'd',
      path: '/hub?page=2',
      startPosition: 49,
      items: [{ name: 'Portal 2', path: '/hub/portal-2' }],
    });
    expect(ld.mainEntity.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 49,
      name: 'Portal 2',
      url: 'http://localhost:3000/hub/portal-2',
    });
  });
});

describe('buildMetadata', () => {
  it('omits robots and images unless set (Next would let them override the root and file-based images)', () => {
    const m = buildMetadata({ title: 'T', path: '/hub' });
    expect(m).not.toHaveProperty('robots');
    expect(m.openGraph).not.toHaveProperty('images');
    expect(m.twitter).not.toHaveProperty('images');
    expect(m.alternates?.canonical).toBe('http://localhost:3000/hub');
    expect(buildMetadata({ title: 'T', noindex: true }).robots).toEqual({ index: false, follow: true });
  });
});
