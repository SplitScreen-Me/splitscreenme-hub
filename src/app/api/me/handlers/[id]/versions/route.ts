import { canPost, getCurrentUser } from '@/lib/auth/current-user';
import { isValidId } from '@/lib/ids';
import { log } from '@/lib/log';
import { hit } from '@/lib/rate-limit';
import { assertSameOrigin, clientIp, ForbiddenOriginError } from '@/lib/request';
import { paths } from '@/lib/urls';
import { isPackageError } from '@/server/packages/limits';
import { receiveUpload, UploadRequestError } from '@/server/packages/receive';
import { checkReleaseNotes, processUpload } from '@/server/packages/upload';
import { loadEditable } from '@/server/private/handlers';

export const dynamic = 'force-dynamic';
// Uploads stream from the request; never cached, Node runtime.
export const runtime = 'nodejs';

/**
 * Upload a version (multipart: `package`, `releaseNotes`), docs/ARCHITECTURE.md section 6.3.
 * Same-origin, session, owner or moderator, proven address, rate limit, then the package pipeline.
 * Answers JSON for fetch(); a plain HTML form submit (no JavaScript) gets a 303 back to the versions page.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wantsHtml = (req.headers.get('accept') ?? '').includes('text/html');
  const back = paths.dashboardHandler(id) + '/versions';
  const answer = (status: number, body: Record<string, unknown>) => {
    if (wantsHtml && isValidId(id)) {
      const q = body.ok
        ? `uploaded=${body.version}`
        : `error=${encodeURIComponent(String(body.message ?? 'Upload failed'))}`;
      return new Response(null, {
        status: 303,
        headers: { Location: `${back}?${q}`, 'Cache-Control': 'no-store' },
      });
    }
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  };

  try {
    assertSameOrigin(req);
  } catch (err) {
    if (err instanceof ForbiddenOriginError)
      return Response.json({ ok: false, message: 'Forbidden' }, { status: 403 });
    throw err;
  }
  const user = await getCurrentUser();
  if (!user) return answer(401, { ok: false, message: 'Log in again to upload.' });
  if (!isValidId(id)) return answer(404, { ok: false, message: 'Handler not found.' });
  if (!canPost(user)) {
    return answer(403, {
      ok: false,
      message: 'Confirm your email address (or link a provider) before uploading.',
    });
  }
  const handler = await loadEditable(user, id);
  if (!handler) return answer(404, { ok: false, message: 'Handler not found.' });
  const limited = hit('upload', user.id);
  if (!limited.ok) {
    return answer(429, {
      ok: false,
      message: `Upload limit reached. Try again in ${Math.ceil(limited.retryAfter / 60)} min.`,
    });
  }

  let received;
  try {
    received = await receiveUpload(req);
  } catch (err) {
    if (err instanceof UploadRequestError) return answer(err.status, { ok: false, message: err.message });
    if (isPackageError(err)) return answer(413, { ok: false, code: err.code, message: err.message });
    throw err;
  }
  const notes = checkReleaseNotes(received.fields.releaseNotes);
  if ('problem' in notes) {
    const { rm } = await import('node:fs/promises');
    await rm(received.file, { force: true });
    return answer(400, { ok: false, field: 'releaseNotes', message: notes.problem });
  }

  try {
    const outcome = await processUpload({
      actor: user,
      handlerId: id,
      tempFile: received.file,
      releaseNotes: notes.notes,
      ip: clientIp(req.headers),
    });
    return answer(201, { ok: true, ...outcome });
  } catch (err) {
    if (isPackageError(err)) {
      const status = err.code === 'busy' ? 503 : err.code === 'too_large' ? 413 : 422;
      return answer(status, { ok: false, code: err.code, message: err.message });
    }
    log.error('upload.failed', { handlerId: id, err });
    return answer(500, { ok: false, message: 'The upload failed on our side. Try again later.' });
  }
}
