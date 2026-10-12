import { toGenre } from '@/lib/api/dto';
import { CACHE, jsonWithEtag, preflight, withApi } from '@/lib/api/http';
import { getGenres } from '@/server/public';

export const dynamic = 'force-dynamic';

/** GET /api/v3/genres: genres of the games that have a listed handler, most games first. */
export const GET = withApi(async (req) => {
  const genres = await getGenres();
  return jsonWithEtag(req, { items: genres.map(toGenre) }, { cacheControl: CACHE.catalog });
});
export const OPTIONS = preflight;
