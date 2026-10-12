import { Readable } from 'node:stream';
import { notFound, preflight, withApi } from '@/lib/api/http';
import { DownloadQuery, HandlerPath, parseParams, parseQuery } from '@/lib/api/schemas/params';
import { log } from '@/lib/log';
import { accelPath, openRead, stat } from '@/lib/storage';
import { matchesEtag } from '@/server/api/http';
import { parseRange, recordDownload, reprDigest, shouldCount } from '@/server/downloads';
import { getVersionFile } from '@/server/public';

export const dynamic = 'force-dynamic';

/**
 * GET/HEAD /api/v3/handlers/{id}/download: the `.nc` package of a listed handler (current version, or
 * `?version=n`). Counted once per address, handler, version and UTC day unless `count=false`, a partial
 * range, HEAD or a bot (docs/ARCHITECTURE.md 5.5). Behind nginx (STORAGE_ACCEL_PREFIX) the file itself is
 * sent by nginx through X-Accel-Redirect; without it (development) Node streams it.
 */
const download = withApi<{ id: string }>(
  async (req, { params, ip, requestId }) => {
    const { id } = parseParams(HandlerPath, params);
    const query = parseQuery(DownloadQuery, req.nextUrl);
    const file = await getVersionFile(id, query.version);
    if (!file) throw notFound(query.version === undefined ? 'Handler' : 'Handler version');

    const onDisk = await stat(file.storageKey);
    if (!onDisk) {
      log.error('download.file_missing', { requestId, handlerId: id, version: file.version });
      throw notFound('Package file');
    }

    const etag = `"${file.sha256}"`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="handler-${id}-v${file.version}.nc"`,
      ETag: etag,
      'Repr-Digest': reprDigest(file.sha256),
      'Cache-Control': 'private, no-cache',
      'Accept-Ranges': 'bytes',
    };
    if (matchesEtag(req, etag)) return new Response(null, { status: 304, headers });

    const range = req.headers.get('range');
    const counts = shouldCount({
      method: req.method,
      count: query.count,
      range,
      userAgent: req.headers.get('user-agent'),
    });
    if (counts) {
      // A counting failure never blocks the download.
      await recordDownload({ ip, handlerId: id, versionId: file.id, version: file.version }).catch((err) =>
        log.error('download.count_failed', { requestId, handlerId: id, err }),
      );
    }

    const accel = accelPath(file.storageKey);
    if (accel) {
      // nginx serves the file (and ranges) from the internal location.
      return new Response(null, { headers: { ...headers, 'X-Accel-Redirect': accel } });
    }

    const part = parseRange(range, onDisk.size);
    const length = part ? part.end - part.start + 1 : onDisk.size;
    const status = part ? 206 : 200;
    if (part) headers['Content-Range'] = `bytes ${part.start}-${part.end}/${onDisk.size}`;
    headers['Content-Length'] = String(length);
    if (req.method === 'HEAD' || length === 0) return new Response(null, { status, headers });
    const stream = Readable.toWeb(openRead(file.storageKey, part ?? undefined)) as ReadableStream<Uint8Array>;
    return new Response(stream, { status, headers });
  },
  { rateLimit: 'download' },
);

export const GET = download;
export const HEAD = download;
export const OPTIONS = preflight;
