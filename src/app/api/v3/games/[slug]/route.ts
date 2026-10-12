import { toGame } from '@/lib/api/dto';
import { CACHE, jsonWithEtag, notFound, preflight, withApi } from '@/lib/api/http';
import { GamePath, parseParams } from '@/lib/api/schemas/params';
import { apiBase } from '@/lib/urls';
import { getLinkContext } from '@/server/api/context';
import { getGameBySlug } from '@/server/public';

export const dynamic = 'force-dynamic';

/** GET /api/v3/games/{slug}: a public game and its listed handlers; 308 to the new slug after a rename. */
export const GET = withApi<{ slug: string }>(async (req, { params }) => {
  const { slug } = parseParams(GamePath, params);
  const [lookup, ctx] = await Promise.all([getGameBySlug(slug), getLinkContext()]);
  if (!lookup) throw notFound('Game');
  if (lookup.kind === 'redirect') {
    return new Response(null, {
      status: 308,
      headers: {
        Location: `${apiBase()}/games/${encodeURIComponent(lookup.slug)}`,
        'Cache-Control': CACHE.read,
      },
    });
  }
  return jsonWithEtag(req, toGame(lookup.game, ctx), { cacheControl: CACHE.read });
});
export const OPTIONS = preflight;
