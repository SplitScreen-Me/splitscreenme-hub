import { getCurrentUser } from '@/lib/auth/current-user';
import { exportUserData } from '@/server/auth/account';

export const dynamic = 'force-dynamic';

/** Data export of the signed-in user (privacy policy: access and portability), as a JSON download. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Not found', { status: 404 });
  const data = await exportUserData(user.id);
  if (!data) return new Response('Not found', { status: 404 });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="splitscreenme-account-${day}.json"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
