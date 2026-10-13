import { type Release, releaseSize } from '@/content/release';
import { COMMUNITY, absoluteUrl } from '../urls';
import { SITE_NAME } from './metadata';

/**
 * Structured data of the landing (docs/ARCHITECTURE.md 7): Organization, WebSite with a SearchAction on the hub,
 * and SoftwareApplication for Nucleus Co-op.
 */
export function landingJsonLd(release: Release) {
  const home = absoluteUrl('/');
  const org = `${home}#org`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: SITE_NAME,
        url: home,
        logo: absoluteUrl('/icon.svg'),
        sameAs: [
          'https://github.com/SplitScreen-Me',
          COMMUNITY.discord,
          COMMUNITY.reddit,
          COMMUNITY.steamCurator,
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        name: SITE_NAME,
        url: home,
        publisher: { '@id': org },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl('/hub')}?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      softwareJsonLd(release, org),
    ],
  };
}

/** Nucleus Co-op as a SoftwareApplication (landing and download page). */
export function softwareJsonLd(release: Release, publisherId = `${absoluteUrl('/')}#org`) {
  return {
    '@type': 'SoftwareApplication',
    name: 'Nucleus Co-op',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Windows 10, Windows 11',
    softwareVersion: release.version,
    datePublished: release.date,
    license: 'https://www.gnu.org/licenses/gpl-3.0.html',
    // Hosted builds are site paths; structured data wants absolute URLs.
    downloadUrl: release.downloadUrl.startsWith('/') ? absoluteUrl(release.downloadUrl) : release.downloadUrl,
    fileSize: releaseSize(release),
    ...(release.notesUrl && { releaseNotes: release.notesUrl }),
    isAccessibleForFree: true,
    publisher: { '@id': publisherId },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}
