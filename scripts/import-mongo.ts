/**
 * Mongo (Meteor hub) to Postgres importer: docs/ARCHITECTURE.md section 3, runbook in scripts/README.md.
 * Run locally with tsx, bundled to dist/import.mjs for the server image (compose service `importer`).
 *
 *   tsx scripts/import-mongo.ts [--reset] [--igdb] [--skip-files] [--only <phase,...>] [--dry-run]
 *
 * Environment: MONGO_URL (required), MONGO_DB (default hubdb), DATABASE_URL (required; read from
 * .env.local when unset), STORAGE_DIR (default ./storage), IMPORT_CONFIRM=ssm-v3 (required by --reset),
 * IGDB_CLIENT_ID / IGDB_CLIENT_SECRET (with --igdb).
 *
 * Modes:
 *   default   upsert: catalogue data (games, handlers, versions, download days) is refreshed from Mongo,
 *             except what v3 owns: a handler, version or game changed on v3 (audit log) keeps its
 *             v3 state, a newer version uploaded on v3 stays current, and download counters add Mongo's
 *             new downloads to the ones counted on v3 (imported_* baselines). Handlers and versions gone
 *             from Mongo are soft-deleted (up to a safety cap). Accounts and community rows (users,
 *             OAuth, stars, comments, reports) are only inserted when missing. Safe to re-run.
 *   --reset   truncate-and-reload: every table except audit_log is emptied first (sessions too).
 *   --dry-run reads and maps everything, checks the GridFS files exist, writes nothing.
 * Each phase runs in its own transaction. Package files are exported incrementally (a file already on
 * disk with the same GridFS id and size is kept). Output: counts and ids only, never personal data.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { MongoClient, type Db as MongoDb } from 'mongodb';
import { createDb, type Db, type Tx } from '../src/db';
import * as s from '../src/db/schema';
import { uniqueGameSlug } from '../src/lib/slug';
import { PackageFiles, type ExportedFile } from './import/files';
import {
  DayAggregator,
  alignOnStamps,
  counter,
  gameKeyOf,
  gridFsIdOf,
  hasNul,
  int,
  isId,
  mapHandler,
  pickCurrent,
  planComments,
  planGames,
  planUsers,
  planVersions,
  stampedVersion,
  str,
  toDate,
  type Activity,
  type Counts,
  type GamePlan,
  type HandlerRow,
} from './import/transform';
import type { MComment, MHandler, MPackage, MUser } from './import/types';

// ---------- arguments and environment ----------

const PHASES = [
  'users',
  'games',
  'handlers',
  'files',
  'versions',
  'stars',
  'comments',
  'downloads',
  'reports',
  'counters',
] as const;
type Phase = (typeof PHASES)[number];

const argv = process.argv.slice(2);
const flags = new Set<string>();
let only: Phase[] | null = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === '--only' || a.startsWith('--only=')) {
    const value = a === '--only' ? argv[++i] : a.slice('--only='.length);
    const list = (value ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const bad = list.filter((x) => !(PHASES as readonly string[]).includes(x));
    if (!list.length || bad.length) fail(`--only takes phases among ${PHASES.join(',')}`, 2);
    only = list as Phase[];
  } else if (['--reset', '--igdb', '--skip-files', '--dry-run', '--help'].includes(a)) {
    flags.add(a);
  } else {
    fail(`unknown argument ${a} (see --help)`, 2);
  }
}
if (flags.has('--help')) {
  console.log(
    'usage: import-mongo [--reset] [--igdb] [--skip-files] [--only <phase,...>] [--dry-run]\n' +
      `phases: ${PHASES.join(', ')}\nsee scripts/README.md`,
  );
  process.exit(0);
}
const RESET = flags.has('--reset');
const DRY = flags.has('--dry-run');
const IGDB = flags.has('--igdb');
const SKIP_FILES = flags.has('--skip-files');
if (RESET && only) fail('--reset reloads everything: it cannot be combined with --only', 2);
if (RESET && DRY) fail('--reset and --dry-run are exclusive', 2);

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
const MONGO_URL = process.env.MONGO_URL ?? '';
const MONGO_DB = process.env.MONGO_DB || 'hubdb';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || './storage');
if (!/^mongodb(\+srv)?:\/\//.test(MONGO_URL)) fail('MONGO_URL is not set (mongodb://...)');
if (!/^postgres(ql)?:\/\//.test(DATABASE_URL)) fail('DATABASE_URL is not set (postgres://...)');
if (RESET && process.env.IMPORT_CONFIRM !== 'ssm-v3') {
  fail('--reset empties the database: set IMPORT_CONFIRM=ssm-v3 to confirm');
}
const runs = (p: Phase) => !only || only.includes(p);

function fail(message: string, code = 1): never {
  console.error(`import: ${message}`);
  process.exit(code);
}

/** Host, port and database of a URL, never its credentials or query. */
function describe(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '(default)'}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return '(unparsable URL)';
  }
}

const log = (msg: string) => console.log(`import: ${msg}`);
const fmt = (c: Counts) =>
  Object.entries(c)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ---------- report ----------

interface Check {
  name: string;
  expected: number;
  actual: number;
  ok: boolean;
}

const report = {
  startedAt: new Date().toISOString(),
  finishedAt: '',
  mode: RESET ? 'reset' : DRY ? 'dry-run' : 'upsert',
  phases: [] as string[],
  options: { igdb: IGDB, skipFiles: SKIP_FILES, only },
  source: {} as Counts,
  imported: {} as Counts,
  details: {} as Record<string, Counts>,
  checks: [] as Check[],
  /** ids only (handlers, versions), capped */
  skipped: {
    versionIds: [] as string[],
    handlerIdsWithoutVersion: [] as string[],
    /** Mongo packages whose number a version uploaded on v3 already uses */
    versionCollisionIds: [] as string[],
  },
  /** ids only, capped: what this run changed beyond a plain refresh */
  changed: {
    /** handlers whose planned numbers disagreed with the stamped Hub.Handler.Version: now they follow it */
    alignedOnStampsHandlerIds: [] as string[],
    /** renumbered handlers without any stamp: 1..n by release date (installs cannot compare anyway) */
    unstampedRenumberedHandlerIds: [] as string[],
    /** gone from Mongo: soft-deleted (or only listed when over the safety cap) */
    goneFromMongoHandlerIds: [] as string[],
    goneFromMongoVersionIds: [] as string[],
  },
  durationsMs: {} as Counts,
  ok: false,
};

function check(name: string, expected: number, actual: number) {
  report.checks.push({ name, expected, actual, ok: expected === actual });
}

const MAX_IDS = 200;

function pushId(list: string[], id: string) {
  if (list.length < MAX_IDS) list.push(id);
}

/** More disappearances than this in one run means a wrong source (MONGO_DB?): nothing is deleted. */
const pruneCap = (sourceCount: number) => Math.max(25, Math.ceil(sourceCount * 0.02));

