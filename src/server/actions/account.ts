'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { deleteSessionCookie } from '@/lib/auth/cookies';
import { getCurrentUser } from '@/lib/auth/current-user';
import {
  changePassword,
  changeUsername,
  deleteOwnAccount,
  revokeOtherSessions,
  revokeSession,
  setNotifyReplies,
  unlinkProvider,
} from '@/server/auth/account';
import { requestEmailChange, resendVerification } from '@/server/auth/email';
import { requestIp } from '@/server/auth/request-context';
import { errorState, okState, text, toState, type ActionState } from './types';

/** Account page actions. Each one reads the session itself; nothing trusts a user id from the form. */

const SIGNED_OUT = errorState('Your session expired. Log in again.');

async function me() {
  return getCurrentUser();
}

export async function changeUsernameAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  if (!user) return SIGNED_OUT;
  const result = await changeUsername(user.id, text(fd, 'username'));
  revalidatePath('/', 'layout');
  return toState(result, 'Username saved.');
}

export async function changeEmailAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  if (!user) return SIGNED_OUT;
  const result = await requestEmailChange({
    userId: user.id,
    sessionId: user.sessionId,
    newEmail: text(fd, 'email'),
    currentPassword: text(fd, 'currentPassword'),
    ip: await requestIp(),
  });
  if (!result.ok) return toState(result);
  revalidatePath('/account');
  return okState(
    result.value.pending
      ? 'Check the new inbox: the change happens when you open the link we sent there.'
      : 'Email address saved. A moderator can confirm it, or link Discord, GitHub or Google.',
  );
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  if (!user) return SIGNED_OUT;
  const newPassword = text(fd, 'newPassword');
  if (newPassword !== text(fd, 'confirm'))
    return errorState('The two passwords differ.', { confirm: ['Does not match.'] });
  const result = await changePassword({
    userId: user.id,
    sessionId: user.sessionId,
    currentPassword: text(fd, 'currentPassword'),
    newPassword,
    ip: await requestIp(),
  });
  revalidatePath('/account');
  return toState(
    result,
    user.hasPassword ? 'Password changed. Your other sessions were closed.' : 'Password set.',
  );
}

export async function notifyRepliesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  if (!user) return SIGNED_OUT;
  await setNotifyReplies(user.id, fd.get('notifyReplies') === 'on');
  revalidatePath('/account');
  return okState('Saved.');
}

export async function resendVerificationAction(_prev: ActionState): Promise<ActionState> {
  const user = await me();
  if (!user) return SIGNED_OUT;
  return toState(await resendVerification(user.id), 'Sent. The link works for 48 hours.');
}

export async function unlinkProviderAction(provider: string, _prev: ActionState): Promise<ActionState> {
  const user = await me();
  if (!user) return SIGNED_OUT;
  const result = await unlinkProvider(user.id, provider, await requestIp());
  revalidatePath('/account');
  return toState(result, 'Unlinked.');
}

export async function revokeSessionAction(sessionId: string, _prev: ActionState): Promise<ActionState> {
  const user = await me();
  if (!user) return SIGNED_OUT;
  if (sessionId === user.sessionId) return errorState('Use "Log out" for this browser.');
  await revokeSession(user.id, sessionId);
  revalidatePath('/account');
  return okState('Session closed.');
}

export async function revokeOtherSessionsAction(_prev: ActionState): Promise<ActionState> {
  const user = await me();
  if (!user) return SIGNED_OUT;
  await revokeOtherSessions(user.id, user.sessionId);
  revalidatePath('/account');
  return okState('Every other session is closed.');
}

export async function deleteAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  if (!user) return SIGNED_OUT;
  const result = await deleteOwnAccount({
    userId: user.id,
    password: text(fd, 'password'),
    confirmUsername: text(fd, 'confirmUsername'),
    ip: await requestIp(),
  });
  if (!result.ok) return toState(result);
  await deleteSessionCookie();
  redirect('/?account-deleted=1');
}
