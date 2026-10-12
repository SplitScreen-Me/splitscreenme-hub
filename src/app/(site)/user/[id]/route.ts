import { goneFromHub, legacyUserPath, movedPermanently } from '@/server/hub';

export const dynamic = 'force-dynamic';

/** Old hub link /user/<id>: 301 to /hub/authors/<username>. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const path = await legacyUserPath((await params).id);
  return path ? movedPermanently(path) : goneFromHub('profile');
}