/**
 * What v3 owns in upsert mode (docs/ARCHITECTURE.md section 3): handlers with a handler.* or version.*
 * audit entry (edits, moderation, uploads) or whose owner was banned or deleted on v3, versions verified
 * or unverified on v3, games edited on v3, and what was created on v3. Empty after --reset.
 */
async function v3Owned(db: Db) {
  const rows = (await db.execute(sql`
    select 'handler' as kind, coalesce(details->>'handlerId', target_id) as id from audit_log
      where (target_type = 'handler' and action like 'handler.%') or (target_type = 'version' and action like 'version.%')
    union select 'handler', h.id from handlers h join users u on u.id = h.owner_id
      where u.banned_at is not null or u.deleted_at is not null
    union select 'verified', target_id from audit_log
      where target_type = 'version' and action in ('version.verify', 'version.unverify')
    union select 'game', target_id from audit_log where target_type = 'game' and action like 'game.%'
    union select 'createdHandler', target_id from audit_log where action = 'handler.create'
    union select 'uploadedVersion', target_id from audit_log where action = 'version.upload'`)) as unknown as {
    kind: string;
    id: string | null;
  }[];
  const of = (kind: string) => new Set(rows.flatMap((r) => (r.kind === kind && r.id ? [r.id] : [])));
  return {
    handlers: of('handler'),
    verifiedVersions: of('verified'),
    games: new Set([...of('game')].map(Number)),
    createdHandlers: of('createdHandler'),
    uploadedVersions: of('uploadedVersion'),
  };
}

// ---------- main ----------

async function main() {
  const now = new Date();
  log(
    `mode ${report.mode}; mongo ${describe(MONGO_URL)} db ${MONGO_DB}; postgres ${describe(DATABASE_URL)}; storage ${STORAGE_DIR}`,
  );

  const mongo = new MongoClient(MONGO_URL, {
    appName: 'ssm-v3-import',
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 15_000,
  });
  await mongo.connect();
  const mdb = mongo.db(MONGO_DB);
  const db = createDb(DATABASE_URL, { max: 2 });

  try {
    await run(mdb, db, now);
  } finally {
    await mongo.close().catch(() => {});
    await db.$close().catch(() => {});
  }
}

