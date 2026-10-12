import Link from 'next/link';
import { FilterLinks, pageParam } from '@/components/admin/ListFilters';
import { ActionForm, SubmitButton } from '@/components/interactive/ActionForm';
import { Badge, DateTime, EmptyState, PlainText, Section } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { closeReportsAction } from '@/server/actions/admin';
import { listReports } from '@/server/private/admin';

export const metadata = privatePageMetadata('Reports · Backoffice');

const REASONS: Record<string, string> = {
  broken: 'Broken',
  outdated: 'Outdated',
  malware: 'Malware',
  wrong_game: 'Wrong game',
  inappropriate: 'Inappropriate',
  spam: 'Spam',
  copyright: 'Copyright',
  other: 'Other',
};

export default async function AdminReports({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireRole('moderator');
  const sp = await searchParams;
  const status = sp.status === 'resolved' || sp.status === 'dismissed' ? sp.status : 'open';
  const groups = await listReports(status, pageParam(sp.page));

  return (
    <Section title="Reports" headingLevel={1}>
      <div className="grid gap-5">
        <FilterLinks
          base="/admin/reports"
          param="status"
          current={status}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'dismissed', label: 'Dismissed' },
          ]}
        />
        {groups.length === 0 && (
          <EmptyState icon="check" title={status === 'open' ? 'No open report' : 'Nothing here'} />
        )}
        {groups.map((g) => (
          <article key={g.key} className="grid gap-3 rounded-ctl bg-pane-2 p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h3">
                {g.handlerId ? (
                  <Link href={`/admin/handlers/${g.handlerId}`} className="underline">
                    {g.title}
                  </Link>
                ) : (
                  g.title
                )}
                {g.gameName && <span className="small muted font-normal"> · {g.gameName}</span>}
              </h2>
              <span className="small muted">
                {g.items.length} report{g.items.length > 1 ? 's' : ''}
              </span>
            </header>
            {g.items[0]?.targetType === 'comment' && (
              <blockquote className="border-l-2 border-line-strong pl-3 small">
                {g.items[0].commentDeletedAt ? <em className="muted">(comment already hidden) </em> : null}
                <PlainText text={g.items[0].commentBody ?? ''} />
                <Link href={`/admin/comments?handler=${g.handlerId ?? ''}`} className="micro underline">
                  Moderate comments of this handler
                </Link>
              </blockquote>
            )}
            {status === 'open' ? (
              <ActionForm action={closeReportsAction} className="gap-3">
                <ul className="grid gap-2">
                  {g.items.map((r) => (
                    <li key={r.id}>
                      <label className="check items-start">
                        <input type="checkbox" name="reportId" value={r.id} defaultChecked />
                        <span className="grid gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tone={r.reason === 'malware' ? 'danger' : 'neutral'}>
                              {REASONS[r.reason] ?? r.reason}
                            </Badge>
                            {r.version && <span className="micro faint">v{r.version}</span>}
                            <span className="micro faint">
                              <DateTime value={r.createdAt} format="relative" /> ·{' '}
                              {r.reporterName ?? 'anonymous'} · {r.source ?? 'web'}
                            </span>
                          </span>
                          {r.message && <PlainText text={r.message} className="small text-ink" />}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <input
                  name="note"
                  className="control"
                  maxLength={1000}
                  placeholder="Note (what you did, kept with the report)"
                  aria-label="Resolution note"
                />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="outcome" value="resolved" icon="check" size="sm">
                    Resolve selected
                  </SubmitButton>
                  <SubmitButton name="outcome" value="dismissed" variant="ghost" size="sm">
                    Dismiss selected
                  </SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <ul className="grid gap-2">
                {g.items.map((r) => (
                  <li key={r.id} className="small">
                    <Badge>{REASONS[r.reason] ?? r.reason}</Badge> <DateTime value={r.createdAt} /> ·{' '}
                    {r.status} by {r.resolverName ?? 'unknown'}
                    {r.resolvedAt && (
                      <>
                        {' '}
                        <DateTime value={r.resolvedAt} format="relative" />
                      </>
                    )}
                    {r.resolutionNote && <span className="muted"> · {r.resolutionNote}</span>}
                    {r.message && <PlainText text={r.message} className="micro faint" />}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </Section>
  );
}
