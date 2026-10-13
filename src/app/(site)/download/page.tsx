import Link from 'next/link';
import '@/components/landing/landing.css';
import { JsonLd } from '@/components/seo/JsonLd';
import { Breadcrumbs, DateTime, Icon, LinkButton, LogoMark } from '@/components/ui';
import { allReleasesUrl, release, releaseSize, stableRelease } from '@/content/release';
import { softwareJsonLd } from '@/lib/seo/landing';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo/metadata';
import { COMMUNITY, paths } from '@/lib/urls';

const beta = release.channel === 'beta';

export const generateMetadata = () =>
  buildMetadata({
    title: 'Download Nucleus Co-op',
    description: `Download Nucleus Co-op ${release.label} for Windows 10 and 11: free, open source, no installer and no account. Requirements and install steps.`,
    path: paths.download(),
  });

const STEPS = [
  {
    title: 'Pick a new folder',
    body: (
      <>
        Create an empty folder such as <code>C:\NucleusCo-op</code>, or the same at the root of the drive your games
        are on. Not in Program Files, your user folder (<code>C:\Users\…</code>) or OneDrive, and not over an older
        Nucleus Co-op.
      </>
    ),
  },
  {
    title: 'Allow it in your antivirus',
    body: (
      <>
        Add the folder to your antivirus exclusions before extracting: some files that hook into games are often
        flagged by mistake.
      </>
    ),
  },
  {
    title: 'Unzip',
    body: (
      <>
        Right-click the zip, <b>Properties</b>, tick <b>Unblock</b>, then extract it into the folder, ideally with
        7-Zip.
      </>
    ),
  },
  {
    title: 'Play',
    body: (
      <>
        Start <code>NucleusCoop.exe</code>, add your games and hand out the controllers.
      </>
    ),
  },
];

export default function DownloadPage() {
  return (
    <>
      <JsonLd
        data={[
          { '@context': 'https://schema.org', ...softwareJsonLd(release) },
          breadcrumbJsonLd([
            { label: 'Home', href: '/' },
            { label: 'Download', href: paths.download() },
          ]),
        ]}
      />
      <div className="lp-row-end">
        <section className="pane pad" aria-labelledby="dl-page-title">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Download' }]} className="mb-5" />
          <h1 id="dl-page-title" className="display max-w-[14ch]">
            Get Nucleus Co-op
          </h1>
          <p className="lede mt-5">
            One download, no installer, no account. Unzip it, start it, and your PC is a couch co-op console.
          </p>

          <h2 className="h3 mt-10 mb-4">Install in four steps</h2>
          <ol className="lp-dl-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="lp-dl-n" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold text-ink">{s.title}</p>
                  <p className="muted m-0">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6">
            <Link href={paths.doc('getting-started/install')} className="underline underline-offset-4">
              The full install guide
            </Link>{' '}
            <span className="muted">covers SmartScreen, updates and where everything goes.</span>
          </p>

          <h2 className="h3 mt-10 mb-4">Then</h2>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={paths.doc('getting-started/first-session')} icon="play">
              Your first session
            </LinkButton>
            <LinkButton href={paths.hub()} variant="ghost" icon="search">
              Find your games
            </LinkButton>
            <LinkButton href={paths.doc('play/controllers')} variant="ghost" icon="pad">
              Set up controllers
            </LinkButton>
          </div>
        </section>

        <section className="pane pad lp-download" aria-labelledby="dl-title">
          <span className="ver">
            <LogoMark />
            {beta && <span className="lp-beta">Beta</span>}
            <span>
              Released <DateTime value={`${release.date}T00:00:00Z`} />
            </span>
          </span>
          <h2 id="dl-title" className="h1">
            Nucleus <span className="whitespace-nowrap">Co-op {release.label}</span>
          </h2>
          <p className="sub">
            {release.fileName}, {releaseSize()}. Free for Windows 10 and 11, 64-bit, under the GPL-3.0.
          </p>
          <LinkButton href={release.downloadUrl} download size="lg" icon="download" className="btn-dark">
            {beta ? 'Download the beta' : 'Download for Windows'}
          </LinkButton>
          <div className="links">
            {release.notesUrl && (
              <a href={release.notesUrl} rel="noopener">
                Release notes
              </a>
            )}
            {beta && stableRelease.notesUrl && (
              <a href={stableRelease.notesUrl} rel="noopener">
                Stable {stableRelease.label} on GitHub
              </a>
            )}
            <a href={allReleasesUrl} rel="noopener">
              All versions
            </a>
            <a href={COMMUNITY.github} rel="noopener">
              Source code
            </a>
          </div>
          {release.sha256 && (
            <p className="lp-sha">
              SHA-256 <code>{release.sha256}</code>
            </p>
          )}
          {beta && (
            <p className="preview">
              <b>This is a beta</b> of Nucleus Co-op 3, with the new couch-friendly interface. It doesn&apos;t update
              itself: come back here for the next one. A few handlers need tools it doesn&apos;t ship yet; for those,
              use the stable {stableRelease.label}.
            </p>
          )}
          <ul className="lp-reqs">
            <li>
              <Icon name="check" />
              Windows 10 or 11, 64-bit
            </li>
            <li>
              <Icon name="check" />
              .NET Framework 4.7.2, built into Windows 10 (since 1803) and 11
            </li>
            <li>
              <Icon name="check" />
              Microsoft Edge WebView2 Runtime and Visual C++ 2015-2022 (x86 and x64): Nucleus offers what&apos;s
              missing
            </li>
            <li>
              <Icon name="check" />
              The game installed once, from Steam or another store
            </li>
            <li>
              <Icon name="check" />
              One controller, or keyboard and mouse, per player
            </li>
          </ul>
          <p className="lp-dl-foot">
            <Link href={paths.doc('getting-started/system-requirements')}>System requirements</Link>
            <span aria-hidden="true"> · </span>
            Only download from this page or the official GitHub releases.
          </p>
        </section>
      </div>
    </>
  );
}
