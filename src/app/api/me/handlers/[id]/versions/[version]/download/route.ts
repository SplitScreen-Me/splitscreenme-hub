import { Readable } from 'node:stream';
import { getCurrentUser } from '@/lib/auth/current-user';
import { isValidId } from '@/lib/ids';
import { accelPath, openRead, stat } from '@/lib/storage';
import { getVersionForOwner } from '@/server/private/handlers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Owner or moderator download of any version, listed or not. Never counted. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = await params;
  const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const user = await getCurrentUser();
  const n = Number(version);
  if (!user || !isValidId(id) || !Number.isSafeInteger(n) || n < 1) return notFound();
  const v = await getVersionForOwner(user, id, n);
  if (!v) return notFound();

  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${v.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    ETag: `"${v.sha256}"`,
    'Repr-Digest': `sha-256=:${Buffer.from(v.sha256, 'hex').toString('base64')}:`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  const accel = accelPath(v.storageKey);
  if (accel) {
    headers.set('X-Accel-Redirect', accel);
    return new Response(null, { status: 200, headers });
  }
  const file = await stat(v.storageKey);
  if (!file) return notFound();
  headers.set('Content-Length', String(file.size));
  return new Response(Readable.toWeb(openRead(v.storageKey)) as ReadableStream, { status: 200, headers });
}
