import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DateTime, EmptyState, Section, Table } from '@/components/ui';
import { requireRole } from '@/lib/auth/current-user';
import { can } from '@/lib/auth/permissions';
import { AUDIT_ACTIONS } from '@/lib/audit';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { listAudit } from '@/server/private/admin';

export const metadata = privatePageMetadata('Audit log · Backoffice');

const targetHref = (type: string | null, id: string | null) => {
  if (!type || !id) return null;
  if (type === 'user') return `/admin/users/${id}`;
  if (type === 'handler') return `/admin/handlers/${id}`;
  if (type === 'game') return `/admin/games/${id}`;
  return null;
};

type Search = {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  before?: string;
};

export default async function AdminAudit({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole('moderator');
  if (!can(me, 'audit.read')) notFound();
  const sp = await searchParams;
  const before = Number(sp.before);
  const { rows, nextBefore } = await listAudit({
    ...sp,
    before: Number.isSafeInteger(before) && before > 0 ? before : undefined,
  });
  const keep = Object.fromEntries(
    Object.entries(sp).filter(([k, v]) => k !== 'before' && typeof v === 'string' && v),
  );

  return (
    <Section title="Audit log" headingLevel={1}>
      <div className="grid gap-4">
        <form
          method="get"
          className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
          aria-label="Filter the audit log"
        >
          <label className="form-field">
            <span className="form-label">Actor</span>
            <input name="actor" className="control" defaultValue={sp.actor} placeholder="Username or id" />
          </label>
          <label className="form-field">
            <span className="form-label">Action</span>
            <input
              name="action"
              className="control"
              defaultValue={sp.action}
              placeholder="e.g. handler."
              list="audit-actions"
            />
            <datalist id="audit-actions">
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          <label className="form-field">
            <span className="form-label">Target type</span>
            <select name="targetType" className="control" defaultValue={sp.targetType ?? ''}>
              <option value="">Any</option>
              {['user', 'handler', 'version', 'comment', 'report', 'game', 'system'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Target id</span>
            <input name="targetId" className="control" defaultValue={sp.targetId} />
          </label>
          <label className="form-field">
            <span className="form-label">From (UTC)</span>
            <input name="from" type="date" className="control" defaultValue={sp.from} />
          </label>
          <label className="form-field">
            <span className="form-label">To (UTC)</span>
            <input name="to" type="date" className="control" defaultValue={sp.to} />
          </label>
          <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
            <button type="submit" className="btn btn-sm btn-primary">
              Filter
            </button>
            <Link href="/admin/audit" className="btn btn-sm btn-ghost">
              Reset
            </Link>
          </div>
        </form>
        {rows.length === 0 ? (
          <EmptyState icon="book" title="No entry" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = targetHref(r.targetType, r.targetId);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      <DateTime value={r.at} format="datetime" />
                    </td>
                    <td>
                      {r.actorId ? (
                        <Link href={`/admin/users/${r.actorId}`} className="underline">
                          {r.actorName ?? r.actorId}
                        </Link>
                      ) : (
                        'system'
                      )}
                      {r.actorRole && r.actorRole !== 'user' && (
                        <span className="micro faint"> ({r.actorRole})</span>
                      )}
                    </td>
                    <td>
                      <code className="small">{r.action}</code>
                    </td>
                    <td>
                      {r.targetType}{' '}
                      {href ? (
                        <Link href={href} className="underline">
                          <code className="small">{r.targetId}</code>
                        </Link>
                      ) : (
                        <code className="small">{r.targetId}</code>
                      )}
                    </td>
                    <td>
                      {Object.keys(r.details).length > 0 && (
                        <code className="micro block max-w-md break-all whitespace-pre-wrap">
                          {JSON.stringify(r.details)}
                        </code>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {nextBefore && (
          <Link
            href={`/admin/audit?${new URLSearchParams({ ...keep, before: String(nextBefore) })}`}
            className="btn btn-sm btn-ghost justify-self-start"
          >
            Older entries
          </Link>
        )}
      </div>
    </Section>
  );
}
