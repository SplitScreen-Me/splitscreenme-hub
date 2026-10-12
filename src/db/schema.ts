/**
 * Database schema. Normative: docs/ARCHITECTURE.md section 2.2.
 *
 * Features edit this file only through the schema-change protocol (section 10.4): new tables at the end
 * in a `// ---- [x] purpose ----` block, new columns with a trailing `// [x] why` comment, and never a
 * migration file. TypeScript keys are camelCase, SQL columns snake_case (`casing: 'snake_case'`).
 */
import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  date,
  jsonb,
  bigint,
  primaryKey,
  index,
  uniqueIndex,
  check,
  customType,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const tstz = () => timestamp({ withTimezone: true });
const createdAt = () => tstz().notNull().defaultNow();
const updatedAt = () =>
  tstz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const userRole = pgEnum('user_role', ['user', 'moderator', 'admin']);
export const passwordAlgo = pgEnum('password_algo', ['bcrypt', 'meteor_sha256_bcrypt']);
export const oauthProvider = pgEnum('oauth_provider', ['discord', 'github', 'google', 'facebook']);
export const tokenPurpose = pgEnum('token_purpose', ['verify_email', 'reset_password', 'change_email']);
export const reportTarget = pgEnum('report_target', ['handler', 'comment']);
export const reportReason = pgEnum('report_reason', [
  'broken',
  'outdated',
  'malware',
  'wrong_game',
  'inappropriate',
  'spam',
  'copyright',
  'other',
]);
export const reportStatus = pgEnum('report_status', ['open', 'resolved', 'dismissed']);

// ---------- accounts ----------
export const users = pgTable(
  'users',
  {
    id: text().primaryKey(), // legacy Meteor id or newId()
    username: text().notNull(),
    email: text(), // stored lower-cased; null for some OAuth-only accounts
    emailVerifiedAt: tstz(),
    emailVerifiedByModerator: boolean().notNull().default(false), // marked by a moderator: no inbox proof (4.4)
    passwordHash: text(),
    passwordAlgo: passwordAlgo(),
    role: userRole().notNull().default('user'),
    trustedAuthor: boolean().notNull().default(false), // new handlers auto-approved
    notifyReplies: boolean().notNull().default(true),
    bannedAt: tstz(),
    banReason: text(),
    lastLoginAt: tstz(),
    usernameChangedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tstz(), // anonymised, never hard-deleted
  },
  (t) => [
    uniqueIndex('users_username_lower_uq').on(sql`lower(${t.username})`),
    uniqueIndex('users_email_lower_uq')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
    check('users_password_pair', sql`(${t.passwordHash} is null) = (${t.passwordAlgo} is null)`),
  ],
);

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    provider: oauthProvider().notNull(),
    providerUserId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerUsername: text(),
    createdAt: createdAt(),
    lastUsedAt: tstz(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerUserId] }),
    uniqueIndex('oauth_accounts_user_provider_uq').on(t.userId, t.provider),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(), // sha256 hex of the cookie token
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: tstz().notNull(),
    lastSeenAt: tstz().notNull().defaultNow(),
    userAgent: text(), // truncated to 200 chars
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: text().primaryKey(), // sha256 hex of the token
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: tokenPurpose().notNull(),
    email: text(), // target address (verify, change)
    expiresAt: tstz().notNull(),
    usedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [index('auth_tokens_user_purpose_idx').on(t.userId, t.purpose)],
);

