'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/db/schema';
import { getCurrentUser, hasRole } from '@/lib/auth/current-user';
import { isValidId } from '@/lib/ids';
import { requestIp } from '@/server/auth/request-context';
import { restoreComment } from '@/server/private/community';
import {
  adminDeleteUser,
  changeRole,
  closeReports,
  hideComments,
  markEmailVerified,
  moderatorDeleteHandler,
  refreshGame,
  restoreHandler,
  setBan,
  setHandlerApproval,
  setTrustedAuthor,
  setVersionVerified,
  softDeleteVersion,
  transferHandler,
  updateGame,
} from '@/server/private/moderation';
import { errorState, okState, text, toState, type ActionState } from './types';

/**
 * Backoffice actions. Each checks the session and the role here (cheap 404-style refusal) and again in
 * the service through `can()` (the rule of record), then re-renders the backoffice.
 */

const DENIED = errorState('You are not allowed to do this.');

async function staff() {
  const user = await getCurrentUser();
  return user && hasRole(user, 'moderator') ? user : null;
}

function done(result: Parameters<typeof toState>[0], message: string): ActionState {
  revalidatePath('/admin', 'layout');
  return toState(result, message);
}

// ---------- handlers and versions ----------

export async function approveHandlerAction(
  handlerId: string,
  approve: boolean,
  _prev: ActionState,
  fd: FormData,
) {
  const user = await staff();
  if (!user || !isValidId(handlerId)) return DENIED;
  const result = await setHandlerApproval(user, handlerId, approve, await requestIp(), text(fd, 'reason'));
  return done(result, approve ? 'Approved: listed if public.' : 'Approval revoked: hidden from the hub.');
}

export async function verifyVersionAction(versionId: string, verify: boolean, _prev: ActionState) {
  const user = await staff();
  if (!user || !isValidId(versionId)) return DENIED;
  return done(
    await setVersionVerified(user, versionId, verify, await requestIp()),
    verify ? 'Verified.' : 'Unverified.',
  );
}

export async function deleteVersionAction(versionId: string, _prev: ActionState, fd: FormData) {
  const user = await staff();
  if (!user || !isValidId(versionId)) return DENIED;
  return done(
    await softDeleteVersion(user, versionId, await requestIp(), text(fd, 'reason')),
    'Version deleted.',
  );
}

export async function deleteHandlerAdminAction(handlerId: string, _prev: ActionState, fd: FormData) {
  const user = await staff();
  if (!user || !isValidId(handlerId)) return DENIED;
  return done(
    await moderatorDeleteHandler(user, handlerId, await requestIp(), text(fd, 'reason')),
    'Handler deleted.',
  );
}

export async function restoreHandlerAction(handlerId: string, _prev: ActionState) {
  const user = await staff();
  if (!user || !isValidId(handlerId)) return DENIED;
  return done(await restoreHandler(user, handlerId, await requestIp()), 'Handler restored.');
}

export async function transferHandlerAction(handlerId: string, _prev: ActionState, fd: FormData) {
  const user = await staff();
  if (!user || !isValidId(handlerId)) return DENIED;
  return done(
    await transferHandler(user, handlerId, text(fd, 'username'), await requestIp()),
    'Ownership transferred.',
  );
}

// ---------- reports ----------

export async function closeReportsAction(_prev: ActionState, fd: FormData) {
  const user = await staff();
  if (!user) return DENIED;
  const outcome = text(fd, 'outcome') === 'dismissed' ? 'dismissed' : 'resolved';
  const ids = fd.getAll('reportId').map((v) => Number(v));
  const result = await closeReports(user, ids, outcome, text(fd, 'note') || null, await requestIp());
  if (!result.ok) return toState(result);
  revalidatePath('/admin', 'layout');
  return okState(`${result.value.closed} report${result.value.closed === 1 ? '' : 's'} ${outcome}.`);
}

// ---------- users ----------

export async function changeRoleAction(userId: string, _prev: ActionState, fd: FormData) {
  const user = await staff();
  if (!user || !isValidId(userId)) return DENIED;
  const role = text(fd, 'role') as UserRole;
  return done(
    await changeRole(user, userId, role, await requestIp()),
    'Role changed. Their sessions were closed.',
  );
}

export async function banAction(userId: string, ban: boolean, _prev: ActionState, fd: FormData) {
  const user = await staff();
  if (!user || !isValidId(userId)) return DENIED;
  const result = await setBan(
    user,
    userId,
    ban,
    { reason: text(fd, 'reason'), unpublishHandlers: fd.get('unpublishHandlers') === 'on' },
    await requestIp(),
  );
  if (!result.ok) return toState(result);
  revalidatePath('/admin', 'layout');
  return okState(ban ? `Banned. ${result.value.unpublished} handler(s) unpublished.` : 'Unbanned.');
}

export async function verifyEmailAdminAction(userId: string, _prev: ActionState) {
  const user = await staff();
  if (!user || !isValidId(userId)) return DENIED;
  return done(await markEmailVerified(user, userId, await requestIp()), 'Email marked as verified.');
}

export async function trustedAuthorAction(userId: string, trusted: boolean, _prev: ActionState) {
  const user = await staff();
  if (!user || !isValidId(userId)) return DENIED;
  return done(
    await setTrustedAuthor(user, userId, trusted, await requestIp()),
    trusted ? 'Trusted: new handlers are approved on creation.' : 'No longer trusted.',
  );
}

export async function deleteUserAction(userId: string, _prev: ActionState, fd: FormData) {
  const user = await staff();
  if (!user || !isValidId(userId)) return DENIED;
  if (text(fd, 'confirm').trim().toLowerCase() !== 'delete') {
    return errorState('Type "delete" to confirm.', { confirm: ['Type "delete".'] });
  }
  const result = await adminDeleteUser(user, userId, await requestIp());
  if (!result.ok) return toState(result);
  revalidatePath('/admin', 'layout');
  redirect('/admin/users?deleted=1');
}

// ---------- comments ----------

export async function hideCommentsAction(_prev: ActionState, fd: FormData) {
  const user = await staff();
  if (!user) return DENIED;
  const ids = fd.getAll('commentId').map(String).filter(isValidId);
  if (!ids.length) return errorState('Pick at least one comment.');
  const result = await hideComments(user, ids, text(fd, 'reason') || null, await requestIp());
  if (!result.ok) return toState(result);
  revalidatePath('/admin', 'layout');
  return okState(`${result.value.hidden} comment(s) hidden.`);
}

export async function restoreCommentAction(commentId: string, _prev: ActionState) {
  const user = await staff();
  if (!user || !isValidId(commentId)) return DENIED;
  return done(await restoreComment(user, commentId, await requestIp()), 'Comment restored.');
}

// ---------- games ----------

export async function updateGameAction(gameId: number, _prev: ActionState, fd: FormData) {
  const user = await staff();
  if (!user || !Number.isSafeInteger(gameId)) return DENIED;
  const steam = text(fd, 'steamAppId').trim();
  const featured = text(fd, 'featuredHandlerId').trim();
  const result = await updateGame(
    user,
    gameId,
    {
      slug: text(fd, 'slug'),
      steamAppId: steam ? Number(steam) : null,
      featuredHandlerId: featured && isValidId(featured) ? featured : null,
    },
    await requestIp(),
  );
  return done(result, 'Game saved.');
}

export async function refreshGameAction(gameId: number, _prev: ActionState) {
  const user = await staff();
  if (!user || !Number.isSafeInteger(gameId)) return DENIED;
  return done(await refreshGame(user, gameId, await requestIp()), 'Refreshed from IGDB.');
}
