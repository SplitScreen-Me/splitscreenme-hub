import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { expect } from 'vitest';
import { getDb } from '@/db';
import {
  comments,
  gameScreenshots,
  gameSlugRedirects,
  games,
  handlerVersions,
  handlers,
  users,
} from '@/db/schema';
import { env } from '@/lib/env';

/**
 * Synthetic fixtures for the /api/v3 route tests (no real data). Four listed handlers on two games, and
 * every kind of handler that must stay invisible: private, awaiting approval, deleted, without a version,
 * and the only handler of a game that is private.
 */

export const USERS = {
  owner: 'apiOwner000000001',
  second: 'apiOwner000000002',
  banned: 'apiBanned00000001',
  deleted: 'apiDeleted0000001',
  commenter: 'apiCommenter00001',
} as const;

export const H = {
  primary: 'apiPrimary0000001',
  second: 'apiSecond00000001',
  banned: 'apiBannedHandler1',
  orphan: 'apiOrphanHandler1',
} as const;

export const HIDDEN = {
  private: 'apiPrivate0000001',
  unapproved: 'apiUnapproved0001',
  deleted: 'apiDeletedHandle1',
  versionless: 'apiVersionless001',
  privateOnly: 'apiPrivateOnly001',
} as const;

export const LISTED_IDS = Object.values(H);
export const HIDDEN_IDS = Object.values(HIDDEN);

export const V = {
  primary1: 'apiPrimaryVers001',
  primary2: 'apiPrimaryVers002',
  primary3: 'apiPrimaryVers003', // soft-deleted
  second1: 'apiSecondVersi001',
  banned1: 'apiBannedVersi001', // no file on disk
  orphan1: 'apiOrphanVersi001',
} as const;

export const C = {
  root: 'apiCommentRoot001',
  reply: 'apiCommentReply01',
  deletedRoot: 'apiCommentGone001',
  orphanReply: 'apiCommentOrphan1',
  byDeletedUser: 'apiCommentDelUsr1',
  onPrivate: 'apiCommentPriv001',
} as const;

export const day = (n: number) => new Date(Date.UTC(2026, 0, n, 12));

export const SCRIPT_V2 =
  'Hub.Handler.Version = 2;\nHub.Handler.Id = "apiPrimary0000001";\nGame.GameName = "Portal 2";\n';

/** Package bytes per version id (fake zip content is enough: the API never opens it). */
export const FILES: Partial<Record<string, Buffer>> = {
  [V.primary1]: Buffer.from('PK\u0003\u0004 version one of the primary handler'),
  [V.primary2]: Buffer.from('PK\u0003\u0004 version two of the primary handler, a bit longer'),
  [V.second1]: Buffer.from('PK\u0003\u0004 second handler'),
  [V.orphan1]: Buffer.from('PK\u0003\u0004 orphan handler'),
};

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export const storageKey = (handlerId: string, versionId: string) => `packages/${handlerId}/${versionId}.nc`;

