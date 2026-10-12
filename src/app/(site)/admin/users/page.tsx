import Link from 'next/link';
import { FilterLinks, pageParam, Pager } from '@/components/admin/ListFilters';
import { Badge, DateTime, EmptyState, Field, Section, Table } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { PAGE_SIZE, searchUsers } from '@/server/private/admin';

export const metadata = privatePageMetadata('Users · Backoffice');

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; banned?: string; page?: string; deleted?: string }>;
}) {
  const me = await requireRole('moderator');
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 100);
  const role = ['user', 'moderator', 'admin'].includes(sp.role ?? '') ? sp.role! : 'any';
  const page = pageParam(sp.page);
  const { rows, total } = await searchUsers({
    q,
    role: role === 'any' ? undefined : role,
    banned: sp.banned === '1',
    // Searching by address is for admins only (moderators never see emails).
    byEmail: me.role === 'admin',
    page,
  });
  const href = (p: number) =>
    `/admin/users?${new URLSearchParams({ ...(q && { q }), role, ...(sp.banned === '1' && { banned: '1' }), page: String(p) })}`;

  return (
    <Section title="Users" headingLevel={1}>
      <div className="grid gap-4">
        {sp.deleted && (
          <p role="status" className="small text-ok">
            Account deleted (anonymised).
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterLinks
            base="/admin/users"
            param="role"
            current={role}
            keep={{ q }}
            options={[
              { value: 'any', label: 'Everyone' },
              { value: 'moderator', label: 'Moderators' },
              { value: 'admin', label: 'Admins' },
            ]}
          />
          <form method="get" role="search" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="role" value={role} />
            <Field
              icon="search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder={me.role === 'admin' ? 'Username, id or exact email' : 'Username or id'}
              aria-label="Search users"
            />
            <label className="check">
              <input type="checkbox" name="banned" value="1" defaultChecked={sp.banned === '1'} />
              <span>Banned only</span>
            </label>
            <button type="submit" className="btn btn-sm">
              Filter
            </button>
          </form>
        </div>
        <p className="small muted">{total.toLocaleString('en')} account(s)</p>
        {rows.length === 0 ? (
          <EmptyState icon="users" title="No account found" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Email</th>
                <th scope="col" className="num">
                  Handlers
                </th>
                <th scope="col">Joined</th>
                <th scope="col">Last login</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="font-semibold text-ink underline">
                      {u.username}
                    </Link>{' '}
                    {u.bannedAt && <Badge tone="danger">Banned</Badge>}{' '}
                    {u.deletedAt && <Badge>Deleted</Badge>}{' '}
                    {u.trustedAuthor && <Badge tone="ok">Trusted</Badge>}
                  </td>
                  <td>{u.role}</td>
                  <td>{u.hasEmail ? (u.emailVerified ? 'Confirmed' : 'Not confirmed') : 'None'}</td>
                  <td className="num">{u.handlers || ''}</td>
                  <td>
                    <DateTime value={u.createdAt} />
                  </td>
                  <td>{u.lastLoginAt ? <DateTime value={u.lastLoginAt} format="relative" /> : '—'}</td>
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
