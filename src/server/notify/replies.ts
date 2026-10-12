import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { comments, games, handlers, users } from '@/db/schema';
import { smtpEnabled } from '@/lib/env';
import { log } from '@/lib/log';
import { sendMail } from '@/lib/mail';
import { replyNotificationMessage } from '@/lib/mail/templates';
import { absoluteUrl, paths } from '@/lib/urls';

/**
 * "Someone replied to your comment" email, sent after the reply is committed. Only to a live author with
 * a verified address and `notify_replies` on, never to the replier themself. Failures are logged and
 * swallowed: a reply never fails because of email.
 */
export async function notifyReply(replyId: string): Promise<void> {
  if (!smtpEnabled()) return;
  try {
    const [reply] = await db
      .select({
        parentId: comments.parentId,
        authorId: comments.authorId,
        handlerId: comments.handlerId,
        replier: users.username,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.id, replyId))
      .limit(1);
    if (!reply?.parentId) return;
    const [parent] = await db
      .select({
        authorId: comments.authorId,
        deletedAt: comments.deletedAt,
        username: users.username,
        email: users.email,
        verified: users.emailVerifiedAt,
        notify: users.notifyReplies,
        userDeletedAt: users.deletedAt,
        bannedAt: users.bannedAt,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.id, reply.parentId))
      .limit(1);
    if (
      !parent ||
      parent.deletedAt ||
      parent.authorId === reply.authorId ||
      !parent.email ||
      !parent.verified ||
      !parent.notify ||
      parent.userDeletedAt ||
      parent.bannedAt
    ) {
      return;
    }
    const [h] = await db
      .select({ title: handlers.title, slug: games.slug, id: handlers.id })
      .from(handlers)
      .innerJoin(games, eq(games.id, handlers.gameId))
      .where(eq(handlers.id, reply.handlerId))
      .limit(1);
    if (!h) return;
    const link = absoluteUrl(`${paths.handler(h.slug, h.id)}#comment-${replyId}`);
    await sendMail(replyNotificationMessage(parent.email, parent.username, reply.replier, h.title, link));
  } catch (err) {
    log.error('notify.reply_failed', { err });
  }
}
