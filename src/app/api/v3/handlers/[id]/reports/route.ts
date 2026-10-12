import { badRequest, CACHE, notFound, preflight, withApi } from '@/lib/api/http';
import { ReportBody } from '@/lib/api/schemas/community';
import { HandlerPath, parseParams } from '@/lib/api/schemas/params';
import { readJsonBody } from '@/server/api/http';
import { createHandlerReport } from '@/server/reports';

export const dynamic = 'force-dynamic';

/** Reports are tiny: 4 KB is plenty for a reason and 1000 characters of message. */
const MAX_BODY_BYTES = 4096;

/**
 * POST /api/v3/handlers/{id}/reports: an anonymous report to the moderators (docs/ARCHITECTURE.md 5.6).
 * 202 whether it was stored or was a duplicate of an open report from the same address in the last 24 h.
 */
export const POST = withApi<{ id: string }>(
  async (req, { params, ip }) => {
    const { id } = parseParams(HandlerPath, params);
    const body = ReportBody.parse(await readJsonBody(req, MAX_BODY_BYTES));
    const outcome = await createHandlerReport({
      handlerId: id,
      reason: body.reason,
      message: body.message,
      version: body.version,
      source: body.client,
      ip,
    });
    if (outcome.status === 'not_found') throw notFound('Handler');
    if (outcome.status === 'unknown_version') {
      throw badRequest('Invalid body', [
        { code: 'custom', path: ['version'], message: 'This handler has no such version' },
      ]);
    }
    return Response.json({ status: 'received' }, { status: 202, headers: { 'Cache-Control': CACHE.none } });
  },
  { rateLimit: 'report' },
);
export const OPTIONS = preflight;
