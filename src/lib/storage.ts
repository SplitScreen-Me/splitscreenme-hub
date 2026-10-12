import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rename, rm, stat as fsStat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from './env';

/**
 * Package storage on the bind-mounted volume (STORAGE_DIR). Keys are relative POSIX paths such as
 * `packages/<handlerId>/<versionId>.nc`. nginx serves committed packages through X-Accel-Redirect
 * (`accelPath`) after the app has checked and counted the download.
 */

const KEY = /^(packages|uploads|import)\/[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export class InvalidStorageKeyError extends Error {}

export function assertKey(key: string): string {
  if (!KEY.test(key) || key.split('/').some((s) => s === '.' || s === '..') || key.length > 300) {
    throw new InvalidStorageKeyError('invalid storage key');
  }
  return key;
}

export const storageRoot = () => path.resolve(env().STORAGE_DIR);

/** Absolute path of a key, guaranteed to stay inside the storage root. */
export function absolutePath(key: string): string {
  const root = storageRoot();
  const full = path.resolve(root, assertKey(key));
  if (!full.startsWith(root + path.sep)) throw new InvalidStorageKeyError('key escapes storage root');
  return full;
}

export const packageKey = (handlerId: string, versionId: string) =>
  assertKey(`packages/${handlerId}/${versionId}.nc`);

/** A fresh path under uploads/ for an incoming file (the directory is created). */
export async function tempPath(): Promise<string> {
  const dir = path.join(storageRoot(), 'uploads');
  await mkdir(dir, { recursive: true });
  return path.join(dir, randomUUID());
}

/** Moves a finished temp file to its final key (same volume, atomic rename). */
export async function commit(temp: string, key: string): Promise<void> {
  const dest = absolutePath(key);
  await mkdir(path.dirname(dest), { recursive: true });
  await rename(temp, dest);
}

export async function stat(key: string): Promise<{ size: number; mtime: Date } | null> {
  try {
    const s = await fsStat(absolutePath(key));
    return s.isFile() ? { size: s.size, mtime: s.mtime } : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export function openRead(key: string, range?: { start: number; end?: number }): ReadStream {
  return createReadStream(absolutePath(key), range);
}

export async function remove(keyOrTemp: string): Promise<void> {
  const target = path.isAbsolute(keyOrTemp) ? keyOrTemp : absolutePath(keyOrTemp);
  if (!path.resolve(target).startsWith(storageRoot() + path.sep)) {
    throw new InvalidStorageKeyError('path outside storage root');
  }
  await rm(target, { force: true });
}

/** `X-Accel-Redirect` target when nginx serves files (STORAGE_ACCEL_PREFIX set), else null. */
export function accelPath(key: string): string | null {
  const prefix = env().STORAGE_ACCEL_PREFIX;
  return prefix ? `${prefix}${assertKey(key)}` : null;
}
