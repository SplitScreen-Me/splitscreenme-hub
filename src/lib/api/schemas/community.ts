import { z } from '../zod';
import { Id } from './common';
import { HandlerSummary } from './handlers';

/** Comments, authors and reports of /api/v3 (docs/ARCHITECTURE.md 5.3). */

export const Comment = z
  .object({
    id: Id,
    handlerId: Id,
    parentId: Id.nullable().openapi({
      description:
        'Root comment this one replies to (replies are one level deep). `null` for a root comment, and for a reply whose root was removed.',
    }),
    authorId: z.string().nullable().openapi({ description: '`null` when the account was deleted.' }),
    authorName: z.string().openapi({ description: 'Username, or "Deleted user".' }),
    body: z.string().openapi({
      description: 'Plain text with line breaks. Render it as text, never as HTML.',
      example: 'Works great with 4 controllers.',
    }),
    createdAt: z.iso.datetime(),
    editedAt: z.iso.datetime().nullable(),
  })
  .openapi('Comment');

export const CommentPage = z
  .object({
    items: z.array(Comment).openapi({ description: 'Newest first, replies flat.' }),
    nextCursor: z.iso.datetime().nullable().openapi({
      description: 'Pass it as `before` to get the next (older) page; `null` on the last page.',
    }),
  })
  .openapi('CommentPage');

export const Author = z
  .object({
    id: z.string(),
    username: z.string().openapi({ example: 'creator-01' }),
    url: z.url().openapi({
      description: 'Public profile page.',
      example: 'https://v3.splitscreen.me/hub/authors/creator-01',
    }),
    joinedAt: z.iso.datetime(),
    handlers: z.array(HandlerSummary).openapi({ description: 'Listed handlers, most downloaded first.' }),
  })
  .openapi('Author');

export const REPORT_REASONS = [
  'broken',
  'outdated',
  'malware',
  'wrong_game',
  'inappropriate',
  'spam',
  'copyright',
  'other',
] as const;

export const ReportBody = z
  .object({
    reason: z.enum(REPORT_REASONS).openapi({
      description:
        '`broken`: does not work; `outdated`: broken by a game update; `malware`: suspicious files; `wrong_game`: not the game it claims; `inappropriate`, `spam`, `copyright`, `other`.',
    }),
    message: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .openapi({ description: 'What happened, for the moderators (plain text, 1000 characters at most).' }),
    version: z
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .optional()
      .openapi({ description: 'Version concerned, if not the current one. Must exist.' }),
    client: z
      .enum(['web', 'app', 'api'])
      .default('api')
      .openapi({ description: 'Where the report comes from: the site, the desktop app or another client.' }),
  })
  .openapi('ReportBody', { description: 'A report to the moderators about a handler.' });

export const ReportAccepted = z.object({ status: z.literal('received') }).openapi('ReportAccepted', {
  description: 'Always the same answer, also when an identical report from the same address is already open.',
});

export type CommentDto = z.infer<typeof Comment>;
export type AuthorDto = z.infer<typeof Author>;
export type ReportInput = z.output<typeof ReportBody>;
