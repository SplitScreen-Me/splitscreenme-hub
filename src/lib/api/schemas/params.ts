import type { ZodType } from 'zod';
import { z } from '../zod';
import { Id } from './common';

/**
 * Path and query parameters of /api/v3. The same schemas validate requests (`parseParams`, `parseQuery`)
 * and document them in OpenAPI, so the docs cannot drift from what the routes accept.
 */

const boolString = () => z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** `true`/`false` (also `1`/`0`) in a query string, documented as a boolean. */
const queryBool = (description: string) => boolString().optional().openapi({ type: 'boolean', description });

/** Same, with a default value. */
const queryBoolDefault = (value: boolean, description: string) =>
  boolString().default(value).openapi({ type: 'boolean', default: value, description });

const queryInt = (min: number, max: number, description: string) =>
  z.coerce.number().int().min(min).max(max).openapi({ description });

// ---------- path ----------

export const HandlerPath = z.object({
  id: Id.openapi({ param: { description: 'Handler id.' } }),
});

export const VersionPath = z.object({
  id: Id.openapi({ param: { description: 'Handler id.' } }),
  version: queryInt(1, 1_000_000, 'Version number.').openapi({ param: { description: 'Version number.' } }),
});

export const GamePath = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/)
    .openapi({ param: { description: 'Game slug, as in the game page URL.', example: 'portal-2' } }),
});

export const AuthorPath = z.object({
  username: z
    .string()
    .min(1)
    .max(64)
    .openapi({ param: { description: 'Username, case-insensitive.', example: 'creator-01' } }),
});

// ---------- query ----------

export const PLAYERS = ['2', '3-4', '5-8', '9+'] as const;
export const INPUTS = ['controllers', 'keyboardMouse', 'multiKeyboardMouse'] as const;
export const SORTS = ['trending', 'downloads', 'updated', 'az', 'stars', 'newest'] as const;

export const HandlersQuery = z.object({
  q: z.string().trim().max(100).optional().openapi({
    description:
      'Search words (5 at most). Every word must appear in the game name, the handler title or the author name; accents and case are ignored. When nothing matches, close game names are returned instead.',
    example: 'portal',
  }),
  genre: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional()
    .openapi({ description: 'Genre slug, see `GET /genres`.', example: 'platformer' }),
  players: z
    // "+" decodes to a space in a query string: accept `9+`, `9%2B`, `9 ` and `9`.
    .preprocess((v) => (typeof v === 'string' && /^9[+ ]?$/.test(v) ? '9+' : v), z.enum(PLAYERS))
    .optional()
    .openapi({
      type: 'string',
      enum: [...PLAYERS],
      description: 'Maximum players of the handler: `2`, `3-4`, `5-8` or `9+` (send `9%2B`).',
    }),
  input: z.array(z.enum(INPUTS)).max(3).optional().openapi({
    description:
      'Required input setup; repeat the parameter to require several (`input=controllers&input=keyboardMouse`).',
  }),
  verified: queryBool('`true`: only handlers whose current version was checked by a moderator.'),
  sort: z.enum(SORTS).default('trending').openapi({
    description:
      '`trending` (downloads over 3 days), `downloads`, `updated`, `az` (game name), `stars` or `newest`. With `q`, relevance comes first.',
  }),
  page: queryInt(1, 10_000, 'Page number, from 1.').default(1),
  pageSize: queryInt(1, 100, 'Items per page.').default(24),
});

export const DownloadQuery = z.object({
  version: queryInt(1, 1_000_000, 'Version number; the current version when omitted.').optional(),
  count: queryBoolDefault(
    true,
    '`false` downloads without counting (previews, tests, "Try it out" here). Counted otherwise, once per address, handler, version and day.',
  ),
});

export const CommentsQuery = z.object({
  limit: queryInt(1, 200, 'Comments per page.').default(100),
  before: z.iso.datetime({ offset: true }).optional().openapi({
    description: 'Cursor: only comments older than this date (the `nextCursor` of the previous page).',
  }),
});

// ---------- parsing ----------

const isArraySchema = (schema: ZodType): boolean => {
  let s: ZodType = schema;
  // Unwrap optional/default wrappers to find an array.
  for (let i = 0; i < 4; i++) {
    const def = (s as unknown as { def: { type: string; innerType?: ZodType } }).def;
    if (def.type === 'array') return true;
    if (!def.innerType) return false;
    s = def.innerType;
  }
  return false;
};

/**
 * Validates the query string against an object schema. Empty values count as absent, repeated parameters
 * become arrays where the schema expects one, unknown parameters are ignored. Throws a ZodError (400).
 */
export function parseQuery<T extends z.ZodObject>(schema: T, url: URL): z.output<T> {
  const raw: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema.shape as Record<string, ZodType>)) {
    if (isArraySchema(field)) {
      const all = url.searchParams.getAll(key).filter((v) => v !== '');
      if (all.length) raw[key] = all;
    } else {
      const v = url.searchParams.get(key);
      if (v !== null && v !== '') raw[key] = v;
    }
  }
  return schema.parse(raw);
}

/** Validates route params (ids, slugs) before any query. Throws a ZodError (400). */
export const parseParams = <T extends z.ZodObject>(schema: T, params: unknown): z.output<T> =>
  schema.parse(params);
