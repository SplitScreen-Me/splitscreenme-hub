import { ApiError, badRequest } from '@/lib/api/http';

/** Request helpers of the /api/v3 routes that the shared src/lib/api/http.ts does not cover. */

/** `If-None-Match` matches this ETag (weak comparison, RFC 9110 13.1.2). */
export function matchesEtag(req: Request, etag: string): boolean {
  const header = req.headers.get('if-none-match');
  if (!header) return false;
  const opaque = (t: string) => t.trim().replace(/^W\//, '');
  return header.split(',').some((t) => t.trim() === '*' || opaque(t) === opaque(etag));
}

/**
 * Reads a JSON body of at most `maxBytes` bytes: 413 beyond (checked on Content-Length and while
 * streaming, never trusting the header alone), 400 when it is not JSON. Any content type is accepted, so a
 * browser can post without a preflight; the API reads no cookie, so this opens no CSRF.
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const tooLarge = () => new ApiError('payload_too_large', `Body larger than ${maxBytes} bytes`);
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw tooLarge();
  if (!req.body) throw badRequest('A JSON body is required');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  const text = new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  if (!text.trim()) throw badRequest('A JSON body is required');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest('The body is not valid JSON');
  }
}
