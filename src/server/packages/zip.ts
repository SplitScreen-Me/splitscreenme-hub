import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open as openFile } from 'node:fs/promises';
import { Transform, type Readable, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import yazl from 'yazl';
import { PACKAGE_LIMITS, PackageError } from './limits';
import { declaresGame } from './stamp';

/**
 * Package validation and rebuild (docs/ARCHITECTURE.md section 6.3, steps 3 to 7). Two passes over the
 * zip, never more than one entry in memory (handler.js, at most 2 MiB): the first checks names, flags and
 * real sizes; the second writes a fresh zip with yazl, handler.js replaced by the stamped script.
 */

export interface ManifestEntry {
  path: string;
  size: number;
}

export interface Inspection {
  /** handler.js, decoded (BOM stripped), not stamped yet */
  script: string;
  /** Entry name of handler.js in the upload (any case), renamed to handler.js on rebuild */
  scriptEntry: string;
  manifest: ManifestEntry[];
  entryCount: number;
  totalUncompressed: number;
}

type Limits = { readonly [K in keyof typeof PACKAGE_LIMITS]: number };

const YAUZL_OPTIONS = {
  lazyEntries: true,
  validateEntrySizes: true,
  strictFileNames: true,
  decodeStrings: true,
  autoClose: false,
} as const;

function openZip(file: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, YAUZL_OPTIONS, (err, zip) => (err ? reject(mapYauzlError(err)) : resolve(zip)));
  });
}

function mapYauzlError(err: Error): PackageError {
  const m = err.message;
  if (/^invalid characters in fileName|^absolute path|^invalid relative path/.test(m)) {
    return new PackageError('unsafe_path', `Unsafe file name in the package (${m.split(':')[0]}).`);
  }
  if (/strong encryption/.test(m))
    return new PackageError('encrypted', 'Encrypted packages are not accepted.');
  if (/end of central directory record signature not found/.test(m)) {
    return new PackageError('not_zip', 'This file is not a zip archive.');
  }
  return new PackageError('corrupt', 'The package is damaged or not a standard zip archive.');
}

/** Iterates entries one at a time (lazyEntries). */
async function* entries(zip: ZipFile): AsyncGenerator<Entry> {
  let resolveNext: ((e: Entry | null) => void) | null = null;
  let rejectNext: ((e: Error) => void) | null = null;
  const onEntry = (e: Entry) => resolveNext?.(e);
  const onEnd = () => resolveNext?.(null);
  const onError = (e: Error) => rejectNext?.(mapYauzlError(e));
  zip.on('entry', onEntry);
  zip.on('end', onEnd);
  zip.on('error', onError);
  try {
    for (;;) {
      const next = new Promise<Entry | null>((resolve, reject) => {
        resolveNext = resolve;
        rejectNext = reject;
      });
      zip.readEntry();
      const entry = await next;
      if (!entry) return;
      yield entry;
    }
  } finally {
    zip.off('entry', onEntry);
    zip.off('end', onEnd);
    zip.off('error', onError);
  }
}

function openEntry(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => (err ? reject(mapYauzlError(err)) : resolve(stream)));
  });
}

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Name rules beyond yauzl's own (which already refuses backslashes, absolute paths and ".."). */
export function nameProblem(name: string, limits: Limits = PACKAGE_LIMITS): string | null {
  if (!name) return 'empty file name';
  if (name.length > limits.maxNameLength) return 'file name too long';
  if (CONTROL.test(name)) return 'control character in a file name';
  if (name.includes('\\')) return 'backslash in a file name';
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return 'absolute path';
  const segments = name.replace(/\/$/, '').split('/');
  if (segments.some((s) => s === '..')) return 'path goes up a directory';
  if (segments.some((s) => s === '' || s === '.')) return 'empty or "." path segment';
  return null;
}

/** Counts real decompressed bytes against a shared budget; fails the stream when it is exceeded. */
class Budget {
  used = 0;
  constructor(readonly max: number) {}
  meter(): Transform {
    return new Transform({
      transform: (chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) => {
        this.used += chunk.length;
        if (this.used > this.max) {
          cb(new PackageError('zip_bomb', 'The package expands to more than 250 MiB.'));
          return;
        }
        cb(null, chunk);
      },
    });
  }
}

async function assertZipMagic(file: string): Promise<void> {
  const fh = await openFile(file, 'r');
  try {
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    if (bytesRead < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
      throw new PackageError('not_zip', 'This file is not a zip archive (.nc packages are zip files).');
    }
  } finally {
    await fh.close();
  }
}

const isDirectory = (e: Entry) => e.fileName.endsWith('/');
const isScriptEntry = (name: string) => name.toLowerCase() === 'handler.js';