async function phase<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  const out = await fn();
  report.durationsMs[name] = Date.now() - t;
  report.phases.push(name);
  log(`${name}: done in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return out;
}

async function run(mdb: MongoDb, db: Db, now: Date) {
  // ---- read the source (small collections fully, never the package scripts or file chunks) ----
  const col = {
    users: mdb.collection<MUser>('users'),
    handlers: mdb.collection<MHandler>('Handlers'),
    packages: mdb.collection<MPackage>('packages'),
    comments: mdb.collection<MComment>('Comments'),
    stats: mdb.collection('HandlersStats'),
  };
  const usersSrc = await col.users
    .find(
      {},
      {
        projection: {
          createdAt: 1,
          'profile.username': 1,
          'profile.starredHandlers': 1,
          emails: 1,
          'services.password.bcrypt': 1,
          'services.discord.id': 1,
          'services.discord.username': 1,
          'services.discord.email': 1,
          'services.discord.verified': 1,
          'services.github.id': 1,
          'services.github.username': 1,
          'services.github.email': 1,
          'services.google.id': 1,
          'services.google.email': 1,
          'services.google.verified_email': 1,
          'services.facebook.id': 1,
          'services.facebook.email': 1,
          roles: 1,
        },
      },
    )
    .toArray();
  const handlersSrc = await col.handlers.find({}, { projection: { lastJs: 0, ownerName: 0 } }).toArray();
  const packagesSrc = await col.packages
    .find(
      {},
      {
        projection: {
          userId: 1,
          'meta.handlerId': 1,
          'meta.handlerVersion': 1,
          'meta.releaseDescription': 1,
          'meta.ownerId': 1,
          'meta.releaseDate': 1,
          'meta.downloads': 1,
          'meta.verified': 1,
          'versions.original.meta.gridFsFileId': 1,
        },
      },
    )
    .toArray();
  const commentsSrc = await col.comments.find({}, { projection: { ownerName: 0 } }).toArray();
  const statsCount = await col.stats.countDocuments();
  const filesCount = await mdb.collection('fs.files').countDocuments();
  report.source = {
    users: usersSrc.length,
    Handlers: handlersSrc.length,
    packages: packagesSrc.length,
    Comments: commentsSrc.length,
    HandlersStats: statsCount,
    'fs.files': filesCount,
  };
  log(`source: ${fmt(report.source)}`);

  // ---- plan (pure, in memory) ----
  const validHandlers = handlersSrc.filter((h) => isId(h._id));
  const handlerIdSet = new Set(validHandlers.map((h) => h._id));
  const sourceUserIds = new Set(usersSrc.filter((u) => isId(u._id)).map((u) => u._id));

  const activity = new Map<string, Activity>();
  const act = (id: unknown) => {
    if (!isId(id)) return null;
    const a = activity.get(id) ?? { handlers: 0, comments: 0 };
    activity.set(id, a);
    return a;
  };
  for (const h of validHandlers) {
    const a = act(h.owner);
    if (a) a.handlers++;
  }
  for (const c of commentsSrc) {
    const a = act(c.owner);
    if (a) a.comments++;
  }

  const UNKNOWN_OWNER = 'ImportUnknownOwner';
  const ownerOf = (h: MHandler): string => (isId(h.owner) ? h.owner : UNKNOWN_OWNER);
  const placeholderIds = [
    ...new Set(validHandlers.map(ownerOf).filter((id) => !sourceUserIds.has(id))),
  ].sort();

  // Accounts already in the target that this import does not own keep their usernames and emails.
  const taken = { usernames: new Set<string>(), emails: new Set<string>() };
  if (!RESET) {
    const own = new Set([...sourceUserIds, ...placeholderIds]);
    const rows = await db
      .select({ id: s.users.id, username: s.users.username, email: s.users.email })
      .from(s.users);
    for (const r of rows) {
      if (own.has(r.id)) continue;
      taken.usernames.add(r.username.toLowerCase());
      if (r.email) taken.emails.add(r.email.toLowerCase());
    }
  }

  const usersPlan = planUsers(usersSrc, activity, placeholderIds, taken, now);
  report.details.users = usersPlan.counts;
  const importedUserIds = new Set(usersPlan.users.map((u) => u.id));

  const games = planGames(validHandlers);
  const gameDownloads = new Map<string, number>();
  for (const h of validHandlers) {
    const k = gameKeyOf(h);
    gameDownloads.set(k, (gameDownloads.get(k) ?? 0) + counter(h.downloadCount));
  }

  const versionPlan = planVersions(packagesSrc, handlerIdSet);
  report.details.versions = {
    orphanPackages: versionPlan.orphans.length,
    packagesWithoutFile: versionPlan.noFile.length,
    handlersFilledBelow: versionPlan.filled.size,
    handlersRenumbered: versionPlan.renumbered.size,
  };
  const comments = planComments(commentsSrc, handlerIdSet, importedUserIds, now);
  report.details.comments = comments.counts;
  report.details.handlers = { skippedInvalidId: handlersSrc.length - validHandlers.length };

  log(
    `plan: users=${usersPlan.users.length} (placeholders ${placeholderIds.length}) oauth=${usersPlan.oauth.length} ` +
      `games=${games.size} handlers=${validHandlers.length} packages=${versionPlan.numbers.size} ` +
      `comments=${comments.roots.length + comments.replies.length}`,
  );
  log(`users: ${fmt(usersPlan.counts)}`);

  // ---- files are checked even in a dry run ----
  const files = new PackageFiles(mdb, STORAGE_DIR);
  const gridFsFiles = await files.loadGridFs();
  report.source['fs.files (readable)'] = gridFsFiles;

  if (DRY) {
    const d: Counts = { noGridFsId: versionPlan.noFile.length, gridFsMissing: 0, ok: 0 };
    for (const p of packagesSrc) {
      if (!versionPlan.numbers.has(p._id)) continue;
      const g = gridFsIdOf(p);
      if (!g) d.noGridFsId!++;
      else if (files.gridFsLength(g) === null) d.gridFsMissing!++;
      else d.ok!++;
    }
    report.details.files = d;
    log(`dry run: files ${fmt(d)}; nothing written`);
    report.ok = true;
    return;
  }

  // ---- reset ----
  if (RESET) {
    await phase('reset', () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`
          do $$ declare list text; begin
            select string_agg(quote_ident(tablename), ', ') into list
              from pg_tables where schemaname = 'public' and tablename <> 'audit_log';
            if list is not null then execute 'truncate table ' || list || ' restart identity cascade'; end if;
          end $$;`);
      }),
    );
  }

  const empty = new Set<string>();
  const owned = RESET
    ? {
        handlers: empty,
        verifiedVersions: empty,
        games: new Set<number>(),
        createdHandlers: empty,
        uploadedVersions: empty,
      }
    : await v3Owned(db);
  const mongoPackageIds = new Set(packagesSrc.map((p) => String(p._id)));

  // ---- 1. users, placeholders, OAuth identities ----
  if (runs('users')) {
    await phase('users', () =>
      db.transaction(async (tx) => {
        // Upsert mode: accounts already in Postgres are left alone. A new account must not take a
        // username or email that an existing one uses now (an imported user may have renamed on v3).
        let fresh = usersPlan.users;
        if (!RESET) {
          const rows = await tx
            .select({ id: s.users.id, username: s.users.username, email: s.users.email })
            .from(s.users);
          const ids = new Set(rows.map((r) => r.id));
          const names = new Set(rows.map((r) => r.username.toLowerCase()));
          const emails = new Set(rows.flatMap((r) => (r.email ? [r.email.toLowerCase()] : [])));
          fresh = usersPlan.users
            .filter((u) => !ids.has(u.id))
            .map((u) => {
              let username = u.username;
              for (let n = 2; names.has(username.toLowerCase()); n++) username = `${u.username}-${n}`;
              names.add(username.toLowerCase());
              const email = u.email && !emails.has(u.email) ? u.email : null;
              if (email) emails.add(email);
              return { ...u, username, email, emailVerifiedAt: email ? u.emailVerifiedAt : null };
            });
          report.details.users = {
            ...report.details.users,
            alreadyInPostgres: usersPlan.users.length - fresh.length,
          };
        }
        for (const part of chunk(fresh, 500)) {
          await tx.insert(s.users).values(part).onConflictDoNothing({ target: s.users.id });
        }
        for (const part of chunk(usersPlan.oauth, 500)) {
          await tx.insert(s.oauthAccounts).values(part).onConflictDoNothing();
        }
      }),
    );
    report.imported.users = usersPlan.users.length - placeholderIds.length;
    report.imported.placeholderUsers = placeholderIds.length;
    report.imported.oauthAccounts = usersPlan.oauth.length;
  }
  const pgUserIds = await idSet(db, 'users');

  // ---- 2. games ----
  let gameIds: Map<string, number>;
  if (runs('games')) {
    gameIds = await phase('games', () => importGames(db, games, gameDownloads, owned.games));
    report.imported.games = gameIds.size;
  } else {
    gameIds = await loadGameIds(db, games);
  }

  // ---- 3. handlers ----
  const handlerRows: HandlerRow[] = [];
  for (const h of validHandlers) {
    const gameId = gameIds.get(gameKeyOf(h));
    const ownerId = ownerOf(h);
    if (gameId === undefined || !pgUserIds.has(ownerId)) continue;
    handlerRows.push(mapHandler(h, gameId, ownerId, now));
  }
  if (runs('handlers')) {
    await phase('handlers', () =>
      db.transaction(async (tx) => {
        // Downloads counted on v3 since the last import are kept: count - last Mongo total + new Mongo total.
        const downloads = {
          downloadCount: sql`greatest(${s.handlers.downloadCount} - ${s.handlers.importedDownloadCount}, 0) + excluded.download_count`,
          importedDownloadCount: sql`excluded.imported_download_count`,
        };
        const rows = handlerRows.map((r) => ({ ...r, importedDownloadCount: r.downloadCount }));
        const c: Counts = { refreshed: 0, keptV3State: 0, goneFromMongo: 0, softDeleted: 0 };
        // Handlers v3 owns (edited, moderated, uploaded to, owner banned): only the counters move.
        for (const part of chunk(
          rows.filter((r) => owned.handlers.has(r.id)),
          200,
        )) {
          await tx
            .insert(s.handlers)
            .values(part)
            .onConflictDoUpdate({ target: s.handlers.id, set: downloads });
          c.keptV3State! += part.length;
        }
        for (const part of chunk(
          rows.filter((r) => !owned.handlers.has(r.id)),
          200,
        )) {
          await tx
            .insert(s.handlers)
            .values(part)
            .onConflictDoUpdate({
              target: s.handlers.id,
              set: {
                gameId: sql`excluded.game_id`,
                ownerId: sql`excluded.owner_id`,
                title: sql`excluded.title`,
                description: sql`excluded.description`,
                maxPlayers: sql`excluded.max_players`,
                supportsControllers: sql`excluded.supports_controllers`,
                supportsKeyboardMouse: sql`excluded.supports_keyboard_mouse`,
                supportsMultiKeyboardMouse: sql`excluded.supports_multi_keyboard_mouse`,
                isPublic: sql`excluded.is_public`,
                approvedAt: sql`excluded.approved_at`,
                publishedAt: sql`excluded.published_at`,
                ...downloads,
                createdAt: sql`excluded.created_at`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
          c.refreshed! += part.length;
        }
        // Gone from Mongo (deleted on the old hub) and not created on v3: soft-deleted, so a takedown
        // there propagates. Too many at once means a wrong source: list them, delete nothing, fail.
        if (!RESET) {
          const gone = (
            await tx.select({ id: s.handlers.id }).from(s.handlers).where(isNull(s.handlers.deletedAt))
          )
            .map((r) => r.id)
            .filter((id) => !handlerIdSet.has(id) && !owned.createdHandlers.has(id));
          c.goneFromMongo = gone.length;
          for (const id of gone) pushId(report.changed.goneFromMongoHandlerIds, id);
          const cap = pruneCap(validHandlers.length);
          check(`handlers gone from Mongo <= safety cap (${cap})`, Math.min(gone.length, cap), gone.length);
          if (gone.length && gone.length <= cap) {
            for (const part of chunk(gone, 500)) {
              await tx
                .update(s.handlers)
                .set({ deletedAt: now })
                .where(and(inArray(s.handlers.id, part), isNull(s.handlers.deletedAt)));
            }
            c.softDeleted = gone.length;
          }
        }
        report.details.handlers = { ...report.details.handlers, ...c };
        log(`handlers: ${fmt(c)}`);
      }),
    );
    report.imported.handlers = handlerRows.length;
  }
  const pgHandlerIds = await idSet(db, 'handlers');

  // ---- 4. package files (no database writes) ----
  const needScript = new Set(
    (
      await col.packages
        .find({ 'meta.jsContent': { $not: { $type: 'string' } } }, { projection: { _id: 1 } })
        .toArray()
    ).map((p) => p._id),
  );
  const exported = new Map<string, ExportedFile>();
  if (runs('files') || runs('versions')) {
    await phase('files', async () => {
      await files.loadIndex();
      const c: Counts = { exported: 0, reused: 0, noGridFsId: 0, gridFsMissing: 0, notOnDisk: 0, badZip: 0 };
      let done = 0;
      let bytes = 0;
      try {
        for (const p of packagesSrc) {
          const hid = p.meta?.handlerId;
          if (!versionPlan.numbers.has(p._id) || !isId(hid) || !pgHandlerIds.has(hid)) continue;
          const g = gridFsIdOf(p);
          if (!g) {
            c.noGridFsId!++;
            continue;
          }
          const got = await files.ensure(hid, p._id, g, {
            download: runs('files') && !SKIP_FILES,
            needScript: needScript.has(p._id),
          });
          if (!got) {
            if (files.gridFsLength(g) === null) c.gridFsMissing!++;
            else c.notOnDisk!++;
            continue;
          }
          exported.set(p._id, got.file);
          if (got.file.badZip) c.badZip!++;
          if (got.reused) c.reused!++;
          else {
            c.exported!++;
            bytes += got.file.size;
          }
          if (++done % 250 === 0) {
            log(`files: ${done} ready (${(bytes / 1048576).toFixed(0)} MiB downloaded)`);
            await files.saveIndex();
          }
        }
      } finally {
        await files.saveIndex();
      }
      c.downloadedMiB = Math.round(bytes / 1048576);
      report.details.files = c;
      log(`files: ${fmt(c)}`);
    });
  }

  // ---- 5. versions (scripts streamed from Mongo one batch at a time) ----
  if (runs('versions')) {
    // Handlers whose numbers were not all taken from handlerVersion (filled or renumbered) follow the
    // Hub.Handler.Version stamped in their scripts when the plan disagrees with it: that is what installed
    // copies compare with the hub's current number. Stamps come from jsContent or the package's handler.js.
    const replanned = new Set([...versionPlan.filled, ...versionPlan.renumbered]);
    if (replanned.size) {
      const pkgsOf = new Map<string, MPackage[]>();
      for (const p of packagesSrc) {
        const hid = p.meta?.handlerId;
        if (!isId(hid) || !replanned.has(hid) || !versionPlan.numbers.has(p._id)) continue;
        const list = pkgsOf.get(hid) ?? [];
        list.push(p);
        pkgsOf.set(hid, list);
      }
      const stamps = new Map<string, number>();
      const ids = [...pkgsOf.values()].flat().map((p) => p._id);
      for (const part of chunk(ids, 100)) {
        const cursor = col.packages.find({ _id: { $in: part } }, { projection: { 'meta.jsContent': 1 } });
        for await (const p of cursor) {
          const n = stampedVersion(p.meta?.jsContent) ?? stampedVersion(exported.get(p._id)?.handlerJs);
          if (n !== null) stamps.set(p._id, n);
        }
      }
      const current = new Map(validHandlers.map((h) => [h._id, h.currentPackage]));
      for (const [hid, list] of pkgsOf) {
        if (!list.some((p) => stamps.has(p._id))) {
          if (versionPlan.renumbered.has(hid)) pushId(report.changed.unstampedRenumberedHandlerIds, hid);
          continue;
        }
        const agrees = list.every((p) => {
          const stamp = stamps.get(p._id);
          return stamp === undefined || stamp === versionPlan.numbers.get(p._id);
        });
        if (agrees) continue;
        const aligned = alignOnStamps(list, current.get(hid), (p) => stamps.get(p._id) ?? null);
        if (!aligned) continue;
        for (const [id, n] of aligned) versionPlan.numbers.set(id, n);
        pushId(report.changed.alignedOnStampsHandlerIds, hid);
      }
      report.details.versions = {
        ...report.details.versions,
        alignedOnStamps: report.changed.alignedOnStampsHandlerIds.length,
      };
    }

    await phase('versions', () =>
      db.transaction(async (tx) => {
        const c: Counts = {
          imported: 0,
          skippedNoFile: 0,
          skippedCollision: 0,
          scriptFromZip: 0,
          scriptMissing: 0,
          verified: 0,
          keptV3Current: 0,
          goneFromMongo: 0,
        };

        // What Postgres holds now: numbers taken by versions uploaded on v3 are never given to a Mongo
        // package (that would abort the phase on the unique index).
        const existing = await tx
          .select({
            id: s.handlerVersions.id,
            handlerId: s.handlerVersions.handlerId,
            version: s.handlerVersions.version,
            deletedAt: s.handlerVersions.deletedAt,
          })
          .from(s.handlerVersions);
        const pgVersion = new Map(existing.map((v) => [v.id, v]));
        const takenOnV3 = new Set(
          existing.filter((v) => !mongoPackageIds.has(v.id)).map((v) => `${v.handlerId}|${v.version}`),
        );
        /** The number to write, or null to leave a new package out (collision with a v3 upload). */
        const numberOf = (id: string, hid: string): number | null => {
          const planned = versionPlan.numbers.get(id)!;
          if (!takenOnV3.has(`${hid}|${planned}`)) return planned;
          pushId(report.skipped.versionCollisionIds, id);
          const kept = pgVersion.get(id)?.version ?? null; // already imported: keeps its number
          if (kept === null) c.skippedCollision!++;
          else c.collisionKeptNumber = (c.collisionKeptNumber ?? 0) + 1;
          return kept;
        };
        // A package whose number changes since the last run moves to a temporary negative number first,
        // so swaps between packages of one handler never trip the unique index mid-statement.
        const moving = packagesSrc
          .filter((p) => {
            const old = pgVersion.get(p._id);
            const hid = p.meta?.handlerId;
            if (!old || old.version <= 0 || !exported.has(p._id) || !isId(hid)) return false;
            const planned = versionPlan.numbers.get(p._id);
            return planned !== undefined && planned !== old.version && !takenOnV3.has(`${hid}|${planned}`);
          })
          .map((p) => p._id);
        for (const part of chunk(moving, 500)) {
          await tx
            .update(s.handlerVersions)
            .set({ version: sql`-${s.handlerVersions.version}` })
            .where(inArray(s.handlerVersions.id, part));
        }
        const keptVerified = JSON.stringify([...owned.verifiedVersions]);

        const byHandler = new Map<string, { id: string; version: number }[]>();
        let batch: (typeof s.handlerVersions.$inferInsert)[] = [];
        const flush = async () => {
          if (!batch.length) return;
          await tx
            .insert(s.handlerVersions)
            .values(batch)
            .onConflictDoUpdate({
              target: s.handlerVersions.id,
              set: {
                handlerId: sql`excluded.handler_id`,
                version: sql`excluded.version`,
                releaseNotes: sql`excluded.release_notes`,
                uploaderId: sql`excluded.uploader_id`,
                storageKey: sql`excluded.storage_key`,
                fileName: sql`excluded.file_name`,
                sizeBytes: sql`excluded.size_bytes`,
                sha256: sql`excluded.sha256`,
                script: sql`excluded.script`,
                manifest: sql`excluded.manifest`,
                // A version a moderator verified or unverified on v3 keeps that decision.
                verifiedAt: sql`case when ${s.handlerVersions.id} in (select jsonb_array_elements_text(${keptVerified}::jsonb)) then ${s.handlerVersions.verifiedAt} when excluded.verified_at is null then null else coalesce(${s.handlerVersions.verifiedAt}, excluded.verified_at) end`,
                // Downloads counted on v3 are kept: count - last Mongo total + new Mongo total.
                downloadCount: sql`greatest(${s.handlerVersions.downloadCount} - ${s.handlerVersions.importedDownloadCount}, 0) + excluded.download_count`,
                importedDownloadCount: sql`excluded.imported_download_count`,
                createdAt: sql`excluded.created_at`,
              },
            });
          batch = [];
        };
        const cursor = col.packages.find(
          {},
          {
            projection: {
              userId: 1,
              'meta.handlerId': 1,
              'meta.releaseDescription': 1,
              'meta.ownerId': 1,
              'meta.releaseDate': 1,
              'meta.downloads': 1,
              'meta.verified': 1,
              'meta.jsContent': 1,
            },
            batchSize: 50,
          },
        );
        for await (const p of cursor) {
          const hid = p.meta?.handlerId;
          if (!versionPlan.numbers.has(p._id) || !isId(hid) || !pgHandlerIds.has(hid)) continue;
          const file = exported.get(p._id);
          if (!file) {
            c.skippedNoFile!++;
            pushId(report.skipped.versionIds, p._id);
            continue;
          }
          const version = numberOf(p._id, hid);
          if (version === null) continue;
          if (hasNul(p.meta?.jsContent) || hasNul(p.meta?.releaseDescription)) {
            c.nulStripped = (c.nulStripped ?? 0) + 1;
          }
          let script = str(p.meta?.jsContent);
          if (!script) {
            script = file.handlerJs ?? '';
            if (script) c.scriptFromZip!++;
            else c.scriptMissing!++;
          }
          const uploader = [p.meta?.ownerId, p.userId].find((x) => isId(x) && pgUserIds.has(x));
          const verified = p.meta?.verified === true;
          if (verified) c.verified!++;
          const downloads = counter(p.meta?.downloads);
          batch.push({
            id: p._id,
            handlerId: hid,
            version,
            releaseNotes: str(p.meta?.releaseDescription),
            uploaderId: (uploader as string | undefined) ?? null,
            storageKey: file.storageKey,
            fileName: `handler-${hid}-v${version}.nc`,
            sizeBytes: file.size,
            sha256: file.sha256,
            script,
            manifest: file.manifest.map((m) => ({ path: str(m.path), size: m.size })),
            verifiedAt: verified ? now : null,
            downloadCount: downloads,
            importedDownloadCount: downloads,
            createdAt: toDate(p.meta?.releaseDate) ?? now,
          });
          const list = byHandler.get(hid) ?? [];
          list.push({ id: p._id, version });
          byHandler.set(hid, list);
          c.imported!++;
          if (batch.length >= 50) await flush();
        }
        await flush();

        // Gone from Mongo (deleted on the old hub), not uploaded on v3: soft-deleted, under the safety cap.
        if (!RESET) {
          const gone = existing
            .filter(
              (v) =>
                !v.deletedAt &&
                !mongoPackageIds.has(v.id) &&
                !owned.uploadedVersions.has(v.id) &&
                handlerIdSet.has(v.handlerId),
            )
            .map((v) => v.id);
          c.goneFromMongo = gone.length;
          for (const id of gone) pushId(report.changed.goneFromMongoVersionIds, id);
          const cap = pruneCap(packagesSrc.length);
          check(`versions gone from Mongo <= safety cap (${cap})`, Math.min(gone.length, cap), gone.length);
          if (gone.length && gone.length <= cap) {
            for (const part of chunk(gone, 500)) {
              await tx
                .update(s.handlerVersions)
                .set({ deletedAt: now })
                .where(and(inArray(s.handlerVersions.id, part), isNull(s.handlerVersions.deletedAt)));
            }
          }
        }

        // Current version of every handler, and the handler-level "verified" flag on it. A newer version
        // uploaded on v3 stays current, and so does the v3 choice when Mongo's current was deleted on v3.
        const pgCurrent = new Map(
          (
            await tx
              .select({
                id: s.handlers.id,
                versionId: s.handlers.currentVersionId,
                version: s.handlers.currentVersion,
              })
              .from(s.handlers)
          ).map((h) => [h.id, h]),
        );
        const current: { id: string; vid: string | null; n: number; verified: boolean }[] = [];
        for (const h of validHandlers) {
          if (!pgHandlerIds.has(h._id)) continue;
          const cur = pickCurrent(h.currentPackage, byHandler.get(h._id) ?? []);
          const pg = pgCurrent.get(h._id);
          const v3Upload = !!pg?.versionId && !mongoPackageIds.has(pg.versionId);
          if (v3Upload && pg!.version >= (cur?.version ?? 0)) {
            c.keptV3Current!++;
            continue;
          }
          if (cur && pgVersion.get(cur.id)?.deletedAt && pg?.versionId) {
            c.keptV3Current!++;
            continue;
          }
          if (!cur) {
            c.handlersWithoutVersion = (c.handlersWithoutVersion ?? 0) + 1;
            pushId(report.skipped.handlerIdsWithoutVersion, h._id);
          } else if (cur.id !== h.currentPackage) {
            c.currentFallback = (c.currentFallback ?? 0) + 1;
          } else if (int(h.currentVersion) !== cur.version) {
            c.currentNumberChanged = (c.currentNumberChanged ?? 0) + 1;
          }
          current.push({
            id: h._id,
            vid: cur?.id ?? null,
            n: cur?.version ?? 0,
            verified: h.verified === true && !owned.verifiedVersions.has(cur?.id ?? ''),
          });
        }
        for (const part of chunk(current, 500)) {
          const json = JSON.stringify(part);
          await tx.execute(sql`
            update handlers h set current_version_id = x.vid, current_version = x.n
            from jsonb_to_recordset(${json}::jsonb) as x(id text, vid text, n int, verified boolean)
            where h.id = x.id`);
          await tx.execute(sql`
            update handler_versions v set verified_at = coalesce(v.verified_at, ${now.toISOString()}::timestamptz)
            from jsonb_to_recordset(${json}::jsonb) as x(id text, vid text, n int, verified boolean)
            where x.verified and v.id = x.vid`);
        }
        report.details.versions = { ...report.details.versions, ...c };
        report.imported.versions = c.imported!;
        log(`versions: ${fmt(c)}`);
      }),
    );
  }

  // ---- 6. stars ----
  if (runs('stars')) {
    await phase('stars', () =>
      db.transaction(async (tx) => {
        const rows: { userId: string; handlerId: string }[] = [];
        let unknown = 0;
        for (const [userId, ids] of usersPlan.stars) {
          if (!pgUserIds.has(userId)) continue;
          for (const handlerId of ids) {
            if (pgHandlerIds.has(handlerId)) rows.push({ userId, handlerId });
            else unknown++;
          }
        }
        for (const part of chunk(rows, 1000)) {
          await tx.insert(s.handlerStars).values(part).onConflictDoNothing();
        }
        report.imported.stars = rows.length;
        report.details.stars = { imported: rows.length, skippedUnknownHandler: unknown };
      }),
    );
  }

  // ---- 7. comments ----
  if (runs('comments')) {
    await phase('comments', () =>
      db.transaction(async (tx) => {
        const keep = (r: { handlerId: string }) => pgHandlerIds.has(r.handlerId);
        const fixAuthor = <T extends { authorId: string | null }>(r: T): T =>
          r.authorId && !pgUserIds.has(r.authorId) ? { ...r, authorId: null } : r;
        const roots = comments.roots.filter(keep).map(fixAuthor);
        const rootIds = new Set(roots.map((r) => r.id));
        const replies = comments.replies
          .filter(keep)
          .map(fixAuthor)
          .map((r) => (r.parentId && rootIds.has(r.parentId) ? r : { ...r, parentId: null }));
        for (const part of chunk(roots, 500)) {
          await tx.insert(s.comments).values(part).onConflictDoNothing({ target: s.comments.id });
        }
        for (const part of chunk(replies, 500)) {
          await tx.insert(s.comments).values(part).onConflictDoNothing({ target: s.comments.id });
        }
        report.imported.comments = roots.length + replies.length;
      }),
    );
  }

  // ---- 8. download days ----
  if (runs('downloads')) {
    await phase('downloads', () =>
      db.transaction(async (tx) => {
        const agg = new DayAggregator(pgHandlerIds);
        let rows = 0;
        let docs = 0;
        let pending: { handlerId: string; day: string; downloads: number }[] = [];
        const write = async (force: boolean) => {
          if (pending.length < 1000 && !(force && pending.length)) return;
          for (const part of chunk(pending, 1000)) {
            // Downloads counted on v3 the same day are kept: count - last Mongo count + new Mongo count.
            await tx
              .insert(s.handlerDownloadDays)
              .values(part.map((r) => ({ ...r, importedDownloads: r.downloads })))
              .onConflictDoUpdate({
                target: [s.handlerDownloadDays.handlerId, s.handlerDownloadDays.day],
                set: {
                  downloads: sql`greatest(${s.handlerDownloadDays.downloads} - ${s.handlerDownloadDays.importedDownloads}, 0) + excluded.downloads`,
                  importedDownloads: sql`excluded.imported_downloads`,
                },
              });
            rows += part.length;
          }
          pending = [];
        };
        const cursor = col.stats.find(
          {},
          {
            projection: { _id: 0, handlerId: 1, date: 1, downloads: 1 },
            sort: { date: 1, handlerId: 1 },
            batchSize: 2000,
          },
        );
        for await (const d of cursor) {
          docs++;
          pending.push(...agg.add(d.handlerId, d.date, d.downloads));
          await write(false);
          if (docs % 50_000 === 0) log(`downloads: ${docs} documents read`);
        }
        pending.push(...agg.flush());
        await write(true);
        report.imported.downloadDays = rows;
        report.details.downloads = { documents: docs, rows, ...agg.counts };
        log(`downloads: ${fmt(report.details.downloads)}`);
      }),
    );
  }

  // ---- 9. synthetic reports (one open report per handler that had reports in Meteor) ----
  if (runs('reports')) {
    await phase('reports', () =>
      db.transaction(async (tx) => {
        const want = validHandlers
          .filter((h) => pgHandlerIds.has(h._id) && counter(h.reports) > 0)
          .map((h) => ({ id: h._id, n: counter(h.reports) }));
        const existing = new Map(
          (
            await tx
              .select({ id: s.reports.id, handlerId: s.reports.handlerId, status: s.reports.status })
              .from(s.reports)
              .where(eq(s.reports.source, 'import'))
          ).map((r) => [r.handlerId, r]),
        );
        let inserted = 0;
        let updated = 0;
        const message = (n: number) => `${n} report${n > 1 ? 's' : ''} before the migration`;
        const fresh = [];
        for (const w of want) {
          const e = existing.get(w.id);
          if (!e) {
            fresh.push({
              targetType: 'handler' as const,
              handlerId: w.id,
              reason: 'other' as const,
              message: message(w.n),
              source: 'import',
              createdAt: now,
            });
          } else if (e.status === 'open') {
            await tx
              .update(s.reports)
              .set({ message: message(w.n) })
              .where(and(eq(s.reports.id, e.id), eq(s.reports.status, 'open')));
            updated++;
          }
        }
        for (const part of chunk(fresh, 500)) {
          await tx.insert(s.reports).values(part);
          inserted += part.length;
        }
        report.imported.reports = inserted;
        report.details.reports = { handlersWithReports: want.length, inserted, updated };
      }),
    );
  }

  // ---- 10. counters, trend, statistics ----
  if (runs('counters')) {
    await phase('counters', async () => {
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          update handlers h set
            star_count = coalesce((select count(*) from handler_stars s where s.handler_id = h.id), 0),
            comment_count = coalesce((select count(*) from comments c where c.handler_id = h.id and c.deleted_at is null), 0),
            open_report_count = coalesce((select count(*) from reports r
              where r.handler_id = h.id and r.target_type = 'handler' and r.status = 'open'), 0),
            trend_score = coalesce((select sum(d.downloads) from handler_download_days d
              where d.handler_id = h.id and d.day >= current_date - 3), 0)`);
      });
      await db.execute(sql`analyze`);
    });
  }

  // ---- verification against the source ----
  await verify(db, {
    users: usersPlan.users,
    placeholders: placeholderIds.length,
    oauth: usersPlan.oauth.length,
    handlerRows,
    validHandlers: validHandlers.length,
    games: games.size,
    sourceUsers: usersSrc.length,
    sourcePackages: packagesSrc.length,
    sourceComments: commentsSrc.length,
    orphanPackages: versionPlan.orphans.length,
    plannedComments: comments.roots.length + comments.replies.length,
  });

  await db.transaction(async (tx) => {
    await tx.insert(s.auditLog).values({
      actorRole: 'system',
      action: 'system.import',
      targetType: 'database',
      details: { mode: report.mode, phases: report.phases, imported: report.imported, ok: report.ok },
    });
  });
}

