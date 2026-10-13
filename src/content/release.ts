/**
 * The Nucleus Co-op builds the site offers (landing, /download, JSON-LD). Nothing else in the site hardcodes a
 * version.
 *
 * To publish a new build, change only the `hosted(...)` call of `release` below: docs/DEPLOY.md, "Publish a new app
 * build", copies the zip to the server first. Hosted builds are static files served by nginx under
 * RELEASES_PATH (deploy/nginx/v3.splitscreen.me.conf).
 */
export interface Release {
  /** Full version, as in the file name: "3.0.0-beta-5", "2.4.2" */
  version: string;
  /** What people read: "3.0 beta 5", "2.4.2" */
  label: string;
  /** "beta" adds the beta badge and the beta notes of the download page */
  channel: 'stable' | 'beta';
  /** Release date, YYYY-MM-DD */
  date: string;
  /** Direct link to the archive: a path on this site (hosted builds) or an https URL */
  downloadUrl: string;
  /** Archive name, shown next to the button */
  fileName: string;
  /** Exact archive size in bytes */
  sizeBytes: number;
  /** SHA-256 of the archive, lowercase hex; null when we only link to it */
  sha256: string | null;
  /** Release notes, when there are public ones */
  notesUrl: string | null;
}

/** Where nginx serves hosted builds from (/srv/ssm-v3/releases on the server). */
export const RELEASES_PATH = '/releases/';

/** A build hosted on this site, named NucleusCoop-<version>.zip. */
function hosted(r: Pick<Release, 'version' | 'label' | 'channel' | 'date' | 'sizeBytes' | 'sha256'>): Release {
  const fileName = `NucleusCoop-${r.version}.zip`;
  return { ...r, fileName, downloadUrl: `${RELEASES_PATH}${fileName}`, notesUrl: null };
}

/** The build behind every "Download" button. */
export const release: Release = hosted({
  version: '3.0.0-beta-5',
  label: '3.0 beta 5',
  channel: 'beta',
  date: '2026-10-13',
  sizeBytes: 43_498_485,
  sha256: 'e57574b36a92df541acd82f04db483149a2af4746a809a50ba85d90f972999bc',
});

/** The last stable release, offered as a secondary link while `release` is a beta. */
export const stableRelease: Release = {
  version: '2.4.2',
  label: '2.4.2',
  channel: 'stable',
  date: '2026-08-23',
  downloadUrl: 'https://github.com/SplitScreen-Me/splitscreenme-nucleus/releases/download/v2.4.2/NucleusApp.zip',
  fileName: 'NucleusApp.zip',
  sizeBytes: 97_396_862,
  sha256: null,
  notesUrl: 'https://github.com/SplitScreen-Me/splitscreenme-nucleus/releases/tag/v2.4.2',
};

/** Every release, older versions included. */
export const allReleasesUrl = 'https://github.com/SplitScreen-Me/splitscreenme-nucleus/releases';

/** "43 MB" (10^6 bytes, rounded) */
export function releaseSize(r: Release = release): string {
  return `${Math.max(1, Math.round(r.sizeBytes / 1e6))} MB`;
}

/** "October 2026" */
export function releaseMonth(r: Release = release): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${r.date}T00:00:00Z`),
  );
}
