import { openApiDocument } from '../openapi';

/**
 * The introduction shown at the top of /api/v3/docs (the `info.description` of the document): the rules
 * that apply to every endpoint. The endpoints themselves are documented where they are registered.
 */
const OVERVIEW = `Public API of the SplitScreen.Me hub: the Nucleus Co-op handlers, their games, versions and comments.
The desktop app, the Discord bot and the site use it; so can you.

**Access.** No account and no key. Every endpoint answers any origin (\`Access-Control-Allow-Origin: *\`) and
never reads cookies. Reads are \`GET\` (\`HEAD\` works too); the only write is an anonymous report.

**Format.** JSON in camelCase, dates in ISO 8601 UTC, absolute URLs. Only listed handlers exist here: a
handler that is private, awaiting approval, deleted or without a version answers 404, like an unknown one.
Ids are the hub's 17-character ids (\`RkbcpmL5dNbrDcfjL\`); they never change.

**Caching.** Reads carry an \`ETag\`: send it back in \`If-None-Match\` and you get a \`304\` with no body while
nothing changed. \`Cache-Control\` says how long an answer stays fresh (1 minute for most reads, 5 minutes for
the catalogue and the genres).

**Rate limits**, per address: 300 requests per 5 minutes over the API, plus 30 per 5 minutes for
\`/catalog\`, 60 per 10 minutes for downloads and 5 reports per hour. Over the limit you get a \`429\` with a
\`Retry-After\` header (seconds). Load \`/catalog\` once and search it locally rather than calling
\`/handlers\` for every keystroke.

**Errors** are \`{ "error": { "code", "message", "issues"? } }\` with \`code\` among \`bad_request\` (400, with
the validation \`issues\`), \`not_found\` (404), \`payload_too_large\` (413), \`rate_limited\` (429) and
\`internal\` (500).

**Downloads** are counted once per address, handler, version and day. Use \`count=false\` for previews, tests
and "Try it out" on this page, and check the SHA-256 of what you downloaded.

**Images** come from IGDB: \`https://images.igdb.com/igdb/image/upload/<size>/<imageId>.jpg\`, with sizes such
as \`t_cover_big\` for covers and \`t_screenshot_big\` for screenshots.`;

let cached: { serverUrl: string; doc: ReturnType<typeof openApiDocument> } | undefined;

/** The OpenAPI document with the overview, built once per process (per server URL). */
export function apiDocument(serverUrl: string, docsPageUrl: string) {
  if (cached?.serverUrl === serverUrl) return cached.doc;
  const base = openApiDocument(serverUrl);
  const doc = {
    ...base,
    info: { ...base.info, description: OVERVIEW },
    externalDocs: { description: 'Guide and examples', url: docsPageUrl },
  };
  cached = { serverUrl, doc };
  return doc;
}
