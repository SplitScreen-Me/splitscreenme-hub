import 'server-only';
import { rm } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { games, handlerVersions, handlers, users } from '@/db/schema';
import { audit } from '@/lib/audit';
import { can } from '@/lib/auth/permissions';
import { env } from '@/lib/env';
import { newId } from '@/lib/ids';
import { log } from '@/lib/log';
import { absolutePath, commit, packageKey, tempPath } from '@/lib/storage';
import { invalidate, TAGS } from '@/server/cache';
import { PACKAGE_LIMITS, PackageError, RELEASE_NOTES_MAX, RELEASE_NOTES_MIN } from './limits';
import { uploadMutex } from './semaphore';
import { stampScript } from './stamp';
import { inspectPackage, rebuildPackage, type ManifestEntry } from './zip';

/** Executable or script files a moderator should look at before verifying. */
export const RISKY_EXTENSIONS = /\.(exe|dll|bat|cmd|ps1|vbs|scr|com|msi|sys)$/i;

export function manifestSummary(manifest: ManifestEntry[]) {
  const risky = manifest.filter((m) => RISKY_EXTENSIONS.test(m.path));
  return {
    files: manifest.length,
    bytes: manifest.reduce((s, m) => s + m.size, 0),
    executables: risky.length,
    executablePaths: risky.slice(0, 20).map((m) => m.path),
  };
}

export function checkReleaseNotes(raw: unknown): { notes: string } | { problem: string } {
  const notes = typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim() : '';
  if (notes.length < RELEASE_NOTES_MIN) return { problem: 'Describe what changed in this version.' };
  if (notes.length > RELEASE_NOTES_MAX) return { problem: `At most ${RELEASE_NOTES_MAX} characters.` };
  return { notes };
}

export interface UploadOutcome {
  versionId: string;
  version: number;
  sha256: string;
  sizeBytes: number;
  executables: number;
}

/**
 * Validates, stamps and stores an uploaded package as the handler's new current version (section 6.3,
 * steps 3 to 8). `tempFile` is always removed. One upload runs at a time.
 */
export async function processUpload(input: {
  actor: { id: string; role: 'user' | 'moderator' | 'admin' };
  handlerId: string;
  tempFile: string;
  releaseNotes: string;
  ip: string;
}): Promise<UploadOutcome> {
  try {
    const ran = await uploadMutex.run(PACKAGE_LIMITS.queueWaitMs, () => storeVersion(input));
    if (!ran) throw new PackageError('busy', 'Another upload is being processed. Try again in a minute.');
    return ran.value;
  } finally {
    await rm(input.tempFile, { force: true });
  }
}

async function storeVersion(input: Parameters<typeof processUpload>[0]): Promise<UploadOutcome> {
  const [h] = await db
    .select({
      id: handlers.id,
      ownerId: handlers.ownerId,
      ownerName: users.username,
      deletedAt: handlers.deletedAt,
      gameSlug: games.slug,
      next: sql<number>`greatest(${handlers.currentVersion}, coalesce((select max(${handlerVersions.version}) from ${handlerVersions} where ${handlerVersions.handlerId} = ${handlers.id}), 0)) + 1`.mapWith(
        Number,
      ),
    })
    .from(handlers)
    .innerJoin(users, eq(users.id, handlers.ownerId))
    .innerJoin(games, eq(games.id, handlers.gameId))
    .where(eq(handlers.id, input.handlerId))
    .limit(1);
  if (!h || h.deletedAt || !can(input.actor, 'version.upload', { ownerId: h.ownerId })) {
    throw new PackageError('missing_handler', 'Handler not found.');
  }

  const inspection = await inspectPackage(input.tempFile);
  const version = h.next;
  const script = stampScript(inspection.script, {
    version,
    handlerId: h.id,
    ownerName: h.ownerName,
    ownerId: h.ownerId,
    siteUrl: env().SITE_URL,
    date: new Date(),
  });
  if (Buffer.byteLength(script, 'utf8') > PACKAGE_LIMITS.maxScriptBytes + 1024) {
    throw new PackageError('handler_too_large', 'handler.js is larger than 2 MiB.');
  }

  const versionId = newId();
  const key = packageKey(h.id, versionId);
  const built = await tempPath();
  let committed = false;
  try {
    const { sha256, sizeBytes } = await rebuildPackage(input.tempFile, built, inspection, script);
    const summary = manifestSummary(inspection.manifest);
    await db.transaction(async (tx) => {
      // The number was computed before the rebuild; re-check it under the row lock.
      const [locked] = await tx
        .select({ id: handlers.id })
        .from(handlers)
        .where(eq(handlers.id, h.id))
        .for('update');
      if (!locked) throw new PackageError('missing_handler', 'Handler not found.');
      const [{ max } = { max: 0 }] = await tx
        .select({ max: sql<number>`coalesce(max(${handlerVersions.version}), 0)`.mapWith(Number) })
        .from(handlerVersions)
        .where(eq(handlerVersions.handlerId, h.id));
      if (max >= version)
        throw new PackageError('busy', 'Another version was uploaded meanwhile. Try again.');

      await tx.insert(handlerVersions).values({
        id: versionId,
        handlerId: h.id,
        version,
        releaseNotes: input.releaseNotes,
        uploaderId: input.actor.id,
        storageKey: key,
        fileName: `handler-${h.id}-v${version}.nc`,
        sizeBytes,
        sha256,
        script,
        manifest: inspection.manifest,
      });
      await tx
        .update(handlers)
        .set({ currentVersionId: versionId, currentVersion: version, updatedAt: new Date() })
        .where(eq(handlers.id, h.id));
      await audit(tx, {
        actor: input.actor,
        action: 'version.upload',
        target: { type: 'version', id: versionId },
        details: { handlerId: h.id, version, sizeBytes, ...summary },
        ip: input.ip,
      });
      // Last step inside the transaction: a failed rename rolls the rows back.
      await commit(built, key);
      committed = true;
    });
    invalidate(TAGS.handler(h.id), TAGS.game(h.gameSlug), TAGS.catalog, TAGS.stats, TAGS.sitemap);
    return { versionId, version, sha256, sizeBytes, executables: summary.executables };
  } catch (err) {
    if (committed) {
      // The transaction failed after the rename: the file has no row.
      await rm(absolutePath(key), { force: true }).catch((e: unknown) =>
        log.error('upload.cleanup_failed', { err: e }),
      );
    }
    throw err;
  } finally {
    await rm(built, { force: true });
  }
}
