import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HandlerTabs } from '@/components/dashboard/HandlerTabs';
import { StateBadge } from '@/components/dashboard/StateBadge';
import { UploadForm } from '@/components/dashboard/UploadForm';
import { DateTime, EmptyState, Section, Table, VerifiedBadge } from '@/components/ui';
import { buttonClass } from '@/components/ui/Button';
import { canPost, requireUser } from '@/lib/auth/current-user';
import { isValidId } from '@/lib/ids';
import { privatePageMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';
import { PACKAGE_LIMITS } from '@/server/packages/limits';
import { getHandlerForEdit } from '@/server/private/dashboard';

export const metadata = privatePageMetadata('Versions');

const size = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(b / 1024))} KiB`;

export default async function VersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; uploaded?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const h = await getHandlerForEdit(user, id);
  if (!h) notFound();
  const sp = await searchParams;
  const nextVersion = Math.max(h.currentVersion, ...h.versions.map((v) => v.version), 0) + 1;

  return (
    <>
      <section className="pane pad grid gap-4">
        <p className="micro faint font-semibold tracking-wide uppercase">
          <Link href={paths.dashboard()} className="underline">
            Dashboard
          </Link>{' '}
          / {h.gameName}
        </p>
        <h1 className="h1">{h.title}</h1>
        <StateBadge state={h.state} withHint />
        <HandlerTabs handlerId={h.id} current="versions" />
        {sp.created && (
          <p role="status" className="small text-ok">
            Handler created. Upload its first version below.
          </p>
        )}
        {sp.uploaded && (
          <p role="status" className="small text-ok">
            Version {Number(sp.uploaded) || ''} uploaded.
          </p>
        )}
        {sp.error && (
          <p role="alert" className="form-error small">
            {sp.error.slice(0, 300)}
          </p>
        )}
      </section>

      <Section title={`Upload version ${nextVersion}`} id="upload">
        {canPost(user) ? (
          <UploadForm handlerId={h.id} nextVersion={nextVersion} maxBytes={PACKAGE_LIMITS.maxUploadBytes} />
        ) : (
          <p className="small">
            Confirm your email address or link a provider on your account page before uploading.
          </p>
        )}
        <p className="small muted mt-4">
          A new version becomes the current one at once and is marked unverified until a moderator checks it.
          Package rules:{' '}
          <Link href={paths.doc('handlers/publish')} className="underline">
            publishing on the hub
          </Link>
          .
        </p>
      </Section>

      <Section title="History" id="history">
        {h.versions.length === 0 ? (
          <EmptyState icon="update" title="No version yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Released</th>
                <th scope="col">Notes</th>
                <th scope="col">State</th>
                <th scope="col" className="num">
                  Size
                </th>
                <th scope="col" className="num">
                  Downloads
                </th>
                <th scope="col">
                  <span className="sr-only">Download</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {h.versions.map((v) => (
                <tr key={v.id}>
                  <td className="font-semibold text-ink">
                    v{v.version}
                    {v.id === h.currentVersionId && <span className="micro faint"> · current</span>}
                  </td>
                  <td>
                    <DateTime value={v.createdAt} />
                  </td>
                  <td className="max-w-md">
                    <p className="small line-clamp-3 whitespace-pre-line">{v.releaseNotes || '—'}</p>
                  </td>
                  <td>
                    <VerifiedBadge verified={!!v.verifiedAt} />
                  </td>
                  <td className="num">{size(v.sizeBytes)}</td>
                  <td className="num">{v.downloadCount.toLocaleString('en')}</td>
                  <td>
                    <a
                      href={`/api/me/handlers/${h.id}/versions/${v.version}/download`}
                      className={buttonClass({ size: 'sm', variant: 'ghost' })}
                      download
                      title={`sha256 ${v.sha256}`}
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
