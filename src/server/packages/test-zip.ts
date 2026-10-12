import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Test helper: writes zip archives byte by byte, so tests can build the malformed and hostile packages
 * that zip libraries refuse to produce (traversal, symlinks, encrypted flags, lying sizes...).
 */
export interface RawEntry {
  name: string;
  data?: Buffer | string;
  /** 0 = stored, 8 = deflate (default) */
  method?: 0 | 8;
  /** general purpose bit flag, bit 11 (UTF-8 names) is always added */
  flags?: number;
  /** high 16 bits = Unix mode when versionMadeBy says Unix */
  externalAttr?: number;
  versionMadeBy?: number;
  /** lie about the uncompressed size in the central directory */
  declaredSize?: number;
}

export function buildZip(entries: RawEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : (e.data ?? Buffer.alloc(0));
    const method = e.method ?? (raw.length ? 8 : 0);
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, 'utf8');
    const flags = (e.flags ?? 0) | 0x800;
    const crc = crc32(raw);
    const size = e.declaredSize ?? raw.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.versionMadeBy ?? 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((e.externalAttr ?? 0) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export const VALID_SCRIPT = [
  'Hub.Handler.Version = 3; // old stamp',
  'Hub.Handler.Id = "OldIdFromAnotherHub";',
  'Game.GameName = "Test Game";',
  'Game.ExecutableName = "game.exe";',
  'Game.MaxPlayers = 4;',
  '',
].join('\n');
