import 'server-only';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import busboy from 'busboy';
import { tempPath } from '@/lib/storage';
import { PACKAGE_LIMITS, PackageError } from './limits';

/**
 * Streams a multipart upload (one `package` file, a few text fields) straight to STORAGE_DIR/uploads,
 * counting bytes: nothing is buffered in memory and the upload stops past 30 MiB (section 6.3, step 2).
 */

export interface ReceivedUpload {
  file: string;
  size: number;
  fileName: string;
  fields: Record<string, string>;
}

export class UploadRequestError extends Error {
  constructor(
    readonly status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}

const FIELD_NAMES = new Set(['releaseNotes']);

export async function receiveUpload(
  req: Request,
  maxBytes: number = PACKAGE_LIMITS.maxUploadBytes,
): Promise<ReceivedUpload> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    throw new UploadRequestError(415, 'Send the package as multipart/form-data.');
  }
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes + 64 * 1024) {
    throw new UploadRequestError(413, 'The package is larger than 30 MiB.');
  }
  if (!req.body) throw new UploadRequestError(400, 'Empty request.');

  const dest = await tempPath();
  const fields: Record<string, string> = {};
  let fileName = '';
  let size = 0;
  let fileDone: Promise<void> | null = null;

  const bb = busboy({
    headers: { 'content-type': type },
    limits: { files: 1, fields: 4, parts: 6, fieldSize: 8 * 1024, fileSize: maxBytes + 1, headerPairs: 20 },
  });

  const parsed = new Promise<void>((resolve, reject) => {
    bb.on('field', (name, value, info) => {
      if (info.valueTruncated) return reject(new UploadRequestError(400, `The field ${name} is too long.`));
      if (FIELD_NAMES.has(name)) fields[name] = value;
    });
    bb.on('file', (name, stream, info) => {
      if (name !== 'package' || fileDone) {
        stream.resume();
        return;
      }
      fileName = info.filename ?? '';
      if (!/\.(nc|zip)$/i.test(fileName)) {
        stream.resume();
        reject(new UploadRequestError(400, 'Upload a .nc (or .zip) package.'));
        return;
      }
      stream.on('limit', () => {
        stream.unpipe();
        reject(new PackageError('too_large', 'The package is larger than 30 MiB.'));
        stream.resume();
      });
      const counter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          size += chunk.length;
          if (size > maxBytes) return cb(new PackageError('too_large', 'The package is larger than 30 MiB.'));
          cb(null, chunk);
        },
      });
      fileDone = pipeline(stream, counter, createWriteStream(dest, { flags: 'wx' }));
      fileDone.catch(reject);
    });
    bb.on('partsLimit', () => reject(new UploadRequestError(400, 'Too many form parts.')));
    bb.on('filesLimit', () => reject(new UploadRequestError(400, 'One package at a time.')));
    bb.on('fieldsLimit', () => reject(new UploadRequestError(400, 'Too many form fields.')));
    bb.on('error', (err) =>
      reject(new UploadRequestError(400, `Malformed upload (${(err as Error).message}).`)),
    );
    bb.on('close', () => resolve());
  });

  try {
    const body = Readable.fromWeb(req.body as unknown as WebReadableStream<Uint8Array>);
    body.on('error', () => bb.destroy());
    body.pipe(bb);
    await parsed;
    if (!fileDone) throw new UploadRequestError(400, 'No package in the upload.');
    await fileDone;
    if (size === 0) throw new UploadRequestError(400, 'The package is empty.');
    return { file: dest, size, fileName, fields };
  } catch (err) {
    await rm(dest, { force: true });
    throw err;
  }
}
