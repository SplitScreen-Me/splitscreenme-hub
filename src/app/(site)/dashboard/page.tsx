import Link from 'next/link';
import { StateBadge } from '@/components/dashboard/StateBadge';
import { Badge, CoverImage, DateTime, EmptyState, formatCount, Icon, LinkButton } from '@/components/ui';
import { canPost, requireUser } from '@/lib/auth/current-user';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { listMyHandlers } from '@/server/private/dashboard';

export const metadata = privatePageMetadata('Your handlers');

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const rows = await listMyHandlers(user.id);
  const allowed = canPost(user);
  const totals = rows.reduce(
    (t, r) => ({
      downloads: t.downloads + r.downloadCount,
      stars: t.stars + r.starCount,
      listed: t.listed + (r.state === 'listed' ? 1 : 0),
    }),
    { downloads: 0, stars: 0, listed: 0 },
  );

  return (
    <>
      <section className="pane pad grid gap-4">
        <div className="pane-head">
          <div>
            <p className="micro faint mb-2 font-semibold tracking-wide uppercase">Dashboard</p>
            <h1 className="h1">Your handlers</h1>
          </div>
          {allowed ? (
            <LinkButton href="/dashboard/new" variant="primary" icon="plus">
              New handler
            </LinkButton>
          ) : null}
        </div>
        {!allowed && (
          <p className="small" role="note">
            <Icon name="info" className="inline h-4 w-4 align-[-3px]" /> To publish handlers, confirm your
            email address or link Discord, GitHub or Google on your{' '}
            <Link href={paths.account()} className="underline">
              account page
            </Link>
            .
          </p>
        )}
        {sp.deleted && (
          <p role="status" className="small text-ok">
            Handler deleted.
          </p>
        )}
        {rows.length > 0 && (
          <p className="small muted">
            {rows.length} handler{rows.length > 1 ? 's' : ''}, {totals.listed} listed ·{' '}
            {formatCount(totals.downloads)} downloads · {formatCount(totals.stars)} star
            {totals.stars === 1 ? '' : 's'}
          </p>
        )}
      </section>

      {rows.length === 0 ? (
        <section className="pane pad">
          <EmptyState
            icon="code"
            title="No handler yet"
            action={
              allowed ? (
                <LinkButton href="/dashboard/new" variant="primary" icon="plus">
                  Create your first handler
                </LinkButton>
              ) : undefined
            }
          >
            <p>
              A handler is the script that tells Nucleus Co-op how to run a game several times on one PC. Read{' '}
              <Link href={paths.doc('handlers/create')} className="underline">
                how to write one
              </Link>{' '}
              and{' '}
              <Link href={paths.doc('handlers/publish')} className="underline">
                how publishing works
              </Link>
              .
            </p>
          </EmptyState>
        </section>
      ) : (
        <section className="pane pad">
          <ul className="grid gap-2">
            {rows.map((h) => (
              <li key={h.id}>
                <Link
                  href={paths.dashboardHandler(h.id)}
                  className="grid grid-cols-[48px_1fr] items-center gap-4 rounded-ctl bg-pane-2 p-3 transition-colors hover:bg-pane-3 sm:grid-cols-[48px_1fr_auto]"
                >
                  <CoverImage imageId={h.coverImageId} alt="" size="t_cover_small" className="w-12" />
                  <span className="grid min-w-0 gap-1">
                    <span className="truncate font-semibold text-ink">{h.title}</span>
                    <span className="small muted truncate">
                      {h.gameName} · v{h.currentVersion || '–'} · updated{' '}
                      <DateTime value={h.updatedAt} format="relative" />
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <StateBadge state={h.state} />
                      {h.unverified && (
                        <Badge tone="warn" icon="warning">
                          Current version unverified
                        </Badge>
                      )}
                      {h.openReportCount > 0 && (
                        <Badge tone="danger" icon="warning">
                          {h.openReportCount} open report{h.openReportCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </span>
                  </span>
                  <span className="small muted col-span-2 flex gap-4 sm:col-span-1">
                    <span title="Downloads" className="inline-flex items-center gap-1">
                      <Icon name="download" /> {formatCount(h.downloadCount)}
                    </span>
                    <span title="Stars" className="inline-flex items-center gap-1">
                      <Icon name="star" /> {formatCount(h.starCount)}
                    </span>
                    <span title="Comments" className="inline-flex items-center gap-1">
                      <Icon name="comment" /> {formatCount(h.commentCount)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
