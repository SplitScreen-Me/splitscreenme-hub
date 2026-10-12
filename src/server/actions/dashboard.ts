'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { isValidId } from '@/lib/ids';
import { paths } from '@/lib/urls';
import { requestIp } from '@/server/auth/request-context';
import {
  createHandler,
  parseHandlerMeta,
  setHandlerPublic,
  softDeleteHandler,
  updateHandlerMeta,
} from '@/server/private/handlers';
import { errorState, text, toState, type ActionState } from './types';

/** Author dashboard: create, edit, publish/unpublish, delete. Uploads go through /api/me (multipart). */

const SIGNED_OUT = errorState('Your session expired. Log in again.');

const metaInput = (fd: FormData) => ({
  title: text(fd, 'title'),
  description: text(fd, 'description'),
  maxPlayers: text(fd, 'maxPlayers'),
  controllers: text(fd, 'controllers') || 'unknown',
  keyboardMouse: text(fd, 'keyboardMouse') || 'unknown',
  multiKeyboardMouse: text(fd, 'multiKeyboardMouse') || 'unknown',
});

export async function createHandlerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const meta = parseHandlerMeta(metaInput(fd));
  // game = "g:<id>" (already on the hub) or "i:<igdbId>" (from IGDB)
  const game = text(fd, 'game');
  const m = /^(g|i):(\d{1,10})$/.exec(game);
  const fields = { ...(meta.ok ? {} : meta.fields), ...(m ? {} : { game: ['Pick a game.'] }) };
  if (!meta.ok || !m) return errorState('Please fix the fields below.', fields);
  const id = Number(m[2]);
  const result = await createHandler(user, {
    gameId: m[1] === 'g' ? id : null,
    igdbId: m[1] === 'i' ? id : null,
    meta: meta.value,
    ip: await requestIp(),
  });
  if (!result.ok) return toState(result);
  redirect(`${paths.dashboardHandler(result.value.id)}/versions?created=1`);
}

export async function updateHandlerAction(
  handlerId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  if (!isValidId(handlerId)) return errorState('Invalid request.');
  const meta = parseHandlerMeta(metaInput(fd));
  if (!meta.ok) return toState(meta);
  const result = await updateHandlerMeta(user, handlerId, meta.value, await requestIp());
  revalidatePath(paths.dashboardHandler(handlerId));
  return toState(result, 'Saved.');
}

export async function setPublicAction(
  handlerId: string,
  makePublic: boolean,
  _prev: ActionState,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  if (!isValidId(handlerId)) return errorState('Invalid request.');
  const result = await setHandlerPublic(user, handlerId, makePublic, await requestIp());
  revalidatePath('/dashboard', 'layout');
  return toState(result, makePublic ? 'Published.' : 'Now private.');
}

export async function deleteHandlerAction(
  handlerId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  if (!isValidId(handlerId)) return errorState('Invalid request.');
  if (text(fd, 'confirm').trim().toLowerCase() !== 'delete') {
    return errorState('Type "delete" to confirm.', { confirm: ['Type "delete".'] });
  }
  const result = await softDeleteHandler(user, handlerId, await requestIp());
  if (!result.ok) return toState(result);
  revalidatePath('/dashboard', 'layout');
  redirect('/dashboard?deleted=1');
}
