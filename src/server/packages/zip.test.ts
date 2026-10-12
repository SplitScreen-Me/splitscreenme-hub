import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yauzl from 'yauzl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_LIMITS, type PackageErrorCode } from './limits';
import { declaresGame, stampScript } from './stamp';
import { buildZip, VALID_SCRIPT, type RawEntry } from './test-zip';
import { inspectPackage, nameProblem, rebuildPackage } from './zip';

let dir: string;
let n = 0;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'ssm-zip-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function file(content: Buffer): Promise<string> {
  const p = path.join(dir, `pkg-${n++}.nc`);
  await writeFile(p, content);
  return p;
}

const zip = (entries: RawEntry[]) => file(buildZip(entries));

async function expectCode(p: Promise<unknown>, code: PackageErrorCode) {
  await expect(p).rejects.toMatchObject({ name: 'PackageError', code });
}

/** Names and contents of a zip, read back with yauzl. */
async function readZip(p: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const z = await yauzl.openPromise(p, { lazyEntries: true });
  for await (const entry of z.eachEntry()) {
    if (entry.fileName.endsWith('/')) {
      out.set(entry.fileName, '');
      continue;
    }
    const s = await z.openReadStreamPromise(entry);
    const chunks: Buffer[] = [];
    for await (const c of s) chunks.push(c as Buffer);
    out.set(entry.fileName, Buffer.concat(chunks).toString('utf8'));
  }
  return out;
}

describe('stampScript', () => {
  const facts = {
    version: 7,
    handlerId: 'HandlerId12345678',
    ownerName: 'Alice "the" Author',
    ownerId: 'OwnerId1234567890',
    siteUrl: 'https://v3.splitscreen.me',
    date: new Date('2026-10-12T10:00:00Z'),
  };

  it('removes old Hub lines and prepends the four stamps', () => {
    const out = stampScript(VALID_SCRIPT, facts);
    const lines = out.split('\n');
    expect(lines[0]).toBe(
      'Hub.Handler.Version = 7; // Released at https://v3.splitscreen.me on 2026-10-12T10:00:00.000Z.',
    );
    expect(lines[1]).toBe('Hub.Handler.Id = "HandlerId12345678";');
    expect(lines[2]).toBe('Hub.Maintainer.Name = "Alice \\"the\\" Author";');
    expect(lines[3]).toBe('Hub.Maintainer.Id = "OwnerId1234567890";');
    expect(out.match(/Hub\.Handler\.Version/g)).toHaveLength(1);
    expect(out).not.toContain('OldIdFromAnotherHub');
    expect(out).toContain('Game.GameName = "Test Game";');
  });

  it('keeps CRLF line endings and indented stamps are removed too', () => {
    const crlf = '  Hub.Maintainer.Name = "x";\r\nGame.GameName = "A";\r\n';
    const out = stampScript(crlf, facts);
    expect(out).not.toMatch(/[^\r]\n/);
    expect(out).not.toContain('"x"');
  });

  it('requires Game.GameName or Game.ExecutableName', () => {
    expect(declaresGame('Game.GameName = "x"')).toBe(true);
    expect(declaresGame('Game . ExecutableName="x.exe"')).toBe(true);
    expect(declaresGame('// Game.GameName is unset\nvar a = 1;')).toBe(false);
  });
});

describe('nameProblem', () => {
  it.each([
    ['../evil.dll', 'path goes up a directory'],
    ['a/../../b', 'path goes up a directory'],
    ['/etc/passwd', 'absolute path'],
    ['C:/Windows/x.dll', 'absolute path'],
    ['a\\b.txt', 'backslash in a file name'],
    ['a\u0000b', 'control character in a file name'],
    ['a//b', 'empty or "." path segment'],
    ['./a', 'empty or "." path segment'],
    ['x'.repeat(261), 'file name too long'],
  ])('%s', (name, problem) => {
    expect(nameProblem(name)).toBe(problem);
  });

  it('accepts normal names', () => {
    expect(nameProblem('handler.js')).toBeNull();
    expect(nameProblem('Engine/Binaries/Win64/x.dll')).toBeNull();
    expect(nameProblem('dir/')).toBeNull();
  });
});

