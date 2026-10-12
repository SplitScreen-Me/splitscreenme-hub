import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StateBadge } from '@/components/dashboard/StateBadge';
import { ActionForm, TextField } from '@/components/interactive/ActionForm';
import {
  Badge,
  CodeBlock,
  DateTime,
  Dialog,
  SafeMarkdown,
  Section,
  Table,
  VerifiedBadge,
} from '@/components/ui';
import { buttonClass } from '@/components/ui/Button';
import { requireRole } from '@/lib/auth/current-user';
import { can } from '@/lib/auth/permissions';
import { isValidId } from '@/lib/ids';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import {
  approveHandlerAction,
  deleteHandlerAdminAction,
  deleteVersionAction,
  restoreHandlerAction,
  transferHandlerAction,
  verifyVersionAction,
} from '@/server/actions/admin';
import { RISKY_EXTENSIONS } from '@/server/packages/upload';
import { getHandlerForReview, getVersionInspection } from '@/server/private/admin';

export const metadata = privatePageMetadata('Handler review · Backoffice');

const size = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(b / 1024))} KiB`;

export default async function AdminHandler({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const user = await requireRole('moderator');
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const h = await getHandlerForReview(id);
  if (!h) notFound();
  const sp = await searchParams;
  const inspectN = Number(sp.v ?? h.currentVersion);
  const inspected =
    Number.isSafeInteger(inspectN) && inspectN > 0 ? await getVersionInspection(h.id, inspectN) : null;
  const risky = inspected?.manifest.filter((m) => RISKY_EXTENSIONS.test(m.path)) ?? [];

  return (
    <>
      <section className="pane pad grid gap-4">
        <p className="micro faint">
          <Link href="/admin/handlers" className="underline">
            Handlers
          </Link>{' '}
          / {h.gameName}
        </p>
        <div className="pane-head">
          <h1 className="h1">{h.title}</h1>
          <div className="flex flex-wrap gap-2">
            {h.state === 'listed' && (
              <Link
                href={paths.handler(h.gameSlug, h.id)}
                className={buttonClass({ size: 'sm', variant: 'ghost' })}
              >
                On the hub
              </Link>
            )}
            <Link
              href={paths.dashboardHandler(h.id)}
              className={buttonClass({ size: 'sm', variant: 'ghost' })}
            >
              Edit as owner
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={h.state} />
          {h.openReportCount > 0 && (
            <Link href="/admin/reports">
              <Badge tone="danger" icon="warning">
                {h.openReportCount} open report{h.openReportCount > 1 ? 's' : ''}
              </Badge>
            </Link>
          )}
          <span className="small muted">
            by{' '}
            <Link href={`/admin/users/${h.ownerId}`} className="underline">
              {h.ownerName}
            </Link>
            {h.ownerTrusted && ' (trusted)'}
            {h.ownerBannedAt && ' (banned)'} · created <DateTime value={h.createdAt} /> ·{' '}
            {h.downloadCount.toLocaleString('en')} downloads
          </span>
        </div>
        <p className="small muted">
          {h.approvedAt ? (
            <>
              Approved <DateTime value={h.approvedAt} />
              {h.approvedBy ? ` by ${h.approvedBy}` : ''}.
            </>
          ) : (
            'Not approved: never listed, whatever the owner chooses.'
          )}{' '}
          {h.isPublic ? 'The owner made it public.' : 'The owner keeps it private.'}
        </p>
      </section>

      <Section title="Moderation" id="moderation">
        <div className="grid gap-6 md:grid-cols-2">
          {!h.deletedAt &&
            (h.approvedAt ? (
              <ActionForm
                action={approveHandlerAction.bind(null, h.id, false)}
                submitLabel="Revoke approval"
                submitVariant="danger"
              >
                <TextField name="reason" label="Reason (audit log)" maxLength={1000} />
              </ActionForm>
            ) : (
              <ActionForm
                action={approveHandlerAction.bind(null, h.id, true)}
                submitLabel="Approve"
                submitIcon="check"
              />
            ))}
          {h.deletedAt ? (
            can(user, 'handler.restore') ? (
              <ActionForm
                action={restoreHandlerAction.bind(null, h.id)}
                submitLabel="Restore handler"
                submitVariant="default"
              />
            ) : (
              <p className="small muted">
                Deleted <DateTime value={h.deletedAt} />. Only an admin can restore it.
              </p>
            )
          ) : (
            <div>
              <Dialog triggerLabel="Delete handler" triggerVariant="danger" title="Delete this handler?">
                <ActionForm
                  action={deleteHandlerAdminAction.bind(null, h.id)}
                  submitLabel="Delete"
                  submitVariant="danger"
                >
                  <TextField name="reason" label="Reason (audit log)" maxLength={1000} required />
                </ActionForm>
              </Dialog>
            </div>
          )}
          {can(user, 'handler.transfer') && (
            <ActionForm
              action={transferHandlerAction.bind(null, h.id)}
              submitLabel="Transfer ownership"
              submitVariant="default"
              confirm="Transfer this handler to another user?"
            >
              <TextField name="username" label="New owner (username)" required maxLength={20} />
            </ActionForm>
          )}
        </div>
      </Section>

      <Section title="Versions" id="versions">
        <Table>
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Uploaded</th>
              <th scope="col">Files</th>
              <th scope="col">State</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {h.versions.map((v) => (
              <tr key={v.id} className={v.deletedAt ? 'opacity-60' : undefined}>
                <td className="font-semibold text-ink">
                  <Link href={`/admin/handlers/${h.id}?v=${v.version}#inspect`} className="underline">
                    v{v.version}
                  </Link>
                  {v.id === h.currentVersionId && <span className="micro faint"> · current</span>}
                  {v.deletedAt && <span className="micro faint"> · deleted</span>}
                </td>
                <td>
                  <DateTime value={v.createdAt} /> <span className="micro faint">{v.uploaderName ?? ''}</span>
                </td>
                <td>
                  {v.fileCount} · {size(v.sizeBytes)}
                </td>
                <td>
                  <VerifiedBadge verified={!!v.verifiedAt} />
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {!v.deletedAt && (
                      <ActionForm
                        action={verifyVersionAction.bind(null, v.id, !v.verifiedAt)}
                        inline
                        submitLabel={v.verifiedAt ? 'Unverify' : 'Verify'}
                        submitVariant={v.verifiedAt ? 'ghost' : 'primary'}
                        submitSize="sm"
                        confirm={
                          v.verifiedAt ? undefined : 'You checked the script and the files of this version?'
                        }
                      />
                    )}
                    <a
                      href={`/api/me/handlers/${h.id}/versions/${v.version}/download`}
                      className={buttonClass({ size: 'sm', variant: 'ghost' })}
                      download
                    >
                      Download
                    </a>
                    {!v.deletedAt && (
                      <Dialog triggerLabel="Delete" triggerVariant="ghost" title={`Delete v${v.version}?`}>
                        <ActionForm
                          action={deleteVersionAction.bind(null, v.id)}
                          submitLabel="Delete version"
                          submitVariant="danger"
                        >
                          <p className="small muted">
                            If it is the current version, the newest remaining one becomes current (or the
                            handler goes back to draft).
                          </p>
                          <TextField name="reason" label="Reason (audit log)" maxLength={1000} required />
                        </ActionForm>
                      </Dialog>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      {inspected && (
        <Section title={`Inspect v${inspected.version}`} id="inspect">
          <div className="grid gap-4">
            <p className="small muted">
              sha256 <code className="break-all">{inspected.sha256}</code> · {size(inspected.sizeBytes)} ·{' '}
              {inspected.manifest.length} files
            </p>
            {risky.length > 0 && (
              <p className="small" role="note">
                <Badge tone="warn" icon="warning">
                  {risky.length} executable or script file{risky.length > 1 ? 's' : ''}
                </Badge>{' '}
                Look at these before verifying.
              </p>
            )}
            <details>
              <summary className="cursor-pointer small">File manifest</summary>
              <div className="table-wrap mt-2 max-h-80 overflow-auto">
                <table className="table">
                  <tbody>
                    {inspected.manifest.map((m) => (
                      <tr key={m.path}>
                        <td className={RISKY_EXTENSIONS.test(m.path) ? 'text-warn font-semibold' : undefined}>
                          <code className="break-all">{m.path}</code>
                        </td>
                        <td className="num">{size(m.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details open>
              <summary className="cursor-pointer small">handler.js (stamped)</summary>
              <CodeBlock
                code={inspected.script}
                label="handler.js"
                className="mt-2 max-h-[32rem] overflow-auto"
              />
            </details>
          </div>
        </Section>
      )}

      <Section title="Description" id="description">
        {h.description.trim() ? (
          <SafeMarkdown source={h.description} />
        ) : (
          <p className="small muted">No description.</p>
        )}
      </Section>
    </>
  );
}