function writePackage(handlerId: string, versionId: string, bytes: Buffer) {
  const file = path.join(path.resolve(env().STORAGE_DIR), storageKey(handlerId, versionId));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

export async function seed(): Promise<void> {
  const db = getDb();
  await db.insert(users).values([
    { id: USERS.owner, username: 'Fixture-Author', email: 'owner@example.test', createdAt: day(1) },
    { id: USERS.second, username: 'second-author', email: 'second@example.test' },
    { id: USERS.banned, username: 'banned-author', bannedAt: day(2), banReason: 'test' },
    { id: USERS.deleted, username: 'deleted-apiDel', deletedAt: day(3) },
    { id: USERS.commenter, username: 'commenter' },
  ]);
  const [portal, hidden, racing] = await db
    .insert(games)
    .values([
      {
        slug: 'portal-2',
        name: 'Portal 2',
        igdbId: 72,
        igdbUrl: 'https://www.igdb.com/games/portal-2',
        summary: 'A puzzle game.',
        coverImageId: 'co1rs4',
        steamAppId: 620,
        releaseYear: 2011,
        genres: ['Puzzle', 'Shooter'],
      },
      { slug: 'hidden-game', name: 'Hidden Game', genres: ['Racing'] },
      { slug: 'racing-game', name: 'Racing Game', genres: ['Racing'], coverImageId: 'co2abc' },
    ])
    .returning();
  await db.insert(gameSlugRedirects).values({ oldSlug: 'portal-two', gameId: portal!.id });
  await db.insert(gameScreenshots).values([
    { gameId: portal!.id, imageId: 'sc6lrw', width: 1920, height: 1080, position: 0 },
    { gameId: portal!.id, imageId: 'sc6lrx', width: null, height: null, position: 1 },
  ]);

  const listed = {
    isPublic: true,
    approvedAt: day(2),
    publishedAt: day(2),
    createdAt: day(1),
    updatedAt: day(5),
  };
  await db.insert(handlers).values([
    {
      ...listed,
      id: H.primary,
      gameId: portal!.id,
      ownerId: USERS.owner,
      title: 'Portal 2 coop',
      description: '# Notes\nUse **two** controllers.',
      maxPlayers: 4,
      supportsControllers: true,
      supportsKeyboardMouse: true,
      supportsMultiKeyboardMouse: false,
      trendScore: 10,
      downloadCount: 100,
      starCount: 3,
      commentCount: 4,
    },
    {
      ...listed,
      id: H.second,
      gameId: portal!.id,
      ownerId: USERS.second,
      title: 'Portal 2 eight players',
      maxPlayers: 8,
      supportsControllers: true,
      trendScore: 50,
      downloadCount: 20,
    },
    {
      ...listed,
      id: H.banned,
      gameId: racing!.id,
      ownerId: USERS.banned,
      title: 'Racing by a suspended author',
      maxPlayers: 2,
      trendScore: 5,
    },
    {
      ...listed,
      id: H.orphan,
      gameId: racing!.id,
      ownerId: USERS.deleted,
      title: 'Racing by a deleted author',
      maxPlayers: 12,
      trendScore: 1,
    },
    {
      ...listed,
      id: HIDDEN.private,
      gameId: portal!.id,
      ownerId: USERS.owner,
      title: 'Portal private',
      isPublic: false,
    },
    {
      ...listed,
      id: HIDDEN.unapproved,
      gameId: portal!.id,
      ownerId: USERS.owner,
      title: 'Portal unapproved',
      approvedAt: null,
    },
    {
      ...listed,
      id: HIDDEN.deleted,
      gameId: portal!.id,
      ownerId: USERS.owner,
      title: 'Portal deleted',
      deletedAt: day(4),
    },
    {
      ...listed,
      id: HIDDEN.versionless,
      gameId: portal!.id,
      ownerId: USERS.owner,
      title: 'Portal versionless',
    },
    {
      ...listed,
      id: HIDDEN.privateOnly,
      gameId: hidden!.id,
      ownerId: USERS.owner,
      title: 'Hidden private',
      isPublic: false,
    },
  ]);

  const version = (
    handlerId: string,
    id: string,
    n: number,
    extra: Partial<typeof handlerVersions.$inferInsert> = {},
  ) => {
    const bytes = FILES[id] ?? Buffer.from(`missing ${id}`);
    return {
      id,
      handlerId,
      version: n,
      releaseNotes: `Release ${n}`,
      uploaderId: USERS.owner,
      storageKey: storageKey(handlerId, id),
      fileName: `handler-${handlerId}-v${n}.nc`,
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
      script: `Hub.Handler.Version = ${n};\nGame.GameName = "x";\n`,
      createdAt: day(n),
      ...extra,
    };
  };
  await db
    .insert(handlerVersions)
    .values([
      version(H.primary, V.primary1, 1, { verifiedAt: day(2), downloadCount: 60 }),
      version(H.primary, V.primary2, 2, { verifiedAt: day(3), downloadCount: 40, script: SCRIPT_V2 }),
      version(H.primary, V.primary3, 3, { deletedAt: day(6) }),
      version(H.second, V.second1, 1),
      version(H.banned, V.banned1, 1, { verifiedAt: day(2) }),
      version(H.orphan, V.orphan1, 1),
      ...[HIDDEN.private, HIDDEN.unapproved, HIDDEN.deleted, HIDDEN.privateOnly].map((id) =>
        version(id, `${id.slice(0, 14)}V01`, 1, { verifiedAt: day(2) }),
      ),
    ]);
  const current: [string, string, number][] = [
    [H.primary, V.primary2, 2],
    [H.second, V.second1, 1],
    [H.banned, V.banned1, 1],
    [H.orphan, V.orphan1, 1],
    ...[HIDDEN.private, HIDDEN.unapproved, HIDDEN.deleted, HIDDEN.privateOnly].map(
      (id): [string, string, number] => [id, `${id.slice(0, 14)}V01`, 1],
    ),
  ];
  for (const [id, versionId, n] of current) {
    await db
      .update(handlers)
      .set({ currentVersionId: versionId, currentVersion: n, updatedAt: day(5) })
      .where(eq(handlers.id, id));
    const bytes = FILES[versionId];
    if (bytes) writePackage(id, versionId, bytes);
  }
  writePackage(H.primary, V.primary1, FILES[V.primary1]!);
  for (const id of [HIDDEN.private, HIDDEN.unapproved, HIDDEN.deleted, HIDDEN.privateOnly]) {
    writePackage(id, `${id.slice(0, 14)}V01`, Buffer.from('PK hidden'));
  }

  await db.insert(comments).values([
    { id: C.root, handlerId: H.primary, authorId: USERS.commenter, body: 'Works great', createdAt: day(1) },
    {
      id: C.reply,
      handlerId: H.primary,
      authorId: USERS.owner,
      parentId: C.root,
      body: 'Thanks!',
      createdAt: day(2),
    },
    {
      id: C.deletedRoot,
      handlerId: H.primary,
      authorId: USERS.commenter,
      body: '',
      createdAt: day(3),
      deletedAt: day(4),
      deleteReason: 'spam',
    },
    {
      id: C.orphanReply,
      handlerId: H.primary,
      authorId: USERS.commenter,
      parentId: C.deletedRoot,
      body: 'Agreed',
      createdAt: day(4),
    },
    {
      id: C.byDeletedUser,
      handlerId: H.primary,
      authorId: USERS.deleted,
      body: 'Old comment',
      createdAt: day(5),
    },
    {
      id: C.onPrivate,
      handlerId: HIDDEN.private,
      authorId: USERS.commenter,
      body: 'Secret',
      createdAt: day(1),
    },
  ]);
}

// ---------- calling route handlers ----------

type Handler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
}

/** Calls a route handler like Next does. `url` is relative to the test SITE_URL. */
export function call<P>(
  handler: Handler<P>,
  url: string,
  params: P,
  options: CallOptions = {},
): Promise<Response> {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body,
    ...(options.body instanceof ReadableStream ? { duplex: 'half' } : {}),
  } as ConstructorParameters<typeof NextRequest>[1]);
  return handler(req, { params: Promise.resolve(params) });
}

/** The API headers every answer carries (section 5.2). */
export function expectApiHeaders(res: Response) {
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
  expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  expect(res.headers.get('access-control-allow-credentials')).toBe(null);
}