async function idSet(db: Db, table: 'users' | 'handlers'): Promise<Set<string>> {
  const t = table === 'users' ? s.users : s.handlers;
  return new Set((await db.select({ id: t.id }).from(t)).map((r) => r.id));
}

/** Game ids by plan key, for runs that skip the games phase. */
async function loadGameIds(db: Db, plans: Map<string, GamePlan>): Promise<Map<string, number>> {
  const rows = await db.select({ id: s.games.id, igdbId: s.games.igdbId, name: s.games.name }).from(s.games);
  const byIgdb = new Map(rows.filter((r) => r.igdbId !== null).map((r) => [r.igdbId!, r.id]));
  const byName = new Map(rows.filter((r) => r.igdbId === null).map((r) => [r.name.toLowerCase(), r.id]));
  const out = new Map<string, number>();
  for (const [key, g] of plans) {
    const id = g.igdbId !== null ? byIgdb.get(g.igdbId) : byName.get(g.name.toLowerCase());
    if (id !== undefined) out.set(key, id);
  }
  return out;
}

/**
 * Inserts or refreshes one game per plan. Slugs are chosen once (most downloaded games first, so they
 * get the plain name); an existing game keeps its slug, Steam id, featured handler and screenshots, and a
 * game edited or refreshed on v3 is matched but not overwritten.
 * With --igdb, release year, Steam app id and screenshots are fetched from IGDB first.
 */
