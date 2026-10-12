import { z } from '../zod';
import { Id } from './common';

/**
 * Handler resources of /api/v3 (docs/ARCHITECTURE.md 5.3). These schemas are the contract: the routes
 * build their payloads with src/lib/api/dto.ts, the tests parse every response with them, and the
 * OpenAPI document is generated from them.
 */

const isoDate = (description: string) =>
  z.iso.datetime().openapi({ description, example: '2026-03-14T09:26:53.000Z' });

export const Inputs = z
  .object({
    controllers: z.boolean().nullable().openapi({ description: 'One game controller per player.' }),
    keyboardMouse: z
      .boolean()
      .nullable()
      .openapi({ description: 'One player on the keyboard and mouse, the others on controllers.' }),
    multiKeyboardMouse: z
      .boolean()
      .nullable()
      .openapi({ description: 'Several keyboards and mice, one per player.' }),
  })
  .openapi('Inputs', {
    description:
      'Supported input setups. `null` means unknown: the handler was published before the hub asked.',
  });

export const Screenshot = z
  .object({
    imageId: z.string().openapi({ description: 'IGDB image id.', example: 'sc6lrw' }),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    url: z.url().openapi({
      description: 'IGDB `t_screenshot_big` (889x500).',
      example: 'https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc6lrw.jpg',
    }),
    thumbUrl: z.url().openapi({
      description: 'IGDB `t_screenshot_med` (569x320).',
      example: 'https://images.igdb.com/igdb/image/upload/t_screenshot_med/sc6lrw.jpg',
    }),
  })
  .openapi('Screenshot', {
    description:
      'A game screenshot hosted by IGDB. Other sizes: replace the size segment of `url` (`t_720p`, `t_1080p`).',
  });

export const HandlerSummary = z
  .object({
    id: Id.openapi({ description: 'Handler id. Stable: the desktop app stores it.' }),
    title: z.string().openapi({ example: 'Portal 2 (4 players)' }),
    url: z.url().openapi({
      description:
        'Canonical web page: the game page for the primary handler of a game, the handler page otherwise.',
      example: 'https://v3.splitscreen.me/hub/portal-2',
    }),
    gameName: z.string().openapi({ example: 'Portal 2' }),
    gameSlug: z
      .string()
      .openapi({ description: 'Slug of the game, see `GET /games/{slug}`.', example: 'portal-2' }),
    igdbGameId: z.number().int().nullable().openapi({ description: 'IGDB game id.', example: 72 }),
    coverImageId: z.string().nullable().openapi({
      description:
        'IGDB image id of the cover: `https://images.igdb.com/igdb/image/upload/t_cover_big/<id>.jpg`.',
      example: 'co1rs4',
    }),
    genres: z.array(z.string()).openapi({ description: 'IGDB genre names.', example: ['Puzzle', 'Shooter'] }),
    authorId: z.string().nullable().openapi({ description: '`null` when the account was deleted.' }),
    authorName: z.string().openapi({ description: 'Username, or "Deleted user".', example: 'creator-01' }),
    authorUrl: z.url().nullable().openapi({
      description: 'Public profile page, `null` when the account was deleted or suspended.',
      example: 'https://v3.splitscreen.me/hub/authors/creator-01',
    }),
    version: z.number().int().min(1).openapi({
      description:
        'Current version number. The package script carries it as `Hub.Handler.Version`: compare them to find updates.',
      example: 3,
    }),
    verified: z.boolean().openapi({ description: 'The current version was checked by a moderator.' }),
    maxPlayers: z.number().int().openapi({ example: 4 }),
    inputs: Inputs,
    downloads: z.number().int().openapi({ description: 'Counted downloads, all versions.' }),
    stars: z.number().int(),
    comments: z.number().int(),
    trendScore: z.number().int().openapi({ description: 'Downloads over the last 3 days.' }),
    createdAt: isoDate('Creation of the handler.'),
    updatedAt: isoDate('Last change of the handler or of its current version.'),
    publishedAt: isoDate('Last time the handler was made public (falls back to `createdAt`).'),
  })
  .openapi('HandlerSummary', { description: 'A listed handler, as shown in lists.' });

export const Version = z
  .object({
    id: Id.openapi({ description: 'Package id.' }),
    version: z.number().int().min(1).openapi({ example: 3 }),
    releaseNotes: z.string().openapi({ description: 'Plain text written by the author.' }),
    createdAt: isoDate('Upload time.'),
    verified: z.boolean().openapi({ description: 'Checked by a moderator.' }),
    sizeBytes: z.number().int().openapi({ example: 48213 }),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .openapi({ description: 'SHA-256 of the `.nc` file, hex. Check it after downloading.' }),
    fileName: z.string().openapi({ example: 'handler-RkbcpmL5dNbrDcfjL-v3.nc' }),
    downloads: z.number().int().openapi({ description: 'Counted downloads of this version.' }),
    downloadUrl: z.url().openapi({
      description: 'Counted download of this version (`GET /handlers/{id}/download?version=n`).',
      example: 'https://v3.splitscreen.me/api/v3/handlers/RkbcpmL5dNbrDcfjL/download?version=3',
    }),
  })
  .openapi('Version', { description: 'One uploaded version of a handler (a `.nc` package, a zip file).' });

export const HandlerDetail = HandlerSummary.extend({
  description: z.string().openapi({
    description: 'Handler notes by the author, markdown. Raw HTML is not rendered on the site.',
  }),
  gameDescription: z.string().nullable().openapi({ description: 'Game summary from IGDB.' }),
  igdbUrl: z.url().nullable().openapi({ example: 'https://www.igdb.com/games/portal-2' }),
  steamAppId: z.number().int().nullable().openapi({ example: 620 }),
  releaseYear: z.number().int().nullable().openapi({ example: 2011 }),
  screenshots: z.array(Screenshot),
  currentVersion: Version,
  isPrimary: z.boolean().openapi({
    description: 'This handler is the one shown on the game page (`url` is then the game page).',
  }),
}).openapi('HandlerDetail', { description: 'A listed handler with everything its page shows.' });

export const Catalog = z
  .object({
    generatedAt: isoDate('When this list was built (it is cached for up to 5 minutes).'),
    count: z.number().int(),
    items: z.array(HandlerSummary),
  })
  .openapi('Catalog', { description: 'Every listed handler, trending first.' });

export const HandlerPage = z
  .object({
    items: z.array(HandlerSummary),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().openapi({ description: 'Matches over all pages.' }),
  })
  .openapi('HandlerPage');

export const VersionList = z
  .object({ items: z.array(Version).openapi({ description: 'Newest first.' }) })
  .openapi('VersionList');

export type HandlerSummaryDto = z.infer<typeof HandlerSummary>;
export type HandlerDetailDto = z.infer<typeof HandlerDetail>;
export type VersionDto = z.infer<typeof Version>;
export type ScreenshotDto = z.infer<typeof Screenshot>;