describe('inspectPackage', () => {
  it('accepts a valid package and returns script and manifest', async () => {
    const p = await zip([
      { name: 'Handler.JS', data: `\uFEFF${VALID_SCRIPT}` },
      { name: 'tools/' },
      { name: 'tools/readme.txt', data: 'hello' },
    ]);
    const res = await inspectPackage(p);
    expect(res.script.startsWith('Hub.Handler.Version')).toBe(true); // BOM stripped
    expect(res.scriptEntry).toBe('Handler.JS');
    expect(res.manifest).toEqual([
      { path: 'handler.js', size: Buffer.byteLength(`\uFEFF${VALID_SCRIPT}`) },
      { path: 'tools/readme.txt', size: 5 },
    ]);
  });

  it('refuses a file that is not a zip', async () => {
    await expectCode(inspectPackage(await file(Buffer.from('MZ not a zip at all'))), 'not_zip');
  });

  it('refuses a package without handler.js at its root', async () => {
    await expectCode(
      inspectPackage(await zip([{ name: 'sub/handler.js', data: VALID_SCRIPT }])),
      'missing_handler',
    );
  });

  it('refuses a handler.js that names no game', async () => {
    await expectCode(
      inspectPackage(await zip([{ name: 'handler.js', data: 'var x = 1;' }])),
      'handler_missing_game',
    );
  });

  it('refuses a handler.js that is not UTF-8', async () => {
    const bad = Buffer.concat([
      Buffer.from('Game.GameName = "'),
      Buffer.from([0xc3, 0x28]),
      Buffer.from('";'),
    ]);
    await expectCode(inspectPackage(await zip([{ name: 'handler.js', data: bad }])), 'handler_not_utf8');
  });

  it('refuses path traversal, absolute paths and backslashes', async () => {
    await expectCode(
      inspectPackage(
        await zip([
          { name: 'handler.js', data: VALID_SCRIPT },
          { name: '../evil.dll', data: 'x' },
        ]),
      ),
      'unsafe_path',
    );
    await expectCode(
      inspectPackage(
        await zip([
          { name: 'handler.js', data: VALID_SCRIPT },
          { name: '/abs.txt', data: 'x' },
        ]),
      ),
      'unsafe_path',
    );
    await expectCode(
      inspectPackage(
        await zip([
          { name: 'handler.js', data: VALID_SCRIPT },
          { name: 'a\\b.txt', data: 'x' },
        ]),
      ),
      'unsafe_path',
    );
  });

  it('refuses symbolic links', async () => {
    await expectCode(
      inspectPackage(
        await zip([
          { name: 'handler.js', data: VALID_SCRIPT },
          {
            name: 'link',
            data: '/etc/passwd',
            method: 0,
            versionMadeBy: (3 << 8) | 20,
            externalAttr: (0o120777 << 16) >>> 0,
          },
        ]),
      ),
      'symlink',
    );
  });

  it('refuses encrypted entries', async () => {
    await expectCode(
      inspectPackage(
        await zip([
          { name: 'handler.js', data: VALID_SCRIPT },
          { name: 'secret.bin', data: 'xyz', method: 8, flags: 0x1 },
        ]),
      ),
      'encrypted',
    );
  });

  it('refuses case-insensitive duplicates', async () => {
    await expectCode(
      inspectPackage(
        await zip([
          { name: 'handler.js', data: VALID_SCRIPT },
          { name: 'a.txt', data: '1' },
          { name: 'A.TXT', data: '2' },
        ]),
      ),
      'duplicate',
    );
  });

  it('refuses a zip bomb by compression ratio', async () => {
    // 2 MiB of zeros deflates to a few KB: far above 100:1.
    await expectCode(
      inspectPackage(
        await zip([
          { name: 'handler.js', data: VALID_SCRIPT },
          { name: 'zeros.bin', data: Buffer.alloc(2 * 1024 * 1024) },
        ]),
      ),
      'zip_bomb',
    );
  });

  it('refuses a package whose declared sizes add up beyond the limit', async () => {
    const limits = { ...PACKAGE_LIMITS, maxTotalUncompressed: 1000 };
    await expectCode(
      inspectPackage(
        await zip([
          { name: 'handler.js', data: VALID_SCRIPT },
          { name: 'big.txt', data: 'y'.repeat(2000), method: 0 },
        ]),
        limits,
      ),
      'zip_bomb',
    );
  });

  it('counts real bytes, not declared ones', async () => {
    // The central directory claims 10 bytes; the deflated stream holds 5000.
    const p = await zip([
      { name: 'handler.js', data: VALID_SCRIPT },
      { name: 'liar.txt', data: 'z'.repeat(5000), declaredSize: 10 },
    ]);
    await expect(inspectPackage(p)).rejects.toMatchObject({ name: 'PackageError' });
  });

  it('refuses too many entries', async () => {
    const limits = { ...PACKAGE_LIMITS, maxEntries: 3 };
    const entries: RawEntry[] = [{ name: 'handler.js', data: VALID_SCRIPT }];
    for (let i = 0; i < 4; i++) entries.push({ name: `f${i}.txt`, data: 'x' });
    await expectCode(inspectPackage(await zip(entries), limits), 'too_many_entries');
  });

  it('refuses a handler.js above 2 MiB', async () => {
    const big = `Game.GameName = "x";\n//${'a'.repeat(2 * 1024 * 1024)}`;
    await expectCode(
      inspectPackage(await zip([{ name: 'handler.js', data: big, method: 0 }])),
      'handler_too_large',
    );
  });
});

describe('rebuildPackage', () => {
  it('writes a fresh zip with the stamped handler.js and every other entry', async () => {
    const src = await zip([
      { name: 'HANDLER.js', data: VALID_SCRIPT },
      { name: 'data/' },
      { name: 'data/a.txt', data: 'alpha' },
      { name: 'data/b.bin', data: Buffer.from([1, 2, 3]), method: 0 },
    ]);
    const inspection = await inspectPackage(src);
    const stamped = stampScript(inspection.script, {
      version: 1,
      handlerId: 'NewHandler0000001',
      ownerName: 'owner',
      ownerId: 'OwnerId0000000001',
      siteUrl: 'http://localhost:3000',
      date: new Date(),
    });
    const dest = path.join(dir, 'rebuilt.nc');
    const { sha256, sizeBytes } = await rebuildPackage(src, dest, inspection, stamped);
    const bytes = await readFile(dest);
    expect(bytes.length).toBe(sizeBytes);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    const entries = await readZip(dest);
    expect([...entries.keys()].sort()).toEqual(['data/', 'data/a.txt', 'data/b.bin', 'handler.js']);
    expect(entries.get('handler.js')).toBe(stamped);
    expect(entries.get('data/a.txt')).toBe('alpha');
    // The rebuilt package passes validation again.
    const again = await inspectPackage(dest);
    expect(again.script).toContain('Hub.Handler.Id = "NewHandler0000001";');
  });
});
