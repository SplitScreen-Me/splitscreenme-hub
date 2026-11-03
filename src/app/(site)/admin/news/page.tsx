import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NewsStatusBadge, SeverityBadge } from '@/components/admin/NewsBadges';
import { ActionForm } from '@/components/interactive/ActionForm';
import { DateTime, EmptyState, LinkButton, Section, Table } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { can } from '@/lib/auth/permissions';
import { NEWS_LIVE_LIMIT, type NewsStatus } from '@/lib/news';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { publishNewsAction } from '@/server/actions/admin';
import { ADMIN_NEWS_LIMIT, listNewsForAdmin } from '@/server/private/news';

export const metadata = privatePageMetadata('App news · Backoffice');

const CREATED: Record<NewsStatus, string> = {
  live: 'Announcement published: the app shows it within a minute.',
  scheduled: 'Announcement published: the app shows it from its start date.',
  expired: 'Announcement published, but its end date has passed: the app does not show it.',
  draft: 'Draft saved: the app does not show it until you publish it.',
};

export default async function AdminNews({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; deleted?: string }>;
}) {
  const me = await requireRole('moderator');
  if (!can(me, 'news.manage')) notFound();
  const sp = await searchParams;
  const now = new Date();
  const rows = await listNewsForAdmin(now);
  const live = rows.filter((r) => r.status === 'live').length;
  const flash = sp.created && sp.created in CREATED ? CREATED[sp.created as NewsStatus] : null;

  return (
    <Section
      title="App news"
      headingLevel={1}
      action={
        <LinkButton href="/admin/news/new" variant="primary" size="sm" icon="plus">
          New announcement
        </LinkButton>
      }
    >
      <div className="grid gap-4">
        <p className="small muted max-w-prose">
          One-line announcements in the Nucleus Co-op app&rsquo;s ticker, read from{' '}
          <code>GET /api/v3/news</code>. The app shows the live ones, critical first, at most{' '}
          {NEWS_LIVE_LIMIT}, and picks up a change within a minute. Times are in UTC.
        </p>
        {flash && (
          <p role="status" className="small text-ok">
            {flash}
          </p>
        )}
        {sp.deleted && (
          <p role="status" className="small text-ok">
            Announcement deleted.
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState
            icon="info"
            title="No announcement yet"
            action={
              <LinkButton href="/admin/news/new" icon="plus">
                Write the first one
              </LinkButton>
            }
          >
            <p>When nothing is live, the app hides its ticker.</p>
          </EmptyState>
        ) : (
          <>
            <p className="small muted">
              {live === 0
                ? 'Nothing is live: the app hides its ticker.'
                : `${live} live announcement${live === 1 ? '' : 's'}${live > NEWS_LIVE_LIMIT ? ` (the app gets the first ${NEWS_LIVE_LIMIT})` : ''}.`}
            </p>
            <Table>
              <caption className="sr-only">Announcements, live first</caption>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Announcement</th>
                  <th scope="col">Shown (UTC)</th>
                  <th scope="col">Updated</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n.id} className={n.status === 'expired' ? 'opacity-70' : undefined}>
                    <td>
                      <NewsStatusBadge status={n.status} />
                    </td>
                    <td className="min-w-64">
                      <div className="grid justify-items-start gap-1">
                        <SeverityBadge severity={n.severity} />
                        <Link href={`/admin/news/${n.id}`} className="break-words text-ink underline">
                          {n.message}
                        </Link>
                        {n.url && (
                          <span className="micro faint break-all">
                            Learn more: <code>{n.url}</code>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="grid gap-0.5 small">
                        <span>
                          from <DateTime value={n.startsAt} format="datetime" />
                        </span>
                        <span className="muted">
                          {n.endsAt ? (
                            <>
                              until <DateTime value={n.endsAt} format="datetime" />
                            </>
                          ) : (
                            'no end'
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <DateTime value={n.updatedAt} format="relative" />
                      {n.authorName && <span className="micro faint block">by {n.authorName}</span>}
                    </td>
                    <td>
                      <ActionForm
                        action={publishNewsAction.bind(null, n.id, !n.published)}
                        submitLabel={n.published ? 'Unpublish' : 'Publish'}
                        submitVariant={n.published ? 'default' : 'primary'}
                        submitSize="sm"
                        inline
                        confirm={n.published ? 'Unpublish this announcement? The app drops it.' : undefined}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {rows.length >= ADMIN_NEWS_LIMIT && (
              <p className="micro faint">The {ADMIN_NEWS_LIMIT} most recent announcements are listed.</p>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
