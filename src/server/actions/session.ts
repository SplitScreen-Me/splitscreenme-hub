'use server';

import { redirect } from 'next/navigation';
import { deleteSessionCookie, readSessionToken } from '@/lib/auth/cookies';
import { invalidateSession, sessionIdFromToken } from '@/lib/auth/session';

/** Log out: delete the session row and the cookie (a POST: the header menu posts a form). */
export async function logout(): Promise<void> {
  const token = await readSessionToken();
  if (token) await invalidateSession(sessionIdFromToken(token));
  await deleteSessionCookie();
  redirect('/');
}
