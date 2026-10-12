/**
 * Package files: GridFS (bucket `fs`, written by gridfs-stream in the Meteor hub) to
 * STORAGE_DIR/packages/<handlerId>/<versionId>.nc, with size, sha256 and the zip manifest.
 *
 * Incremental: STORAGE_DIR/import/files-index.json remembers the GridFS id, size, sha256 and manifest of
 * every exported file, so a re-run skips a file that is still on disk with the same GridFS id and size.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GridFSBucket, ObjectId, type Db as MongoDb } from 'mongodb';
import yauzl from 'yauzl';
import { packageKey } from '../../src/lib/storage';
import { NUL } from './transform';

export interface ManifestEntry {
  path: string;
  size: number;
}

export interface ExportedFile {
  storageKey: string;
  size: number;
  sha256: string;
  manifest: ManifestEntry[];
  /** handler.js read from the zip, only when asked for (packages without meta.jsContent) */
  handlerJs?: string | null;
  /** the zip could not be read: the file is kept, the manifest is empty */
  badZip?: boolean;
}

interface IndexEntry {
  gridFsFileId: string;
  size: number;
  sha256: string;
  manifest: ManifestEntry[];
  badZip?: boolean;
}

const MAX_SCRIPT_BYTES = 2 * 1024 * 1024;
const MAX_MANIFEST_ENTRIES = 5000;

export class PackageFiles {
  private index: Record<string, IndexEntry> = {};
  private readonly indexPath: string;
  private readonly bucket: GridFSBucket;

  constructor(
    mongo: MongoDb,
    private readonly storageDir: string,
  ) {
    this.bucket = new GridFSBucket(mongo, { bucketName: 'fs' });
    this.indexPath = path.join(storageDir, 'import', 'files-index.json');
  }

  async loadIndex(): Promise<void> {
    try {
      this.index = JSON.parse(await readFile(this.indexPath, 'utf8')) as Record<string, IndexEntry>;
    } catch {
      this.index = {};
    }
  }

  async saveIndex(): Promise<void> {
    await mkdir(path.dirname(this.indexPath), { recursive: true });
    const tmp = `${this.indexPath}.tmp`;
    await writeFile(tmp, JSON.stringify(this.index));
    await rename(tmp, this.indexPath);
  }

  absolute(storageKey: string): string {
    return path.join(this.storageDir, ...storageKey.split('/'));
  }

  private lengths: Map<string, number> | null = null;

  /** Reads the length of every GridFS file once (2 small fields per file). */
  async loadGridFs(): Promise<number> {
    this.lengths = new Map();
    for await (const f of this.bucket.find({}, { projection: { _id: 1, length: 1 } })) {
      this.lengths.set(String(f._id), Number(f.length));
    }
    return this.lengths.size;
  }

  /** GridFS file length, or null when the file is missing. */
  gridFsLength(gridFsFileId: string): number | null {
    if (!this.lengths) throw new Error('loadGridFs() first');
    return this.lengths.get(gridFsFileId) ?? null;
  }

  /**
   * The file of one version, exported unless an identical copy is already on disk.
   * `download: false` only reuses what is already there (returns null otherwise).
   */
  async ensure(
    handlerId: string,
    versionId: string,
    gridFsFileId: string,
    opts: { download: boolean; needScript: boolean },
  ): Promise<{ file: ExportedFile; reused: boolean } | null> {
    const storageKey = packageKey(handlerId, versionId);
    const dest = this.absolute(storageKey);
    const length = this.gridFsLength(gridFsFileId);
    if (length === null) return null;

    const cached = this.index[versionId];
    const onDisk = await stat(dest).catch(() => null);
    if (cached && cached.gridFsFileId === gridFsFileId && cached.size === length && onDisk?.size === length) {
      const file: ExportedFile = {
        storageKey,
        size: cached.size,
        sha256: cached.sha256,
        manifest: cached.manifest,
      };
      if (cached.badZip) file.badZip = true;
      if (opts.needScript) file.handlerJs = await readHandlerJs(dest).catch(() => null);
      return { file, reused: true };
    }
    if (!opts.download) return null;

    await mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp`;
    const hash = createHash('sha256');
    let size = 0;
    const tap = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        size += chunk.length;
        cb(null, chunk);
      },
    });
    try {
      await pipeline(this.bucket.openDownloadStream(new ObjectId(gridFsFileId)), tap, createWriteStream(tmp));
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
    if (size !== length) {
      await rm(tmp, { force: true });
      throw new Error(`GridFS ${gridFsFileId}: read ${size} bytes, expected ${length}`);
    }
    await rename(tmp, dest);

    const file: ExportedFile = { storageKey, size, sha256: hash.digest('hex'), manifest: [] };
    try {
      const zip = await readZip(dest, opts.needScript);
      file.manifest = zip.manifest;
      if (opts.needScript) file.handlerJs = zip.handlerJs;
    } catch {
      file.badZip = true;
      if (opts.needScript) file.handlerJs = null;
    }
    this.index[versionId] = {
      gridFsFileId,
      size,
      sha256: file.sha256,
      manifest: file.manifest,
      ...(file.badZip ? { badZip: true } : {}),
    };
    return { file, reused: false };
  }
}

/** The zip's file list (directories excluded) and, if asked, its root handler.js. */
export function readZip(
  file: string,
  wantScript: boolean,
): Promise<{ manifest: ManifestEntry[]; handlerJs: string | null }> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true, strictFileNames: false }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('zip open failed'));
      const manifest: ManifestEntry[] = [];
      let handlerJs: string | null = null;
      zip.on('error', reject);
      zip.on('end', () => resolve({ manifest, handlerJs }));
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName.replace(/\\/g, '/').replace(NUL, '');
        if (!name.endsWith('/') && manifest.length < MAX_MANIFEST_ENTRIES) {
          manifest.push({ path: name, size: entry.uncompressedSize });
        }
        if (
          wantScript &&
          handlerJs === null &&
          name.toLowerCase() === 'handler.js' &&
          entry.uncompressedSize <= MAX_SCRIPT_BYTES
        ) {
          zip.openReadStream(entry, (e, stream) => {
            if (e || !stream) return reject(e ?? new Error('zip entry read failed'));
            const parts: Buffer[] = [];
            let total = 0;
            stream.on('data', (b: Buffer) => {
              total += b.length;
              if (total <= MAX_SCRIPT_BYTES) parts.push(b);
            });
            stream.on('error', reject);
            stream.on('end', () => {
              handlerJs = Buffer.concat(parts).toString('utf8').replace(NUL, '');
              zip.readEntry();
            });
          });
          return;
        }
        zip.readEntry();
      });
      zip.readEntry();
    });
  });
}

async function readHandlerJs(file: string): Promise<string | null> {
  return (await readZip(file, true)).handlerJs;
}
