import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LRUCache } from 'lru-cache';

/**
 * Shared bits of the hub's Open Graph images (next/og): static Archivo TTF fonts from src/assets/og
 * (satori needs TTF/OTF, not variable fonts; OFL licence next to them), Bezel colours, and a guarded fetch
 * of the cover so a slow or failing IGDB never breaks the image.
 */

export const OG_COLORS = {
  bezel: '#000000',
  pane: '#14171e',
  pane2: '#1b1f28',
  ink: '#f3f4f6',
  ink2: '#a3abba',
  ink3: '#6b7383',
} as const;

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: 'normal' };

let fonts: Promise<OgFont[]> | undefined;

const toArrayBuffer = (buf: Buffer) =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

/**
 * Archivo 400/600 and Archivo Expanded 800, read once per process. The standalone build gets the files
 * through `outputFileTracingIncludes` in next.config.ts (tracing cannot follow process.cwd() paths).
 */
export function loadOgFonts(): Promise<OgFont[]> {
  fonts ??= Promise.all([
    readFile(path.join(process.cwd(), 'src/assets/og/Archivo-Regular.ttf')).then(toArrayBuffer),
    readFile(path.join(process.cwd(), 'src/assets/og/Archivo-SemiBold.ttf')).then(toArrayBuffer),
    readFile(path.join(process.cwd(), 'src/assets/og/ArchivoExpanded-ExtraBold.ttf')).then(toArrayBuffer),
  ])
    .then(([regular, semibold, expanded]): OgFont[] => [
      { name: 'Archivo', data: regular, weight: 400, style: 'normal' },
      { name: 'Archivo', data: semibold, weight: 600, style: 'normal' },
      { name: 'Archivo Expanded', data: expanded, weight: 800, style: 'normal' },
    ])
    .catch((err: unknown) => {
      fonts = undefined; // retry on the next image
      throw err;
    });
  return fonts;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** An image as a data: URL (JPEG/PNG only, 2 MiB max, 4 s timeout), or null on any failure. */
export async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get('content-type')?.split(';')[0]?.trim();
    if (!res.ok || (type !== 'image/jpeg' && type !== 'image/png')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// ---------- rendered PNGs ----------

const PNG_CACHE_BYTES = 8 * 1024 * 1024;
const DAY_MS = 86_400_000;

/** Rendered images by their inputs: satori and resvg cost 100-500 ms of CPU, so each image renders once. */
const pngs = new LRUCache<string, Uint8Array<ArrayBuffer>>({
  maxSize: PNG_CACHE_BYTES,
  sizeCalculation: (bytes) => Math.max(1, bytes.byteLength),
  ttl: DAY_MS,
});
const rendering = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

/**
 * PNG bytes for `key`, which must describe everything the image shows (so a data change is a new key).
 * `render` returns the response and how long to keep it (shorter when a cover failed to load).
 */
export async function cachedPng(
  key: string,
  render: () => Promise<{ response: Response; ttlMs?: number }>,
): Promise<Uint8Array<ArrayBuffer>> {
  const hit = pngs.get(key);
  if (hit) return hit;
  let pending = rendering.get(key);
  if (!pending) {
    pending = render()
      .then(async ({ response, ttlMs }) => {
        const bytes = new Uint8Array(await response.arrayBuffer());
        pngs.set(key, bytes, { ttl: ttlMs ?? DAY_MS });
        return bytes;
      })
      .finally(() => rendering.delete(key));
    rendering.set(key, pending);
  }
  return pending;
}
