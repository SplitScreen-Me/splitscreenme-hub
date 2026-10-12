import Link from 'next/link';
import { pageParam, Pager } from '@/components/admin/ListFilters';
import { DateTime, EmptyState, Field, Section, Table } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { listGamesForAdmin, PAGE_SIZE } from '@/server/private/admin';

export const metadata = privatePageMetadata('Games · Backoffice');

export default async function AdminGames({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole('moderator');
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 100);
  const page = pageParam(sp.page);
  const { rows, total } = await listGamesForAdmin(q, page);
  const href = (p: number) => `/admin/games?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`;
  return (
    <Section title="Games" headingLevel={1}>
      <div className="grid gap-4">
        <form method="get" role="search" className="flex max-w-md gap-2">
          <Field
            icon="search"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name or slug"
            aria-label="Search games"
            className="flex-1"
          />
        </form>
        <p className="small muted">{total.toLocaleString('en')} game(s)</p>
        {rows.length === 0 ? (
          <EmptyState title="No game found" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">Game</th>
                <th scope="col">Slug</th>
                <th scope="col" className="num">
                  Handlers
                </th>
                <th scope="col">IGDB</th>
                <th scope="col">Steam</th>
                <th scope="col">Synced</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link href={`/admin/games/${g.id}`} className="font-semibold text-ink underline">
                      {g.name}
                    </Link>
                    {g.releaseYear && <span className="micro faint"> ({g.releaseYear})</span>}
                  </td>
                  <td>
                    <code className="small">{g.slug}</code>
                  </td>
                  <td className="num">{g.handlers}</td>
                  <td>{g.igdbId ?? '—'}</td>
                  <td>{g.steamAppId ?? '—'}</td>
                  <td>{g.igdbSyncedAt ? <DateTime value={g.igdbSyncedAt} format="relative" /> : 'never'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={page} hasMore={page * PAGE_SIZE < total} href={href} />
      </div>
    </Section>
  );
}
