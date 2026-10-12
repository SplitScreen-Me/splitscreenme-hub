import Link from 'next/link';
import { Logo } from '@/components/ui';
import { COMMUNITY, paths } from '@/lib/urls';

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Play',
    links: [
      { href: paths.download(), label: 'Download Nucleus Co-op' },
      { href: paths.hub(), label: 'Browse games' },
      { href: COMMUNITY.githubReleases, label: 'Release notes' },
      { href: paths.doc('getting-started/system-requirements'), label: 'System requirements' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { href: paths.doc('getting-started'), label: 'Getting started' },
      { href: paths.doc('troubleshooting'), label: 'Troubleshooting' },
      { href: paths.doc('handlers/create'), label: 'Write a handler' },
      { href: paths.doc('faq'), label: 'FAQ' },
      { href: paths.doc('api'), label: 'API' },
    ],
  },
  {
    title: 'Community',
    links: [
      { href: COMMUNITY.discord, label: 'Discord' },
      { href: COMMUNITY.reddit, label: 'Reddit' },
      { href: COMMUNITY.github, label: 'GitHub' },
      { href: COMMUNITY.steamCurator, label: 'Steam curator' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: paths.legal('privacy'), label: 'Privacy' },
      { href: paths.legal('terms'), label: 'Terms' },
      { href: paths.legal('notice'), label: 'Legal notice' },
    ],
  },
];

function FooterLink({ href, label }: { href: string; label: string }) {
  return /^https?:\/\//.test(href) ? (
    <a href={href} rel="noopener noreferrer">
      {label}
    </a>
  ) : (
    <Link href={href}>{label}</Link>
  );
}

/** Footer: the last pane. */
export function SiteFooter() {
  return (
    <footer className="pane site-foot">
      <div className="cols">
        <div>
          <Logo />
          <p className="about">
            Free, open-source split-screen for PC games. Made by players, for couches everywhere.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h2>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.label}>
                  <FooterLink {...l} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="legal">
        <span>
          SplitScreen.Me is a community project, not affiliated with any game publisher. Game names and art
          belong to their owners.
        </span>
        <span>
          <a href="https://www.gnu.org/licenses/gpl-3.0.html" rel="noopener noreferrer">
            GPL-3.0
          </a>
        </span>
      </div>
    </footer>
  );
}
