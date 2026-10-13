import { headers } from 'next/headers';

/** The per-request CSP nonce set by the proxy (src/proxy.ts), for the rare inline script that needs one. */
export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get('x-nonce') ?? undefined;
}
