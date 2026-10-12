import { preflight, withApi } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

/**
 * Swagger UI, self-hosted: assets copied from swagger-ui-dist into public/api-docs at predev/prebuild,
 * plus our committed public/api-docs/init.js. Its own strict CSP (the page middleware skips /api/v3).
 */
const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SplitScreen.Me API v3</title>
  <meta name="description" content="Reference of the public SplitScreen.Me hub API: handlers, games, versions, downloads and comments.">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/api-docs/swagger-ui.css">
  <style>
    body{margin:0;background:#fafafa}
    .ssm-bar{display:flex;gap:16px;align-items:center;padding:10px 20px;background:#0f1115;color:#e8eaed;font:14px/1.4 system-ui,sans-serif}
    .ssm-bar a{color:inherit;text-decoration:none}
    .ssm-bar a:hover{text-decoration:underline}
    .ssm-bar strong{font-weight:600;margin-right:auto}
  </style>
</head>
<body>
  <nav class="ssm-bar" aria-label="SplitScreen.Me">
    <strong><a href="/">SplitScreen.Me</a> · API v3</strong>
    <a href="/doc/api">Guide</a>
    <a href="/api/v3/openapi.json">openapi.json</a>
  </nav>
  <noscript><p style="padding:20px">This reference needs JavaScript. The raw document is <a href="/api/v3/openapi.json">/api/v3/openapi.json</a>.</p></noscript>
  <div id="swagger"></div>
  <script src="/api-docs/swagger-ui-bundle.js"></script>
  <script src="/api-docs/init.js"></script>
</body>
</html>`;

const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export const GET = withApi(async (req) => {
  return new Response(req.method === 'HEAD' ? null : HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
      'Cache-Control': 'public, max-age=300',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
});
export const OPTIONS = preflight;