async function importGames(
  db: Db,
  plans: Map<string, GamePlan>,
  downloads: Map<string, number>,
  /** games edited or refreshed on v3: matched, never overwritten */
  ownedGames: ReadonlySet<number>,
): Promise<Map<string, number>> {
  type IgdbFacts = {
    releaseYear: number | null;
    steamAppId: number | null;
    shots: { imageId: string; width: number | null; height: number | null }[];
  };
  const igdb = new Map<number, IgdbFacts>();
  if (IGDB) {
    const { fetchGamesByIds, releaseYearOf, steamAppIdOf } = await import('../src/lib/igdb');
    const ids = [...plans.values()].map((g) => g.igdbId).filter((x): x is number => x !== null);
    for (const part of chunk(ids, 500)) {
      for (const g of await fetchGamesByIds(part)) {
        igdb.set(g.id, {
          releaseYear: releaseYearOf(g),
          steamAppId: steamAppIdOf(g),
          shots: (g.screenshots ?? []).slice(0, 12).map((x) => ({
            imageId: x.image_id,
            width: x.width ?? null,
            height: x.height ?? null,
          })),
        });
      }
    }
    log(`games: IGDB returned ${igdb.size} of ${ids.length} games`);
    report.details.igdb = { requested: ids.length, found: igdb.size };
  }

  return db.transaction(async (tx: Tx) => {
    const existing = await tx
      .select({ id: s.games.id, igdbId: s.games.igdbId, name: s.games.name, slug: s.games.slug })
      .from(s.games);
    const redirects = await tx.select({ slug: s.gameSlugRedirects.oldSlug }).from(s.gameSlugRedirects);
    const takenSlugs = new Set([...existing.map((g) => g.slug), ...redirects.map((r) => r.slug)]);
    const byIgdb = new Map(existing.filter((r) => r.igdbId !== null).map((r) => [r.igdbId!, r]));
    const byName = new Map(existing.filter((r) => r.igdbId === null).map((r) => [r.name.toLowerCase(), r]));

    const out = new Map<string, number>();
    const c: Counts = { inserted: 0, updated: 0, keptV3State: 0, withIgdbId: 0 };
    const ordered = [...plans.values()].sort(
      (a, b) => (downloads.get(b.key) ?? 0) - (downloads.get(a.key) ?? 0) || (a.key < b.key ? -1 : 1),
    );
    for (const g of ordered) {
      if (g.igdbId !== null) c.withIgdbId!++;
      const facts = g.igdbId !== null ? igdb.get(g.igdbId) : undefined;
      const fields = {
        name: g.name,
        igdbId: g.igdbId,
        igdbUrl: g.igdbUrl,
        summary: g.summary,
        coverImageId: g.coverImageId,
        genres: g.genres,
        ...(facts
          ? { releaseYear: facts.releaseYear, steamAppId: facts.steamAppId, igdbSyncedAt: new Date() }
          : {}),
      };
      const found = g.igdbId !== null ? byIgdb.get(g.igdbId) : byName.get(g.name.toLowerCase());
      let id: number;
      if (found && ownedGames.has(found.id)) {
        out.set(g.key, found.id);
        c.keptV3State!++;
        continue;
      }
      if (found) {
        await tx.update(s.games).set(fields).where(eq(s.games.id, found.id));
        id = found.id;
        c.updated!++;
      } else {
        const slug = await uniqueGameSlug(
          g.name,
          { releaseYear: facts?.releaseYear ?? null, igdbId: g.igdbId },
          (x) => takenSlugs.has(x),
        );
        takenSlugs.add(slug);
        const [row] = await tx
          .insert(s.games)
          .values({ ...fields, slug })
          .returning({ id: s.games.id });
        id = row!.id;
        c.inserted!++;
      }
      out.set(g.key, id);
      if (facts && facts.shots.length) {
        await tx.delete(s.gameScreenshots).where(eq(s.gameScreenshots.gameId, id));
        await tx
          .insert(s.gameScreenshots)
          .values(facts.shots.map((x, position) => ({ gameId: id, ...x, position })))
          .onConflictDoNothing();
      }
    }
    report.details.games = c;
    log(`games: ${fmt(c)}`);
    return out;
  });
}

