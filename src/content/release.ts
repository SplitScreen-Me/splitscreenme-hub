/**
 * The Nucleus Co-op release the site offers for download (landing, /download, JSON-LD). Edited by hand on each
 * release: version, date, file, size and the two URLs. Nothing else in the site hardcodes a version.
 */
export interface Release {
  /** e.g. "2.4.2" */
  version: string;
  /** release date, YYYY-MM-DD */
  date: string;
  /** direct link to the release archive */
  downloadUrl: string;
  /** archive name, shown next to the button */
  fileName: string;
  /** archive size in MB (10^6 bytes), rounded */
  sizeMb: number;
  /** release notes of this version */
  notesUrl: string;
  /** every release, older versions included */
  allReleasesUrl: string;
  /** the next major version when it is in preview, shown as a note; null once it is the release above */
  preview: { version: string; note: string } | null;
}

export const release: Release = {
  version: '2.4.2',
  date: '2026-08-23',
  downloadUrl: 'https://github.com/SplitScreen-Me/splitscreenme-nucleus/releases/download/v2.4.2/NucleusApp.zip',
  fileName: 'NucleusApp.zip',
  sizeMb: 97,
  notesUrl: 'https://github.com/SplitScreen-Me/splitscreenme-nucleus/releases/tag/v2.4.2',
  allReleasesUrl: 'https://github.com/SplitScreen-Me/splitscreenme-nucleus/releases',
  preview: {
    version: '3.0',
    note: 'Nucleus Co-op 3, with the new couch-friendly interface, is in beta. These guides already describe it; the steps are the same in 2.4, the screens look different.',
  },
};

/** "August 2026" */
export function releaseMonth(r: Release = release): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${r.date}T00:00:00Z`),
  );
}
