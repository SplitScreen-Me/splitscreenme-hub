import { goneFromHub, legacyHandlerPath, movedPermanently } from '@/server/hub';

export const dynamic = 'force-dynamic';

/** Old hub link /handler/<id> (the desktop app and the web still link it): 301 to the game or handler page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const path = await legacyHandlerPath((await params).id);
  return path ? movedPermanently(path) : goneFromHub('handler');
}