// ---------- catalogue ----------
export const games = pgTable(
  'games',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    igdbId: integer().unique(),
    igdbUrl: text(),
    summary: text(),
    coverImageId: text(), // IGDB image id
    steamAppId: integer(),
    releaseYear: smallint(),
    genres: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`), // IGDB genre names, max 3
    featuredHandlerId: text().references((): AnyPgColumn => handlers.id, { onDelete: 'set null' }),
    nameSearch: text().generatedAlwaysAs(sql`immutable_unaccent(lower("name"))`),
    igdbSyncedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('games_name_trgm_idx').using('gin', t.nameSearch.op('gin_trgm_ops')),
    index('games_genres_idx').using('gin', t.genres),
  ],
);

export const gameSlugRedirects = pgTable('game_slug_redirects', {
  oldSlug: text().primaryKey(),
  gameId: integer()
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
});

export const gameScreenshots = pgTable(
  'game_screenshots',
  {
    gameId: integer()
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    imageId: text().notNull(),
    width: integer(),
    height: integer(),
    position: smallint().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.imageId] })],
);

export const handlers = pgTable(
  'handlers',
  {
    id: text().primaryKey(),
    gameId: integer()
      .notNull()
      .references(() => games.id, { onDelete: 'restrict' }),
    ownerId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    description: text().notNull().default(''), // markdown, max 10 000 chars
    maxPlayers: smallint().notNull().default(2),
    supportsControllers: boolean(), // null = unknown (legacy documents)
    supportsKeyboardMouse: boolean(),
    supportsMultiKeyboardMouse: boolean(),
    isPublic: boolean().notNull().default(false), // owner intent
    approvedAt: tstz(), // moderator gate; null = awaiting approval
    approvedById: text().references(() => users.id, { onDelete: 'set null' }),
    currentVersionId: text().references((): AnyPgColumn => handlerVersions.id, { onDelete: 'set null' }),
    currentVersion: integer().notNull().default(0),
    publishedAt: tstz(), // last private -> public switch
    downloadCount: integer().notNull().default(0),
    importedDownloadCount: integer().notNull().default(0), // Mongo total at the last import (section 3)
    starCount: integer().notNull().default(0),
    commentCount: integer().notNull().default(0),
    openReportCount: integer().notNull().default(0),
    trendScore: integer().notNull().default(0), // downloads over the last 3 days
    titleSearch: text().generatedAlwaysAs(sql`immutable_unaccent(lower("title"))`),
    searchTsv: tsvector().generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', immutable_unaccent(coalesce("title", ''))), 'A') || setweight(to_tsvector('simple', immutable_unaccent(left(coalesce("description", ''), 4000))), 'C')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tstz(),
    deletedById: text().references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('handlers_game_idx').on(t.gameId),
    index('handlers_owner_idx').on(t.ownerId),
    index('handlers_listed_trend_idx')
      .on(t.trendScore.desc())
      .where(
        sql`deleted_at is null and is_public and approved_at is not null and current_version_id is not null`,
      ),
    index('handlers_title_trgm_idx').using('gin', t.titleSearch.op('gin_trgm_ops')),
    index('handlers_search_tsv_idx').using('gin', t.searchTsv),
    check('handlers_max_players', sql`max_players between 1 and 64`),
  ],
);

export const handlerVersions = pgTable(
  'handler_versions',
  {
    id: text().primaryKey(), // legacy ostrio:files package id or newId()
    handlerId: text()
      .notNull()
      .references(() => handlers.id, { onDelete: 'cascade' }),
    version: integer().notNull(),
    releaseNotes: text().notNull().default(''),
    uploaderId: text().references(() => users.id, { onDelete: 'set null' }),
    storageKey: text().notNull(), // packages/<handlerId>/<versionId>.nc
    fileName: text().notNull(), // handler-<handlerId>-v<version>.nc
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    script: text().notNull(), // stamped handler.js, max 2 MiB
    manifest: jsonb()
      .$type<{ path: string; size: number }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    verifiedAt: tstz(),
    verifiedById: text().references(() => users.id, { onDelete: 'set null' }),
    downloadCount: integer().notNull().default(0),
    importedDownloadCount: integer().notNull().default(0), // Mongo total at the last import (section 3)
    createdAt: createdAt(),
    deletedAt: tstz(),
  },
  (t) => [uniqueIndex('handler_versions_handler_version_uq').on(t.handlerId, t.version)],
);

export const handlerDownloadDays = pgTable(
  'handler_download_days',
  {
    handlerId: text()
      .notNull()
      .references(() => handlers.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(), // UTC day
    downloads: integer().notNull().default(0),
    importedDownloads: integer().notNull().default(0), // Mongo part of `downloads` at the last import
  },
  (t) => [primaryKey({ columns: [t.handlerId, t.day] }), index('handler_download_days_day_idx').on(t.day)],
);

export const downloadDedup = pgTable(
  'download_dedup',
  {
    key: text().primaryKey(), // HMAC(APP_SECRET, ip|handlerId|version|utcDay), hex
    createdAt: createdAt(),
  },
  (t) => [index('download_dedup_created_idx').on(t.createdAt)],
);

export const handlerStars = pgTable(
  'handler_stars',
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    handlerId: text()
      .notNull()
      .references(() => handlers.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.handlerId] }),
    index('handler_stars_handler_idx').on(t.handlerId),
  ],
);

// ---------- community ----------
export const comments = pgTable(
  'comments',
  {
    id: text().primaryKey(),
    handlerId: text()
      .notNull()
      .references(() => handlers.id, { onDelete: 'cascade' }),
    authorId: text().references(() => users.id, { onDelete: 'set null' }),
    parentId: text().references((): AnyPgColumn => comments.id, { onDelete: 'set null' }), // always a root comment
    body: text().notNull(), // plain text, 2..1000 chars for new comments
    createdAt: createdAt(),
    editedAt: tstz(),
    deletedAt: tstz(),
    deletedById: text().references(() => users.id, { onDelete: 'set null' }),
    deleteReason: text(),
  },
  (t) => [
    index('comments_handler_created_idx')
      .on(t.handlerId, t.createdAt.desc())
      .where(sql`deleted_at is null`),
    index('comments_author_idx').on(t.authorId),
    index('comments_parent_idx').on(t.parentId),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    targetType: reportTarget().notNull(),
    handlerId: text().references(() => handlers.id, { onDelete: 'cascade' }),
    commentId: text().references(() => comments.id, { onDelete: 'cascade' }),
    version: integer(),
    reason: reportReason().notNull(),
    message: text(), // max 1000
    reporterId: text().references(() => users.id, { onDelete: 'set null' }),
    reporterHash: text(), // HMAC(APP_SECRET, 'report|' + ip), cleared 30 days after resolution
    source: text(), // 'web' | 'app' | 'api' | 'import' (synthetic report of the Mongo migration)
    status: reportStatus().notNull().default('open'),
    resolutionNote: text(),
    resolvedById: text().references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('reports_status_created_idx').on(t.status, t.createdAt.desc()),
    index('reports_handler_idx').on(t.handlerId),
    check(
      'reports_target',
      sql`(target_type = 'handler' and handler_id is not null) or (target_type = 'comment' and comment_id is not null)`,
    ),
  ],
);

// ---------- audit ----------
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    at: createdAt(),
    actorId: text(), // no FK on purpose: the log outlives everything
    actorRole: text(),
    action: text().notNull(), // closed union AuditAction in src/lib/audit.ts
    targetType: text(),
    targetId: text(),
    ipHash: text(), // HMAC(APP_SECRET, ip|utcDay)
    details: jsonb()
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    index('audit_log_at_idx').on(t.at.desc()),
    index('audit_log_target_idx').on(t.targetType, t.targetId),
    index('audit_log_actor_idx').on(t.actorId, t.at.desc()),
  ],
);

// ---------- row types ----------
export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Handler = typeof handlers.$inferSelect;
export type HandlerVersion = typeof handlerVersions.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type OAuthProviderName = (typeof oauthProvider.enumValues)[number];
export type ReportReason = (typeof reportReason.enumValues)[number];
