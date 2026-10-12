import { describe, expect, it } from 'vitest';
import {
  DayAggregator,
  coverIdOf,
  gameKeyOf,
  mapHandler,
  normalizeEmail,
  alignOnStamps,
  pickCurrent,
  planComments,
  planGames,
  planUsers,
  planVersions,
  stampedVersion,
  roleOf,
  utcDay,
} from './transform';
import type { MUser } from './types';

// Synthetic fixtures only: no data from the real hub ever goes into tests.
const NOW = new Date('2026-10-12T00:00:00Z');
const HASH = `$2b$10$${'a'.repeat(53)}`;
const id = (n: number) => `Id${String(n).padStart(15, '0')}`;
const noTaken = () => ({ usernames: new Set<string>(), emails: new Set<string>() });

describe('scalars', () => {
  it('maps a local midnight to its UTC day whatever the server time zone', () => {
    expect(utcDay(new Date('2024-03-01T00:00:00Z'))).toBe('2024-03-01');
    expect(utcDay(new Date('2024-02-29T23:00:00Z'))).toBe('2024-03-01'); // UTC+1 midnight
    expect(utcDay(new Date('2024-03-01T05:00:00Z'))).toBe('2024-03-01'); // UTC-5 midnight
  });

  it('normalises emails and rejects junk', () => {
    expect(normalizeEmail('  Someone@Example.TEST ')).toBe('someone@example.test');
    expect(normalizeEmail('not an email')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it('reads alanning:roles arrays and group objects', () => {
    expect(roleOf(['admin', 'admin_enabled'])).toBe('admin');
    expect(roleOf({ __global_roles__: ['admin'] })).toBe('admin');
    expect(roleOf(['admin_enabled'])).toBe('user');
    expect(roleOf(undefined)).toBe('user');
  });

  it('extracts IGDB cover ids from ids and legacy URLs', () => {
    expect(coverIdOf('co1abc')).toBe('co1abc');
    expect(coverIdOf('https://images.igdb.com/igdb/image/upload/t_cover_big/co2xyz.jpg')).toBe('co2xyz');
    expect(coverIdOf('')).toBeNull();
  });
});

describe('planUsers', () => {
  const base = (n: number, extra: Partial<MUser> = {}): MUser => ({
    _id: id(n),
    createdAt: new Date(2020, 0, n),
    profile: { username: `player${n}` },
    emails: [{ address: `player${n}@example.test`, verified: true }],
    services: { password: { bcrypt: HASH } },
    ...extra,
  });

  it('keeps legacy hashes, roles and verified emails', () => {
    const plan = planUsers([base(1, { roles: ['admin'] })], new Map(), [], noTaken(), NOW);
    const u = plan.users[0]!;
    expect(u).toMatchObject({
      id: id(1),
      username: 'player1',
      email: 'player1@example.test',
      passwordHash: HASH,
      passwordAlgo: 'meteor_sha256_bcrypt',
      role: 'admin',
    });
    expect(u.emailVerifiedAt).toEqual(new Date(2020, 0, 1));
  });

  it('gives a case-insensitive duplicate username a suffix, the most active account keeps it', () => {
    const a = base(1, { profile: { username: 'Ace' } });
    const b = base(2, { profile: { username: 'ace' } });
    const activity = new Map([[id(2), { handlers: 3, comments: 0 }]]);
    const plan = planUsers([a, b], activity, [], noTaken(), NOW);
    const byId = new Map(plan.users.map((u) => [u.id, u.username]));
    expect(byId.get(id(2))).toBe('ace');
    expect(byId.get(id(1))).toBe('Ace-2');
    expect(plan.counts.usernameRenamed).toBe(1);
  });

  it('drops a duplicate email from the less active account and respects names already taken', () => {
    const a = base(1, { emails: [{ address: 'same@example.test', verified: true }] });
    const b = base(2, { emails: [{ address: 'SAME@example.test', verified: false }] });
    const taken = { usernames: new Set(['player1']), emails: new Set<string>() };
    const plan = planUsers([a, b], new Map(), [], taken, NOW);
    const u1 = plan.users.find((u) => u.id === id(1))!;
    const u2 = plan.users.find((u) => u.id === id(2))!;
    expect(u1.email).toBe('same@example.test'); // older account wins the tie
    expect(u2.email).toBeNull();
    expect(u1.username).toBe('player1-2');
  });

  it('falls back to provider data and maps OAuth identities', () => {
    const u: MUser = {
      _id: id(3),
      createdAt: new Date(2021, 5, 1),
      profile: {},
      services: {
        discord: { id: '1234', username: 'disc', email: 'Disc@Example.test', verified: true },
        github: { id: 99, username: 'gh' },
      },
    };
    const plan = planUsers([u], new Map(), [], noTaken(), NOW);
    expect(plan.users[0]).toMatchObject({ username: 'disc', email: 'disc@example.test', passwordHash: null });
    expect(plan.users[0]!.emailVerifiedAt).not.toBeNull();
    expect(plan.oauth.map((o) => [o.provider, o.providerUserId, o.providerUsername])).toEqual([
      ['discord', '1234', 'disc'],
      ['github', '99', 'gh'],
    ]);
  });

  it('creates deleted placeholders for missing owners', () => {
    const plan = planUsers([], new Map(), [id(7)], noTaken(), NOW);
    expect(plan.users[0]).toMatchObject({
      id: id(7),
      username: 'deleted-Id0000',
      deletedAt: NOW,
      email: null,
    });
  });

  it('collects unique starred handler ids', () => {
    const plan = planUsers(
      [base(1, { profile: { username: 'a', starredHandlers: [id(5), id(5), 7] } })],
      new Map(),
      [],
      noTaken(),
      NOW,
    );
    expect(plan.stars.get(id(1))).toEqual([id(5)]);
  });
});

describe('planGames and mapHandler', () => {
  it('builds one game per IGDB id; the most downloaded handler wins', () => {
    const games = planGames([
      { _id: id(1), gameId: 42, gameName: 'Old name', downloadCount: 1, genres: ['Shooter'] },
      {
        _id: id(2),
        gameId: 42,
        gameName: 'New name',
        downloadCount: 9,
        genres: ['Racing', 'Indie', 'Sport', 'Puzzle'],
      },
      { _id: id(3), gameName: 'No Igdb Game', downloadCount: 2 },
    ]);
    expect(games.get('igdb:42')).toMatchObject({
      name: 'New name',
      igdbId: 42,
      genres: ['Racing', 'Indie', 'Sport'],
    });
    expect(games.get('name:no igdb game')).toMatchObject({ igdbId: null });
    expect(gameKeyOf({ _id: id(4), gameId: '42' })).toBe('igdb:42');
  });

  it('maps visibility, approval and limits', () => {
    const row = mapHandler(
      {
        _id: id(1),
        title: ' T ',
        private: false,
        publicAuthorized: true,
        maxPlayers: 99,
        createdAt: '2022-01-01T00:00:00.000Z',
        updatedAt: '2022-02-01T00:00:00.000Z',
        playableControllers: true,
      },
      5,
      id(9),
      NOW,
    );
    expect(row).toMatchObject({
      title: 'T',
      isPublic: true,
      maxPlayers: 64,
      approvedAt: new Date('2022-02-01T00:00:00.000Z'),
      publishedAt: new Date('2022-02-01T00:00:00.000Z'),
      supportsControllers: true,
      supportsKeyboardMouse: null,
    });
    const priv = mapHandler({ _id: id(2), private: true, publicAuthorized: false }, 5, id(9), NOW);
    expect(priv).toMatchObject({ isPublic: false, approvedAt: null, publishedAt: null, maxPlayers: 2 });
  });
});

describe('planVersions', () => {
  const pkg = (n: number, handler: string, version: unknown, day: number, file = true) => ({
    _id: id(n),
    meta: { handlerId: handler, handlerVersion: version, releaseDate: new Date(2023, 0, day) },
    versions: file ? { original: { meta: { gridFsFileId: 'ab'.repeat(12) } } } : {},
  });

  it('keeps distinct versions and renumbers duplicates by release date', () => {
    const h1 = id(100);
    const h2 = id(200);
    const plan = planVersions(
      [
        pkg(1, h1, 1, 1),
        pkg(2, h1, 2, 2),
        pkg(3, h2, 1, 5),
        pkg(4, h2, 1, 3),
        pkg(5, h2, undefined, 9),
        pkg(6, id(999), 1, 1),
        pkg(7, h1, undefined, 8, false),
      ],
      new Set([h1, h2]),
    );
    expect(plan.numbers.get(id(1))).toBe(1);
    expect(plan.numbers.get(id(2))).toBe(2);
    expect([plan.numbers.get(id(4)), plan.numbers.get(id(3)), plan.numbers.get(id(5))]).toEqual([1, 2, 3]);
    expect(plan.renumbered).toEqual(new Set([h2]));
    expect(plan.orphans).toEqual([id(6)]);
    expect(plan.noFile).toEqual([id(7)]);
  });

  it('gives packages older than the numbered ones the numbers just below the first', () => {
    const h = id(100);
    const only = id(300);
    const plan = planVersions(
      [
        pkg(1, h, undefined, 1),
        pkg(2, h, undefined, 2),
        pkg(3, h, 3, 3),
        pkg(4, h, 4, 4),
        pkg(5, only, undefined, 2),
        pkg(6, only, undefined, 1),
      ],
      new Set([h, only]),
    );
    expect([1, 2, 3, 4].map((n) => plan.numbers.get(id(n)))).toEqual([1, 2, 3, 4]);
    expect([plan.numbers.get(id(6)), plan.numbers.get(id(5))]).toEqual([1, 2]);
    expect(plan.filled).toEqual(new Set([h, only]));
    expect(plan.renumbered.size).toBe(0);
  });

  it('reads the stamped Hub.Handler.Version', () => {
    expect(
      stampedVersion('Hub.Handler.Version = 7;       // Released at the hub on x.\nGame.GameName = "a";'),
    ).toBe(7);
    expect(stampedVersion('Hub.Handler.Id = "x";\n  Hub.Handler.Version = 12; // Released\n')).toBe(12);
    expect(stampedVersion('// Hub.Handler.Version = 3;')).toBeNull();
    expect(stampedVersion('Hub.Handler.Version = 0;')).toBeNull();
    expect(stampedVersion(undefined)).toBeNull();
  });

  it('aligns renumbered versions on the stamps installed copies carry', () => {
    const h = id(100);
    // Duplicates 5, 5 (a race in the old hub) then the current package, stamped 7.
    const list = [
      pkg(1, h, 5, 1),
      pkg(2, h, 5, 2),
      pkg(3, h, 6, 3),
      pkg(4, h, 7, 4),
      pkg(5, h, undefined, 5),
    ];
    const stamps = new Map([
      [id(1), 5],
      [id(2), 5],
      [id(3), 6],
      [id(4), 7],
    ]);
    const plan = planVersions(list, new Set([h]));
    expect(plan.renumbered).toEqual(new Set([h]));
    expect(plan.numbers.get(id(4))).toBe(4); // 1..n by date: the current package would say 4, installs say 7
    const aligned = alignOnStamps(list, id(4), (p) => stamps.get(p._id) ?? null)!;
    expect(aligned.get(id(4))).toBe(7); // current = its stamp
    expect(aligned.get(id(2))).toBe(5); // the latest carrier of 5 keeps it
    expect(aligned.get(id(3))).toBe(6);
    expect([aligned.get(id(1)), aligned.get(id(5))]).toEqual([1, 2]); // lowest free numbers, by date
    expect(new Set(aligned.values()).size).toBe(5);
    expect(Math.max(...aligned.values())).toBe(7); // the next upload is 8, above every install
    // The current package wins its stamp over a later carrier.
    const again = alignOnStamps(list, id(1), (p) => stamps.get(p._id) ?? null)!;
    expect(again.get(id(1))).toBe(5);
    expect(again.get(id(2))).not.toBe(5);
    expect(alignOnStamps(list, id(4), () => null)).toBeNull();
  });

  it('picks the current package, else the highest imported version', () => {
    const imported = [
      { id: 'a', version: 1 },
      { id: 'b', version: 3 },
    ];
    expect(pickCurrent('a', imported)).toEqual({ id: 'a', version: 1 });
    expect(pickCurrent('gone', imported)).toEqual({ id: 'b', version: 3 });
    expect(pickCurrent('a', [])).toBeNull();
  });
});

describe('planComments', () => {
  it('skips orphans, re-roots replies to replies and nulls unknown authors', () => {
    const h = id(1);
    const plan = planComments(
      [
        { _id: id(10), handlerId: h, owner: id(50), content: ' root ', createdAt: '2023-01-01T00:00:00Z' },
        { _id: id(11), handlerId: h, owner: id(51), content: 'reply', replyTo: id(10) },
        { _id: id(12), handlerId: h, owner: id(50), content: 'reply to reply', replyTo: id(11) },
        { _id: id(13), handlerId: h, owner: id(50), content: 'lost parent', replyTo: id(99) },
        { _id: id(14), handlerId: id(2), owner: id(50), content: 'orphan' },
      ],
      new Set([h]),
      new Set([id(50)]),
      NOW,
    );
    expect(plan.roots.map((c) => c.id).sort()).toEqual([id(10), id(13)]);
    expect(plan.roots.find((c) => c.id === id(10))!.body).toBe('root');
    expect(plan.replies.map((c) => [c.id, c.parentId, c.authorId])).toEqual([
      [id(11), id(10), null],
      [id(12), id(10), id(50)],
    ]);
    expect(plan.counts).toMatchObject({
      skippedOrphan: 1,
      parentMissing: 1,
      reattachedToRoot: 1,
      authorUnknown: 1,
    });
  });
});

describe('DayAggregator', () => {
  it('sums per handler and UTC day and releases finished days', () => {
    const h = id(1);
    const agg = new DayAggregator(new Set([h]));
    expect(agg.add(h, new Date('2024-01-01T00:00:00Z'), 2)).toEqual([]);
    expect(agg.add(h, new Date('2024-01-01T01:00:00Z'), 3)).toEqual([]); // same day, other time zone
    expect(agg.add(h, new Date('2024-01-02T00:00:00Z'), 1)).toEqual([
      { handlerId: h, day: '2024-01-01', downloads: 5 },
    ]);
    expect(agg.add(id(2), new Date('2024-01-02T00:00:00Z'), 1)).toEqual([]);
    expect(agg.flush()).toEqual([{ handlerId: h, day: '2024-01-02', downloads: 1 }]);
    expect(agg.counts.mergedSameDay).toBe(1);
    expect(agg.counts.skippedOrphan).toBe(1);
  });
});