export async function inspectPackage(file: string, limits: Limits = PACKAGE_LIMITS): Promise<Inspection> {
  await assertZipMagic(file);
  const zip = await openZip(file);
  try {
    if (zip.entryCount > limits.maxEntries) {
      throw new PackageError('too_many_entries', `At most ${limits.maxEntries} files per package.`);
    }
    const seen = new Set<string>();
    const manifest: ManifestEntry[] = [];
    const budget = new Budget(limits.maxTotalUncompressed);
    let declared = 0;
    let script: Buffer | null = null;
    let scriptEntry = '';

    for await (const entry of entries(zip)) {
      const name = entry.fileName;
      const problem = nameProblem(name, limits);
      if (problem) throw new PackageError('unsafe_path', `Unsafe file name in the package: ${problem}.`);
      const key = name.replace(/\/$/, '').toLowerCase();
      if (seen.has(key)) throw new PackageError('duplicate', 'Two files in the package have the same name.');
      seen.add(key);
      if (((entry.externalFileAttributes >>> 16) & S_IFMT) === S_IFLNK) {
        throw new PackageError('symlink', 'Symbolic links are not accepted in packages.');
      }
      if (entry.generalPurposeBitFlag & 0x1) {
        throw new PackageError('encrypted', 'Encrypted packages are not accepted.');
      }
      if (isDirectory(entry)) continue;
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
        throw new PackageError('unsupported', 'Use standard zip compression (deflate or store).');
      }
      declared += entry.uncompressedSize;
      if (declared > limits.maxTotalUncompressed) {
        throw new PackageError('zip_bomb', 'The package expands to more than 250 MiB.');
      }
      if (
        entry.uncompressedSize > limits.ratioCheckAbove &&
        (entry.compressedSize === 0 || entry.uncompressedSize / entry.compressedSize > limits.maxRatio)
      ) {
        throw new PackageError('zip_bomb', 'A file in the package is compressed suspiciously well.');
      }

      const wantScript = !name.includes('/') && isScriptEntry(name);
      if (wantScript && entry.uncompressedSize > limits.maxScriptBytes) {
        throw new PackageError('handler_too_large', 'handler.js is larger than 2 MiB.');
      }
      const chunks: Buffer[] = [];
      const stream = await openEntry(zip, entry);
      await pipeline(stream, budget.meter(), async (source: AsyncIterable<Buffer>) => {
        for await (const chunk of source) if (wantScript) chunks.push(chunk);
      }).catch((err: unknown) => {
        throw err instanceof PackageError ? err : mapYauzlError(err as Error);
      });
      if (wantScript) {
        script = Buffer.concat(chunks);
        scriptEntry = name;
      }
      manifest.push({ path: wantScript ? 'handler.js' : name, size: entry.uncompressedSize });
    }

    if (!script) throw new PackageError('missing_handler', 'The package has no handler.js at its root.');
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(script);
    } catch {
      throw new PackageError('handler_not_utf8', 'handler.js is not valid UTF-8 text.');
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (!declaresGame(text)) {
      throw new PackageError(
        'handler_missing_game',
        'handler.js must set Game.GameName or Game.ExecutableName (the app refuses packages without them).',
      );
    }
    manifest.sort((a, b) => a.path.localeCompare(b.path));
    return {
      script: text,
      scriptEntry,
      manifest,
      entryCount: zip.entryCount,
      totalUncompressed: budget.used,
    };
  } finally {
    zip.close();
  }
}

/**
 * Writes a fresh zip (deflate) to `dest`: every entry of `src` in order, handler.js replaced by `script`.
 * Real bytes are metered again (the source is not trusted twice). Returns the sha256 and size.
 */
export async function rebuildPackage(
  src: string,
  dest: string,
  inspection: Pick<Inspection, 'scriptEntry'>,
  script: string,
  limits: Limits = PACKAGE_LIMITS,
): Promise<{ sha256: string; sizeBytes: number }> {
  const zip = await openZip(src);
  const out = new yazl.ZipFile();
  const hash = createHash('sha256');
  let size = 0;
  const budget = new Budget(limits.maxTotalUncompressed);
  let failed: Error | null = null;

  const written = pipeline(
    out.outputStream as unknown as Readable,
    new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        size += chunk.length;
        cb(null, chunk);
      },
    }),
    createWriteStream(dest, { flags: 'wx' }),
  );

  const fail = (err: unknown) => {
    if (failed) return;
    failed = err instanceof PackageError ? err : mapYauzlError(err as Error);
    (out.outputStream as unknown as Readable).destroy(failed);
  };
  (out as unknown as NodeJS.EventEmitter).on('error', fail);

  const timer = setTimeout(
    () => fail(new PackageError('timeout', 'The package took too long to process.')),
    limits.rebuildTimeoutMs,
  );
  try {
    for await (const entry of entries(zip)) {
      if (failed) break;
      const mtime = entry.getLastModDate();
      if (isDirectory(entry)) {
        out.addEmptyDirectory(entry.fileName, { mtime });
      } else if (entry.fileName === inspection.scriptEntry) {
        out.addBuffer(Buffer.from(script, 'utf8'), 'handler.js', { mtime, compress: true });
      } else {
        out.addReadStreamLazy(entry.fileName, { mtime, compress: true }, (cb) => {
          openEntry(zip, entry).then(
            (stream) => {
              const meter = budget.meter();
              stream.on('error', fail);
              meter.on('error', fail);
              cb(null, stream.pipe(meter));
            },
            (err: unknown) => {
              fail(err);
              cb(err, undefined as never);
            },
          );
        });
      }
    }
    out.end();
    await written;
    if (failed) throw failed;
  } catch (err) {
    throw failed ?? (err instanceof PackageError ? err : mapYauzlError(err as Error));
  } finally {
    clearTimeout(timer);
    zip.close();
  }
  return { sha256: hash.digest('hex'), sizeBytes: size };
}
