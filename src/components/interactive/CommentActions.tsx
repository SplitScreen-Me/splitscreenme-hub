import { headers } from 'next/headers';
import { canPost, getCurrentUser } from '@/lib/auth/current-user';
import { can } from '@/lib/auth/permissions';
import { getOwnCommentBody } from '@/server/private/community';
import { CommentToolbar } from './CommentComposer';

/**
 * Reply, edit and delete (own comment), hide (moderators) under one comment. Server component: it reads
 * the viewer itself (cached per request), so render it from a server component. Anonymous viewers see
 * nothing here (the comment form links to login).
 */
export async function CommentActions({
  commentId,
  authorId,
}: {
  commentId: string;
  authorId: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const own = !!authorId && authorId === user.id;
  const canHide = !own && can(user, 'comment.hide');
  const canReply = canPost(user);
  if (!own && !canHide && !canReply) return null;
  const ownBody = own ? await getOwnCommentBody(user.id, commentId) : null;
  const path = (await headers()).get('x-pathname') ?? '/';
  return (
    <CommentToolbar
      commentId={commentId}
      path={path}
      canReply={canReply}
      ownBody={ownBody}
      canHide={canHide}
    />
  );
}
