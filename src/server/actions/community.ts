'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/current-user';
import { isValidId } from '@/lib/ids';
import { deleteComment, editComment, postComment, toggleStar } from '@/server/private/community';
import { requestIp } from '@/server/auth/request-context';
import { errorState, okState, text, toState, type ActionState } from './types';

/** Comments and stars, posted from the public game and handler pages. */

const SIGNED_OUT = errorState('Log in to do this.');

/** The page the form was posted from, so it re-renders with the change. */
function refresh(fd: FormData) {
  const path = text(fd, 'path');
  if (path.startsWith('/') && !path.startsWith('//')) revalidatePath(path.split('?')[0]!.split('#')[0]!);
}

export async function postCommentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const handlerId = text(fd, 'handlerId') || null;
  const parentId = text(fd, 'parentId') || null;
  if (
    (handlerId && !isValidId(handlerId)) ||
    (parentId && !isValidId(parentId)) ||
    (!handlerId && !parentId)
  ) {
    return errorState('Invalid request.');
  }
  const result = await postComment(user, { handlerId, parentId, body: text(fd, 'body') });
  if (!result.ok) return toState(result);
  refresh(fd);
  return okState(parentId ? 'Reply posted.' : 'Comment posted.', { id: result.value.id });
}

export async function editCommentAction(
  commentId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  if (!isValidId(commentId)) return errorState('Invalid request.');
  const result = await editComment(user, commentId, text(fd, 'body'));
  if (result.ok) refresh(fd);
  return toState(result, 'Saved.');
}

export async function deleteCommentAction(
  commentId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  if (!isValidId(commentId)) return errorState('Invalid request.');
  const result = await deleteComment(user, commentId, text(fd, 'reason') || null, await requestIp());
  if (result.ok) refresh(fd);
  return toState(result, 'Deleted.');
}

export interface StarState {
  starred: boolean;
  count: number;
  error?: string;
  needsLogin?: boolean;
}

export async function toggleStarAction(handlerId: string, prev: StarState, fd: FormData): Promise<StarState> {
  const user = await getCurrentUser();
  if (!user) return { ...prev, needsLogin: true, error: 'Log in to star handlers.' };
  if (!isValidId(handlerId)) return { ...prev, error: 'Invalid request.' };
  const want = fd.get('star');
  const result = await toggleStar(user, handlerId, want === '1' ? true : want === '0' ? false : undefined);
  if (!result.ok) return { ...prev, error: result.error };
  refresh(fd);
  return { starred: result.value.starred, count: result.value.count };
}
