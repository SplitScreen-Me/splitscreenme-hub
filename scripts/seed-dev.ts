/**
 * Synthetic development data, built from the public catalogue snapshot in scripts/seed/catalog-snapshot.json
 * (game names, IGDB covers, Steam ids, counters; author names replaced by creator-01...). No real accounts.
 *
 * Users (password "password"): admin@example.test (admin), mod@example.test (moderator), user@example.test.
 * Visibility fixtures owned by dev-user: a private, an unapproved, a deleted and a version-less handler.
 * Package files (tiny stamped zips) go to STORAGE_DIR/packages unless --no-files.
 *
 * Usage: npm run db:seed -- [--reset] [--no-files] [--force]
 *   --reset     empty every table first (required when the database is not empty)
 *   --force     allow a non-local DATABASE_URL (never do this against production)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import yazl from 'yazl';
import { createDb } from '../src/db';
import * as s from '../src/db/schema';
import { newId } from '../src/lib/ids';
import { slugify } from '../src/lib/slug';

interface SnapshotHandler {
  id: string;
  game: string;
  title: string;
  cover: string | null;
  steam: number | null;
  downloads: number;
  trend: number;
  players: number;
  verified: boolean;
  pad: boolean;
  kbm: boolean;
  multiKbm: boolean;
  version: number;
  updated: string;
  tags: string[];
  creator: number;
}

const args = new Set(process.argv.slice(2));
if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('seed: DATABASE_URL is not set (see .env.example)');
  process.exit(1);
}
const host = new URL(url).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !args.has('--force')) {
  console.error(`seed: refusing to seed a non-local database (${host}); pass --force if you really mean it`);
  process.exit(1);
}
const siteUrl = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const storageDir = path.resolve(process.env.STORAGE_DIR ?? './storage');
const writeFiles = !args.has('--no-files');

const TAG_GENRES: Record<string, string[]> = {
  zombies: ['Shooter'],
  shooters: ['Shooter'],
  survival: ['Adventure'],
  soulslike: ['Role-playing (RPG)'],
  party: ['Arcade'],
};
const GENRE_POOL = [
  'Adventure',
  'Platform',
  'Racing',
  'Fighting',
  'Sport',
  'Shooter',
  'Role-playing (RPG)',
  'Puzzle',
  'Strategy',
  "Hack and slash/Beat 'em up",
];
const hashNum = (str: string) => createHash('sha1').update(str).digest().readUInt32BE(0);

function genresFor(game: string, tags: string[]): string[] {
  const fromTags = [...new Set(tags.flatMap((t) => TAG_GENRES[t] ?? []))];
  const h = hashNum(game);
  const picked = fromTags.length ? fromTags : [GENRE_POOL[h % GENRE_POOL.length]!];
  if (h % 3 === 0) picked.push('Indie');
  return [...new Set(picked)].slice(0, 3);
}

const stampedScript = (o: {
  handlerId: string;
  version: number;
  owner: string;
  ownerId: string;
  game: string;
  players: number;
  date: Date;
}) =>
  [
    `Hub.Handler.Version = ${o.version}; // Released at ${siteUrl} on ${o.date.toISOString()}.`,
    `Hub.Handler.Id = "${o.handlerId}";`,
    `Hub.Maintainer.Name = ${JSON.stringify(o.owner)};`,
    `Hub.Maintainer.Id = "${o.ownerId}";`,
    '// Synthetic development handler: not a real game integration.',
    `Game.GameName = ${JSON.stringify(o.game)};`,
    'Game.ExecutableName = "game.exe";',
    `Game.MaxPlayers = ${o.players};`,
    '',
  ].join('\r\n');

function zip(files: { name: string; content: string }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const z = new yazl.ZipFile();
    for (const f of files)
      z.addBuffer(Buffer.from(f.content, 'utf8'), f.name, { mtime: new Date('2026-01-01T00:00:00Z') });
    const chunks: Buffer[] = [];
    z.outputStream.on('data', (c: Buffer) => chunks.push(c));
    z.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    z.outputStream.on('error', reject);
    z.end();
  });
}

async function main() {
  const db = createDb(url!, { max: 2 });
  const started = Date.now();
  try {
    const [{ n }] = (await db.execute<{ n: number }>(
      sql`select count(*)::int as n from users`,
    )) as unknown as [{ n: number }];
    if (n > 0 && !args.has('--reset')) {
      console.error('seed: the database is not empty; pass --reset to wipe it first');
      process.exitCode = 1;
      return;
    }
    if (args.has('--reset')) {
      await db.execute(sql`
        do $$ declare r record; begin
          for r in select tablename from pg_tables where schemaname = 'public' loop
            execute 'truncate table ' || quote_ident(r.tablename) || ' restart identity cascade';
          end loop;
        end $$;`);
    }

    const snapshot = JSON.parse(readFileSync('scripts/seed/catalog-snapshot.json', 'utf8')) as {
      games: SnapshotHandler[];
    };
    const passwordHash = await bcrypt.hash('password', 11);
    const now = new Date();

    // ---- users ----
    const dev = {
      admin: { id: newId(), username: 'dev-admin', email: 'admin@example.test', role: 'admin' as const },
      mod: { id: newId(), username: 'dev-moderator', email: 'mod@example.test', role: 'moderator' as const },
      user: { id: newId(), username: 'dev-user', email: 'user@example.test', role: 'user' as const },
    };
    const creatorCount = Math.max(...snapshot.games.map((g) => g.creator));
    const creators = Array.from({ length: creatorCount }, (_, i) => ({
      id: newId(),
      username: `creator-${String(i + 1).padStart(2, '0')}`,
    }));
    await db.insert(s.users).values([
      ...Object.values(dev).map((u) => ({
        ...u,
        emailVerifiedAt: now,
        passwordHash,
        passwordAlgo: 'bcrypt' as const,
        createdAt: new Date('2022-01-01T00:00:00Z'),
      })),
      ...creators.map((c, i) => ({
        ...c,
        email: `${c.username}@example.test`,
        emailVerifiedAt: now,
        trustedAuthor: i < 5,
        createdAt: new Date(Date.UTC(2020, i % 12, 1 + (i % 27))),
      })),
    ]);

    // ---- games ----
    const gameIds = new Map<string, number>();
    const usedSlugs = new Set<string>();
    const gameRows = [...new Map(snapshot.games.map((g) => [g.game, g])).values()].map((g) => {
      let slug = slugify(g.game) || 'game';
      for (let n = 2; usedSlugs.has(slug); n++) slug = `${slugify(g.game) || 'game'}-${n}`;
      usedSlugs.add(slug);
      return {
        slug,
        name: g.game,
        coverImageId: g.cover,
        steamAppId: g.steam,
        genres: genresFor(g.game, g.tags),
        summary: `${g.game} is a game you can play in split screen with Nucleus Co-op. (Synthetic summary.)`,
      };
    });
    const insertedGames = await db
      .insert(s.games)
      .values(gameRows)
      .returning({ id: s.games.id, name: s.games.name });
    for (const g of insertedGames) gameIds.set(g.name, g.id);

    // ---- handlers and versions ----
    const handlerRows: (typeof s.handlers.$inferInsert)[] = [];
    const versionRows: (typeof s.handlerVersions.$inferInsert)[] = [];
    const currents: { id: string; versionId: string; version: number }[] = [];
    const today = now.toISOString().slice(0, 10);
    const dayRows: (typeof s.handlerDownloadDays.$inferInsert)[] = [];

    async function addVersions(
      h: { id: string; ownerId: string; owner: string; game: string; players: number },
      current: number,
      updated: Date,
      verified: boolean,
    ) {
      const numbers = [...new Set([Math.max(1, current - 1), current])];
      let currentId = '';
      for (const v of numbers) {
        const versionId = newId();
        const date = new Date(updated.getTime() - (current - v) * 30 * 86_400_000);
        const script = stampedScript({
          handlerId: h.id,
          version: v,
          owner: h.owner,
          ownerId: h.ownerId,
          game: h.game,
          players: h.players,
          date,
        });
        const file = await zip([
          { name: 'handler.js', content: script },
          { name: 'README.txt', content: 'Synthetic development package.\r\n' },
        ]);
        const storageKey = `packages/${h.id}/${versionId}.nc`;
        if (writeFiles) {
          const full = path.join(storageDir, storageKey);
          await mkdir(path.dirname(full), { recursive: true });
          await writeFile(full, file);
        }
        versionRows.push({
          id: versionId,
          handlerId: h.id,
          version: v,
          releaseNotes:
            v === current ? 'Latest fixes and improvements. (Synthetic.)' : 'Initial release. (Synthetic.)',
          uploaderId: h.ownerId,
          storageKey,
          fileName: `handler-${h.id}-v${v}.nc`,
          sizeBytes: file.length,
          sha256: createHash('sha256').update(file).digest('hex'),
          script,
          manifest: [
            { path: 'handler.js', size: Buffer.byteLength(script) },
            { path: 'README.txt', size: 32 },
          ],
          verifiedAt: verified && v === current ? updated : null,
          createdAt: date,
        });
        if (v === current) currentId = versionId;
      }
      currents.push({ id: h.id, versionId: currentId, version: current });
    }

    for (const g of snapshot.games) {
      const owner = creators[g.creator - 1]!;
      const updated = new Date(`${g.updated}T12:00:00Z`);
      const players = Math.min(64, Math.max(1, g.players || 2));
      handlerRows.push({
        id: g.id,
        gameId: gameIds.get(g.game)!,
        ownerId: owner.id,
        title: g.title,
        description: `## About\n\nPlay **${g.game}** with up to ${players} players on one PC.\n\n- Synthetic description for development.\n- Links stay [nofollow](https://example.com).`,
        maxPlayers: players,
        supportsControllers: g.pad,
        supportsKeyboardMouse: g.kbm,
        supportsMultiKeyboardMouse: g.multiKbm,
        isPublic: true,
        approvedAt: updated,
        approvedById: dev.mod.id,
        publishedAt: updated,
        downloadCount: g.downloads,
        trendScore: g.trend,
        createdAt: new Date(updated.getTime() - 400 * 86_400_000),
        updatedAt: updated,
      });
      if (g.trend > 0) dayRows.push({ handlerId: g.id, day: today, downloads: g.trend });
      await addVersions(
        { id: g.id, ownerId: owner.id, owner: owner.username, game: g.game, players },
        Math.max(1, g.version || 1),
        updated,
        g.verified,
      );
    }

    // Visibility fixtures (must never show publicly): owned by dev-user, on the first game.
    const firstGame = gameRows[0]!.name;
    const fixtures = [
      { id: newId(), title: `${firstGame} (private fixture)`, isPublic: false, approvedAt: now },
      { id: newId(), title: `${firstGame} (awaiting approval fixture)`, isPublic: true, approvedAt: null },
      {
        id: newId(),
        title: `${firstGame} (deleted fixture)`,
        isPublic: true,
        approvedAt: now,
        deletedAt: now,
      },
      { id: newId(), title: `${firstGame} (draft fixture)`, isPublic: false, approvedAt: null, draft: true },
    ];
    for (const f of fixtures) {
      const { draft, ...rest } = f as typeof f & { draft?: boolean };
      handlerRows.push({
        ...rest,
        gameId: gameIds.get(firstGame)!,
        ownerId: dev.user.id,
        maxPlayers: 2,
        description: 'Visibility fixture.',
      });
      if (!draft)
        await addVersions(
          { id: f.id, ownerId: dev.user.id, owner: 'dev-user', game: firstGame, players: 2 },
          1,
          now,
          false,
        );
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < handlerRows.length; i += 500)
        await tx.insert(s.handlers).values(handlerRows.slice(i, i + 500));
      for (let i = 0; i < versionRows.length; i += 500)
        await tx.insert(s.handlerVersions).values(versionRows.slice(i, i + 500));
      for (const c of currents) {
        await tx
          .update(s.handlers)
          .set({ currentVersionId: c.versionId, currentVersion: c.version })
          .where(eq(s.handlers.id, c.id));
      }
      if (dayRows.length) await tx.insert(s.handlerDownloadDays).values(dayRows);

      // community: stars, comments with a reply, one open report (counters kept consistent)
      const top = snapshot.games.slice(0, 5).map((g) => g.id);
      await tx
        .insert(s.handlerStars)
        .values(
          top
            .slice(0, 3)
            .flatMap((handlerId) => Object.values(dev).map((u) => ({ userId: u.id, handlerId }))),
        );
      for (const handlerId of top) {
        const rootId = newId();
        await tx.insert(s.comments).values([
          {
            id: rootId,
            handlerId,
            authorId: dev.user.id,
            body: 'Works great with two controllers, thanks! (synthetic)',
          },
          {
            id: newId(),
            handlerId,
            authorId: dev.mod.id,
            parentId: rootId,
            body: 'Glad it works. Remember to update Nucleus Co-op. (synthetic)',
          },
        ]);
      }
      await tx.insert(s.reports).values({
        targetType: 'handler',
        handlerId: top[4]!,
        reason: 'broken',
        message: 'Crashes on launch with 3 players. (synthetic)',
        source: 'web',
        reporterId: dev.user.id,
      });
      await tx.execute(sql`
        update handlers h set
          star_count = (select count(*) from handler_stars s where s.handler_id = h.id),
          comment_count = (select count(*) from comments c where c.handler_id = h.id and c.deleted_at is null),
          open_report_count = (select count(*) from reports r where r.handler_id = h.id and r.status = 'open')`);
    });
    await db.execute(sql`analyze`);

    console.log(
      `seed: ${Object.keys(dev).length + creators.length} users, ${gameRows.length} games, ${handlerRows.length} handlers ` +
        `(${fixtures.length} hidden fixtures), ${versionRows.length} versions` +
        `${writeFiles ? ` (files in ${storageDir})` : ' (no files)'} in ${Date.now() - started} ms.`,
    );
    console.log(
      'seed: log in with admin@example.test, mod@example.test or user@example.test, password "password".',
    );
  } finally {
    await db.$close();
  }
}

main().catch((err: unknown) => {
  console.error('seed: failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
