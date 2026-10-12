'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { safeNextPath } from '@/lib/urls';
import { passwordLogin, registerUser } from '@/server/auth/credentials';
import { confirmEmailToken, requestPasswordReset, resetPassword } from '@/server/auth/email';
import { requestIp, startSession } from '@/server/auth/request-context';
import { errorState, okState, text, toState, type ActionState } from './types';

/** Login, registration and the email-token pages (docs/ARCHITECTURE.md sections 4.2 and 4.3). */

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const result = await passwordLogin({
    identifier: text(fd, 'identifier'),
    password: text(fd, 'password'),
    ip: await requestIp(),
  });
  if (!result.ok) return toState(result);
  await startSession(result.value.userId);
  redirect(safeNextPath(text(fd, 'next'), '/'));
}

export async function registerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const result = await registerUser({
    username: text(fd, 'username'),
    email: text(fd, 'email'),
    password: text(fd, 'password'),
    acceptTerms: fd.get('acceptTerms') === 'on',
    ip: await requestIp(),
  });
  if (!result.ok) return toState(result);
  await startSession(result.value.userId);
  redirect(`/account?welcome=1`);
}

export async function forgotPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const result = await requestPasswordReset(text(fd, 'email'), await requestIp());
  if (!result.ok) return toState(result);
  return okState('If an account uses this address, we sent it a link. It works for one hour.');
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const password = text(fd, 'password');
  if (password !== text(fd, 'confirm')) {
    return errorState('The two passwords differ.', { confirm: ['Does not match.'] });
  }
  const result = await resetPassword(text(fd, 'token'), password, await requestIp());
  if (!result.ok) return toState(result);
  await startSession(result.value.userId);
  redirect('/account?reset=1');
}

export async function verifyEmailAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentUser();
  const result = await confirmEmailToken(text(fd, 'token'), await requestIp(), me?.sessionId);
  if (!result.ok) return toState(result);
  return okState(
    result.value.kind === 'changed'
      ? 'Your new email address is confirmed.'
      : 'Your email address is confirmed.',
    { signedIn: !!me },
  );
}
