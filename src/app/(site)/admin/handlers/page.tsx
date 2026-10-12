import Link from 'next/link';
import { FilterLinks, pageParam, Pager } from '@/components/admin/ListFilters';
import { StateBadge } from '@/components/dashboard/StateBadge';
import { Badge, DateTime, EmptyState, Field, Section, Table } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { listHandlersForReview, PAGE_SIZE, type HandlerQueue } from '@/server/private/admin';

export const metadata = privatePageMetadata('Handlers · Backoffice');

const QUEUES: { value: HandlerQueue; label: string }[] = [
  { value: 'awaiting', label: 'Awaiting approval' },
  { value: 'unverified', label: 'Unverified versions' },
  { value: 'reported', label: 'Reported' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'all', label: 'All' },
];

export default async function AdminHandlers({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; q?: string; page?: string }>;
}) {
  await requireRole('moderator');
  const sp = await searchParams;
  const queue = (QUEUES.find((x) => x.value === sp.queue)?.value ?? 'awaiting') as HandlerQueue;
  const q = (sp.q ?? '').slice(0, 100);
  const page = pageParam(sp.page);
  const { rows, total } = await listHandlersForReview(queue, q, page);
  const href = (p: number) =>
    `/admin/handlers?${new URLSearchParams({ queue, ...(q && { q }), page: String(p) })}`;

  return (
    <Section title="Handlers" headingLevel={1}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterLinks base="/admin/handlers" param="queue" current={queue} options={QUEUES} keep={{ q }} />
          <form method="get" role="search" className="flex gap-2">
            <input type="hidden" name="queue" value={queue} />
            <Field
              icon="search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Title, game, author or id"
              aria-label="Search handlers"
            />
          </form>
        </div>
        <p className="small muted">{total.toLocaleString('en')} handler(s)</p>
        {rows.length === 0 ? (
          <EmptyState icon="check" title="Nothing here" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">Handler</th>
                <th scope="col">Author</th>
                <th scope="col">State</th>
                <th scope="col">Current version</th>
                <th scope="col" className="num">
                  Reports
                </th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link href={`/admin/handlers/${h.id}`} className="font-semibold text-ink underline">
                      {h.title}
                    </Link>
                    <div className="micro faint">{h.gameName}</div>
                  </td>
                  <td>
                    <Link href={`/admin/users/${h.ownerId}`} className="underline">
                      {h.ownerName}
                    </Link>
                  </td>
                  <td>
                    <StateBadge state={h.state} />
                  </td>
                  <td>
                    {h.currentVersionId ? (
                      <span className="inline-flex items-center gap-2">
                        v{h.currentVersion}
                        {h.verifiedAt ? (
                          <Badge tone="verified" icon="seal">
                            Verified
                          </Badge>
                        ) : (
                          <Badge tone="warn">Unverified</Badge>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">{h.openReportCount || ''}</td>
                  <td>
                    <DateTime value={h.updatedAt} format="relative" />
                  </td>
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
