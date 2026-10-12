import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { formatBytes } from '@/components/hub/CommunitySections';
import { gameCrumbs } from '@/components/hub/crumbs';
import { Breadcrumbs, DateTime, Table, VerifiedBadge } from '@/components/ui';
import { buildMetadata } from '@/lib/seo/metadata';
import { apiDownloadUrl, paths } from '@/lib/urls';
import { LEGACY_ID } from '@/server/hub';
import { getHandler, getVersions } from '@/server/public';
import '@/components/hub/hub.css';

type Props = { params: Promise<{ slug: string; handlerId: string }> };

async function load(slug: string, handlerId: string) {
  if (!LEGACY_ID.test(handlerId)) notFound();
  const h = await getHandler(handlerId);
  if (!h) notFound();
  if (h.gameSlug !== slug) permanentRedirect(paths.versions(h.gameSlug, h.id));
  return h;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handlerId } = await params;
  const h = LEGACY_ID.test(handlerId) ? await getHandler(handlerId) : null;
  if (!h) return {};
  return buildMetadata({
    title: `${h.gameName} handler versions`,
    description: `Every version of the ${h.gameName} split-screen handler “${h.title}”: release notes, files and downloads.`,
    path: paths.versions(h.gameSlug, h.id),
    noindex: true,
  });
}

/** Version history of a listed handler (noindex): notes, size, check state, downloads, per-version files. */
export default async function VersionsPage({ params }: Props) {
  const { slug, handlerId } = await params;
  const h = await load(slug, handlerId);
  const versions = (await getVersions(h.id)) ?? notFound();
  const handlerPath = paths.handler(h.gameSlug, h.id, h.isPrimary);
  const crumbs = [
    ...gameCrumbs({ name: h.gameName, slug: h.gameSlug, genres: h.genres }),
    ...(h.isPrimary ? [] : [{ label: h.title, href: handlerPath }]),
    { label: 'Versions' },
  ];
  return (
    <section className="pane hub-section" aria-labelledby="versions-title">
      <Breadcrumbs items={crumbs} />
      <p className="hub-eyebrow mt-6">{h.gameName} · handler</p>
      <h1 className="h1 m-0" id="versions-title">
        {h.title}: versions
      </h1>
      <p className="lede mt-3">
        By{' '}
        {h.authorId ? (
          <Link href={paths.author(h.authorName)} className="text-ink underline underline-offset-2">
            {h.authorName}
          </Link>
        ) : (
          h.authorName
        )}
        . Nucleus Co-op installs the current version; older ones stay here for reference.{' '}
        <Link href={handlerPath} className="text-ink underline underline-offset-2">
          Back to the {h.isPrimary ? 'game' : 'handler'} page
        </Link>
      </p>
      <Table className="mt-6">
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">Released</th>
            <th scope="col">Notes</th>
            <th scope="col" className="num">
              Size
            </th>
            <th scope="col" className="num">
              Downloads
            </th>
            <th scope="col">Check</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id}>
              <td className="data font-bold">
                <Link href={paths.version(h.gameSlug, h.id, v.version)}>v{v.version}</Link>
                {v.version === h.version && <span className="micro faint block">Current</span>}
              </td>
              <td className="whitespace-nowrap">
                <DateTime value={v.createdAt} />
              </td>
              <td className="max-w-[48ch] whitespace-pre-line break-words">{v.releaseNotes || '—'}</td>
              <td className="num whitespace-nowrap">{formatBytes(v.sizeBytes)}</td>
              <td className="num">{v.downloads.toLocaleString('en-US')}</td>
              <td>
                <VerifiedBadge verified={v.verified} />
              </td>
              <td className="whitespace-nowrap">
                <a href={apiDownloadUrl(h.id, v.version)} rel="nofollow">
                  Download
                </a>
                {' · '}
                <Link href={paths.version(h.gameSlug, h.id, v.version)}>Files</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}
