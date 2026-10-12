import { absoluteUrl, paths } from '@/lib/urls';

/** 301 to a canonical path of the site (old hub links keep working after the move). */
export function movedPermanently(path: string): Response {
  return new Response(null, {
    status: 301,
    headers: { Location: absoluteUrl(path), 'Cache-Control': 'public, max-age=3600' },
  });
}

/**
 * 404 for an old link whose target is gone (deleted, private or unknown): a tiny self-contained page that
 * points to the catalogue, so a visitor from an old link is not left on a blank screen.
 */
export function goneFromHub(what: 'handler' | 'profile'): Response {
  const title = what === 'handler' ? 'This handler is not on the hub' : 'This profile is not on the hub';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | SplitScreen.Me</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f3f4f6;font:16px/1.55 system-ui,sans-serif}main{max-width:36rem;padding:32px;border-radius:14px;background:#14171e}h1{margin:0 0 8px;font-size:1.5rem}p{color:#a3abba;margin:0 0 20px}a{display:inline-block;padding:10px 18px;border-radius:8px;background:#f3f4f6;color:#07080a;font-weight:650;text-decoration:none}</style></head><body><main><h1>${title}</h1><p>It may have been removed or made private by its author. The game may still have another handler.</p><a href="${paths.hub()}">Browse all games</a></main></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
