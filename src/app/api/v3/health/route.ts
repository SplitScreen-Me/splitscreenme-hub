import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { preflight, withApi } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

async function databaseAnswers(timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const query = db
    .execute(sql`select 1`)
    .then(() => true)
    .catch(() => false);
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const health = withApi(
  async (req) => {
    const ok = await databaseAnswers(2000);
    const body = ok ? { status: 'ok' } : { status: 'unavailable' };
    return new Response(req.method === 'HEAD' ? null : JSON.stringify(body), {
      status: ok ? 200 : 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
  { rateLimit: false },
);

export const GET = health;
export const HEAD = health;
export const OPTIONS = preflight;
