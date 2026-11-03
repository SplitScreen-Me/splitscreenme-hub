import { NEWS_LIVE_LIMIT, NEWS_MESSAGE_MAX, NEWS_SEVERITIES, NEWS_URL_MAX } from '../../news';
import { z } from '../zod';
import { Id } from './common';

/** App news of /api/v3 (the desktop app's announcements ticker). */

export const NewsItem = z
  .object({
    id: Id.openapi({ example: 'Nw7kQ2xR9mZpT4bLc' }),
    message: z
      .string()
      .min(1)
      .max(NEWS_MESSAGE_MAX)
      .openapi({
        description: `One line of plain text (no line breaks, no markup), 1 to ${NEWS_MESSAGE_MAX} characters.`,
        example: 'A Windows 11 update breaks XInput controllers: here is the fix.',
      }),
    url: z.url().max(NEWS_URL_MAX).nullable().openapi({
      description: 'The "Learn more" link (http or https), or null when there is none.',
      example: 'https://v3.splitscreen.me/doc/troubleshooting/controllers',
    }),
    severity: z.enum(NEWS_SEVERITIES).openapi({
      description: '`critical` and `warning` deserve more attention than `info`.',
      example: 'warning',
    }),
    startsAt: z.iso.datetime().openapi({
      description: 'Shown from this date.',
      example: '2026-11-03T09:00:00.000Z',
    }),
    endsAt: z.iso.datetime().nullable().openapi({
      description: 'Shown until this date (excluded), or null for no end.',
      example: null,
    }),
    updatedAt: z.iso.datetime().openapi({
      description:
        'Last change (an edit, a publication): a client can tell an updated item from one it already showed.',
      example: '2026-11-03T09:12:41.508Z',
    }),
  })
  .openapi('NewsItem', { description: 'A live announcement.' });

export const NewsList = z
  .object({
    items: z
      .array(NewsItem)
      .max(NEWS_LIVE_LIMIT)
      .openapi({
        description:
          `The live announcements, at most ${NEWS_LIVE_LIMIT}: \`critical\` first, then \`warning\`, then ` +
          '`info`, the latest start first within a severity. Empty when nothing is live.',
      }),
  })
  .openapi('NewsList', {
    example: {
      items: [
        {
          id: 'Nw7kQ2xR9mZpT4bLc',
          message: 'A Windows 11 update breaks XInput controllers: here is the fix.',
          url: 'https://v3.splitscreen.me/doc/troubleshooting/controllers',
          severity: 'warning',
          startsAt: '2026-11-03T09:00:00.000Z',
          endsAt: null,
          updatedAt: '2026-11-03T09:12:41.508Z',
        },
      ],
    },
  });

export type NewsItemDto = z.infer<typeof NewsItem>;
export type NewsListDto = z.infer<typeof NewsList>;
