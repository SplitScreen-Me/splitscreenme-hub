import { z } from '../zod';
import { Id } from './common';
import { HandlerSummary, Screenshot } from './handlers';

/** Games, genres and hub counters of /api/v3 (docs/ARCHITECTURE.md 5.3). */

export const Game = z
  .object({
    slug: z.string().openapi({ example: 'portal-2' }),
    name: z.string().openapi({ example: 'Portal 2' }),
    url: z.url().openapi({
      description: 'Game page ("How to play <Game> split screen on PC").',
      example: 'https://v3.splitscreen.me/hub/portal-2',
    }),
    igdbGameId: z.number().int().nullable(),
    igdbUrl: z.url().nullable(),
    summary: z.string().nullable().openapi({ description: 'Game summary from IGDB.' }),
    coverImageId: z.string().nullable().openapi({ description: 'IGDB image id of the cover.' }),
    steamAppId: z.number().int().nullable(),
    releaseYear: z.number().int().nullable(),
    genres: z.array(z.string()).openapi({ description: 'IGDB genre names.' }),
    screenshots: z.array(Screenshot),
    primaryHandlerId: Id.openapi({ description: 'The handler shown on the game page.' }),
    handlers: z
      .array(HandlerSummary)
      .openapi({ description: 'Every listed handler of the game, primary first.' }),
  })
  .openapi('Game', { description: 'A game with at least one listed handler.' });

export const Genre = z
  .object({
    slug: z
      .string()
      .openapi({ description: 'Value of the `genre` filter of `GET /handlers`.', example: 'platformer' }),
    name: z.string().openapi({ description: 'IGDB genre name.', example: 'Platform' }),
    label: z.string().openapi({ description: 'Short label.', example: 'Platformer' }),
    url: z.url().openapi({ example: 'https://v3.splitscreen.me/hub/genres/platformer' }),
    count: z.number().int().openapi({ description: 'Games of this genre with a listed handler.' }),
  })
  .openapi('Genre');

export const GenreList = z
  .object({ items: z.array(Genre).openapi({ description: 'Most games first.' }) })
  .openapi('GenreList');

export const Stats = z
  .object({
    publicHandlers: z.number().int().openapi({ description: 'Listed handlers.' }),
    games: z.number().int().openapi({ description: 'Games with at least one listed handler.' }),
    downloads: z
      .number()
      .int()
      .openapi({ description: 'Counted downloads of every handler that was not deleted.' }),
    members: z.number().int().openapi({ description: 'Accounts.' }),
    comments: z.number().int().openapi({ description: 'Comments on listed handlers.' }),
    generatedAt: z.iso.datetime().openapi({ description: 'Counters are cached for up to 10 minutes.' }),
  })
  .openapi('Stats');

export type GameDto = z.infer<typeof Game>;
export type GenreDto = z.infer<typeof Genre>;
export type StatsDto = z.infer<typeof Stats>;
