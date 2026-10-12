import { toAuthor } from '@/lib/api/dto';
import { CACHE, jsonWithEtag, notFound, preflight, withApi } from '@/lib/api/http';
import { AuthorPath, parseParams } from '@/lib/api/schemas/params';
import { getLinkContext } from '@/server/api/context';
import { getAuthor } from '@/server/public';

export const dynamic = 'force-dynamic';

/** GET /api/v3/authors/{username}: a public profile and its listed handlers; 404 if deleted or suspended. */
export const GET = withApi<{ username: string }>(async (req, { params }) => {
  const { username } = parseParams(AuthorPath, params);
  const [author, ctx] = await Promise.all([getAuthor(username), getLinkContext()]);
  if (!author) throw notFound('Author');
  return jsonWithEtag(req, toAuthor(author, ctx), { cacheControl: CACHE.read });
});
export const OPTIONS = preflight;