/** Postgres counts against the plan and the source; any mismatch fails the run. */
async function verify(
  db: Db,
  p: {
    users: { id: string }[];
    placeholders: number;
    oauth: number;
    handlerRows: HandlerRow[];
    validHandlers: number;
    games: number;
    sourceUsers: number;
    sourcePackages: number;
    sourceComments: number;
    orphanPackages: number;
    plannedComments: number;
  },
) {
  const count = async (table: string, ids?: string[]): Promise<number> => {
    const where = ids
      ? sql` where id in (select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`
      : sql``;
    const [row] = (await db.execute(
      sql`select count(*)::int as n from ${sql.identifier(table)}${where}`,
    )) as unknown as {
      n: number;
    }[];
    return row?.n ?? 0;
  };
  const d = report.details;

  // source reconciliation: every source document is imported or counted as skipped
  const usersSkipped = d.users?.skippedInvalidId ?? 0;
  check('source users = imported + skipped', p.sourceUsers, p.users.length - p.placeholders + usersSkipped);
  check(
    'source Handlers = mapped + skipped',
    report.source.Handlers ?? 0,
    p.validHandlers + (d.handlers?.skippedInvalidId ?? 0),
  );
  if (report.phases.includes('versions')) {
    const v = d.versions ?? {};
    const f = d.files ?? {};
    check(
      'source packages = versions + orphans + no file',
      p.sourcePackages,
      (v.imported ?? 0) +
        (v.skippedCollision ?? 0) +
        p.orphanPackages +
        (v.packagesWithoutFile ?? 0) +
        (v.skippedNoFile ?? 0) +
        (f.noGridFsId ?? 0),
    );
  }
  const cc = d.comments ?? {};
  check(
    'source Comments = planned + skipped',
    p.sourceComments,
    p.plannedComments + (cc.skippedOrphan ?? 0) + (cc.skippedInvalidId ?? 0),
  );
  if (report.phases.includes('downloads')) {
    const dl = d.downloads ?? {};
    check('source HandlersStats = documents read', report.source.HandlersStats ?? 0, dl.documents ?? 0);
    check(
      'HandlersStats documents = day rows + merged + skipped',
      dl.documents ?? 0,
      (dl.rows ?? 0) + (dl.mergedSameDay ?? 0) + (dl.skippedOrphan ?? 0) + (dl.skippedNoDate ?? 0),
    );
  }

  // target: every planned row is in Postgres
  if (report.phases.includes('users'))
    check(
      'postgres users (planned ids)',
      p.users.length,
      await count(
        'users',
        p.users.map((u) => u.id),
      ),
    );
  if (report.phases.includes('handlers')) {
    check(
      'postgres handlers (planned ids)',
      p.handlerRows.length,
      await count(
        'handlers',
        p.handlerRows.map((h) => h.id),
      ),
    );
    check('handlers mapped = source handlers', p.validHandlers, p.handlerRows.length);
  }
  if (report.phases.includes('games'))
    check('postgres games >= planned', p.games, Math.min(p.games, await count('games')));
  if (RESET) {
    const exact: [string, number | undefined][] = [
      ['users', (report.imported.users ?? 0) + (report.imported.placeholderUsers ?? 0)],
      ['oauth_accounts', report.imported.oauthAccounts],
      ['games', report.imported.games],
      ['handlers', report.imported.handlers],
      ['handler_versions', report.imported.versions],
      ['handler_stars', report.imported.stars],
      ['comments', report.imported.comments],
      ['handler_download_days', report.imported.downloadDays],
      ['reports', report.imported.reports],
    ];
    for (const [table, n] of exact)
      if (n !== undefined) check(`postgres ${table} (exact)`, n, await count(table));
    const [sum] = (await db.execute(
      sql`select coalesce(sum(downloads), 0)::bigint as n from handler_download_days`,
    )) as unknown as { n: string }[];
    report.details.downloads = { ...report.details.downloads, totalDownloads: Number(sum?.n ?? 0) };
  }
  const [listed] = (await db.execute(sql`
    select count(*)::int as handlers, count(distinct game_id)::int as games from handlers
    where deleted_at is null and is_public and approved_at is not null and current_version_id is not null`)) as unknown as {
    handlers: number;
    games: number;
  }[];
  report.details.listed = { handlers: listed?.handlers ?? 0, games: listed?.games ?? 0 };
  report.ok = report.checks.every((c) => c.ok);
}

