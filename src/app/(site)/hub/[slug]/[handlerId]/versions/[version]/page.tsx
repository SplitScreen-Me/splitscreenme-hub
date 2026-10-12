import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { formatBytes } from '@/components/hub/CommunitySections';
import { gameCrumbs } from '@/components/hub/crumbs';
import { Breadcrumbs, CodeBlock, DateTime, LinkButton, Table, VerifiedBadge } from '@/components/ui';
import { buildMetadata } from '@/lib/seo/metadata';
import { apiBase, apiDownloadUrl, paths } from '@/lib/urls';
import { LEGACY_ID } from '@/server/hub';
import { getHandler, getVersionDetail } from '@/server/public';
import '@/components/hub/hub.css';

type Props = { params: Promise<{ slug: string; handlerId: string; version: string }> };

/** Scripts are up to 2 MiB: the page shows the start, the API serves the whole file. */
const SCRIPT_PREVIEW_CHARS = 100_000;

const parseVersion = (v: string) => (/^[1-9][0-9]{0,6}$/.test(v) ? Number(v) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handlerId, version } = await params;
  const n = parseVersion(version);
  const h = n && LEGACY_ID.test(handlerId) ? await getHandler(handlerId) : null;
  if (!h || !n) return {};
  return buildMetadata({
    title: `${h.gameName} handler v${n}`,
    description: `Version ${n} of the ${h.gameName} split-screen handler “${h.title}”: release notes, files and handler.js.`,
    path: paths.version(h.gameSlug, h.id, n),
    noindex: true,
  });
}

/** One version (noindex): notes, facts, file manifest and the stamped handler.js. */
export default async function VersionPage({ params }: Props) {
  const { slug, handlerId, version } = await params;
  const n = parseVersion(version);
  if (!n || !LEGACY_ID.test(handlerId)) notFound();
  const h = await getHandler(handlerId);
  if (!h) notFound();
  if (h.gameSlug !== slug) permanentRedirect(paths.version(h.gameSlug, h.id, n));
  const v = await getVersionDetail(h.id, n);
  if (!v) notFound();

  const handlerPath = paths.handler(h.gameSlug, h.id, h.isPrimary);
  const crumbs = [
    ...gameCrumbs({ name: h.gameName, slug: h.gameSlug, genres: h.genres }),
    ...(h.isPrimary ? [] : [{ label: h.title, href: handlerPath }]),
    { label: 'Versions', href: paths.versions(h.gameSlug, h.id) },
    { label: `v${n}` },
  ];
  const scriptUrl = `${apiBase()}/handlers/${encodeURIComponent(h.id)}/versions/${n}/script`;
  const truncated = v.script.length > SCRIPT_PREVIEW_CHARS;
  return (
    <>
      <section className="pane hub-section" aria-labelledby="version-title">
        <Breadcrumbs items={crumbs} />
        <p className="hub-eyebrow mt-6">
          {h.gameName} · handler “{h.title}”
        </p>
        <h1 className="h1 m-0" id="version-title">
          Version {n}
          {n === h.version && <span className="faint"> (current)</span>}
        </h1>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <h2 className="h3 mb-2">Release notes</h2>
            <p className="m-0 whitespace-pre-line break-words text-ink-2">
              {v.releaseNotes || 'No release notes.'}
            </p>
          </div>
          <div className="grid min-w-0 content-start gap-4">
            <dl className="hub-facts">
              <div>
                <dt>Released</dt>
                <dd>
                  <DateTime value={v.createdAt} />
                </dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd className="data">{formatBytes(v.sizeBytes)}</dd>
              </div>
              <div>
                <dt>Downloads</dt>
                <dd className="data">{v.downloads.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Check</dt>
                <dd>
                  <VerifiedBadge verified={v.verified} />
                </dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd className="min-w-0 truncate font-mono text-xs" title={v.sha256}>
                  {v.sha256}
                </dd>
              </div>
            </dl>
            <LinkButton href={apiDownloadUrl(h.id, n)} variant="primary" icon="download" rel="nofollow">
              Download v{n} (.nc)
            </LinkButton>
            <Link href={paths.versions(h.gameSlug, h.id)} className="small text-ink-2">
              All versions
            </Link>
          </div>
        </div>
      </section>

      <section className="pane hub-section" aria-labelledby="files-title">
        <h2 className="h3" id="files-title">
          Files <span className="faint data">{v.manifest.length}</span>
        </h2>
        <Table className="hub-manifest">
          <thead>
            <tr>
              <th scope="col">Path</th>
              <th scope="col" className="num">
                Size
              </th>
            </tr>
          </thead>
          <tbody>
            {v.manifest.map((f) => (
              <tr key={f.path}>
                <td>{f.path}</td>
                <td className="num whitespace-nowrap">{formatBytes(f.size)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="pane hub-section" aria-labelledby="script-title">
        <header>
          <h2 className="h3" id="script-title">
            handler.js
          </h2>
          <a href={scriptUrl} rel="nofollow">
            Plain text
          </a>
        </header>
        <CodeBlock
          code={truncated ? `${v.script.slice(0, SCRIPT_PREVIEW_CHARS)}\n…` : v.script}
          label="handler.js"
          className="max-h-[70vh] overflow-auto"
        />
        {truncated && (
          <p className="small faint mt-3 mb-0">
            The script is long: the page shows its start. <a href={scriptUrl}>Open the whole file</a>.
          </p>
        )}
      </section>
    </>
  );
}
