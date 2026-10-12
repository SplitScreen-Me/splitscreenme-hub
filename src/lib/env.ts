import { z } from 'zod';

/**
 * Runtime environment, validated with zod at first use (never at import time, never at build time).
 * Secrets live only here and are never logged. See docs/ARCHITECTURE.md section 9.4.
 *
 * Empty strings count as unset, so a blank line in `.env` behaves like a missing one.
 */

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    SITE_URL: z.preprocess(
      (v) => (typeof v === 'string' ? v.replace(/\/+$/, '') : v),
      z.url({ protocol: /^https?$/ }),
    ),
    /** Indexing is off unless NOINDEX is exactly "0". */
    NOINDEX: z.preprocess(blank, z.string().optional()).transform((v) => v !== '0'),
    /** "1" shows the beta banner. */
    BETA: z.preprocess(blank, z.string().optional()).transform((v) => v === '1'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),
    APP_SECRET: z.string().regex(/^[0-9a-fA-F]{64,}$/, 'must be at least 32 random bytes, hex encoded'),
    STORAGE_DIR: z.preprocess(blank, z.string().default('./storage')),
    STORAGE_ACCEL_PREFIX: optional(z.string().regex(/^\/[A-Za-z0-9_/-]*\/$/, 'must start and end with /')),
    TRUST_PROXY: z.preprocess(blank, z.string().optional()).transform((v) => v === '1'),

    DISCORD_CLIENT_ID: optional(z.string()),
    DISCORD_CLIENT_SECRET: optional(z.string()),
    GITHUB_CLIENT_ID: optional(z.string()),
    GITHUB_CLIENT_SECRET: optional(z.string()),
    GOOGLE_CLIENT_ID: optional(z.string()),
    GOOGLE_CLIENT_SECRET: optional(z.string()),

    SMTP_URL: optional(z.string().regex(/^smtps?:\/\//, 'must be smtp:// (STARTTLS) or smtps://')),
    MAIL_FROM: optional(z.string().min(3)),

    IGDB_CLIENT_ID: optional(z.string()),
    IGDB_CLIENT_SECRET: optional(z.string()),

    DISCORD_WEBHOOK_ADMIN: optional(z.url({ protocol: /^https$/ })),
    DISCORD_WEBHOOK_RELEASES: optional(z.url({ protocol: /^https$/ })),

    LOG_LEVEL: z.preprocess(blank, z.enum(['debug', 'info', 'warn', 'error']).default('info')),
  })
  .refine((e) => !!e.SMTP_URL === !!e.MAIL_FROM, {
    message: 'SMTP_URL and MAIL_FROM go together: set both or neither',
    path: ['SMTP_URL'],
  })
  .refine((e) => !!e.IGDB_CLIENT_ID === !!e.IGDB_CLIENT_SECRET, {
    message: 'IGDB_CLIENT_ID and IGDB_CLIENT_SECRET go together',
    path: ['IGDB_CLIENT_ID'],
  });

export type Env = z.output<typeof EnvSchema>;

let cached: Env | undefined;

/** Placeholders used only when SKIP_ENV_VALIDATION=1 (the Docker build stage) and a value is missing. */
const BUILD_PLACEHOLDERS: Record<string, string> = {
  SITE_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://build:build@127.0.0.1:1/build',
  APP_SECRET: '0'.repeat(64),
};

/** Parses the environment once. Throws a readable error (variable names only, never values). */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success && process.env.SKIP_ENV_VALIDATION === '1') {
    // Build stage only: never cached, never reaches a running server (the runtime image does not set it).
    return EnvSchema.parse({ ...BUILD_PLACEHOLDERS, ...process.env });
  }
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}

export const isProduction = () => process.env.NODE_ENV === 'production';

/** Site origin without a trailing slash, e.g. https://v3.splitscreen.me */
export const siteUrl = () => env().SITE_URL;

export const smtpEnabled = () => !!env().SMTP_URL;

export const igdbEnabled = () => !!env().IGDB_CLIENT_ID;