/**
 * An error without personal data: Drizzle's "Failed query" messages carry the parameters (emails,
 * hashes), and Postgres details quote values, so only the statement head, codes and names are kept.
 */
function describeError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: unknown; code?: unknown };
  const pg = e.cause as
    | { code?: string; message?: string; table_name?: string; column_name?: string; constraint_name?: string }
    | undefined;
  if (pg && typeof pg === 'object' && typeof pg.code === 'string') {
    const where = [
      pg.table_name && `table ${pg.table_name}`,
      pg.column_name && `column ${pg.column_name}`,
      pg.constraint_name && `constraint ${pg.constraint_name}`,
    ].filter(Boolean);
    return `postgres ${pg.code}${where.length ? ` (${where.join(', ')})` : ''}: ${(pg.message ?? '').slice(0, 160)}`;
  }
  const head = (e.message ?? String(err))
    .split(/\n?params:/)[0]!
    .replace(/\/\/[^@\s]*@/g, '//<credentials>@');
  return `${e.name ?? 'Error'}${e.code ? ` ${String(e.code)}` : ''}: ${head.slice(0, 160)}`;
}

const started = Date.now();
main()
  .catch((err: unknown) => {
    console.error(`import: FAILED: ${describeError(err)}`);
    report.ok = false;
    process.exitCode = 1;
  })
  .finally(async () => {
    report.finishedAt = new Date().toISOString();
    report.durationsMs.total = Date.now() - started;
    for (const c of report.checks)
      log(`check ${c.ok ? 'OK  ' : 'FAIL'} ${c.name}: expected ${c.expected}, got ${c.actual}`);
    log(`imported: ${fmt(report.imported)}`);
    if (report.details.listed) log(`listed: ${fmt(report.details.listed)}`);
    if (!DRY) {
      const file = path.join(STORAGE_DIR, 'import', 'last-report.json');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(report, null, 2));
      log(`report written to ${file}`);
    }
    if (!report.ok) process.exitCode = 1;
    log(report.ok ? 'OK' : 'FAILED');
  });
