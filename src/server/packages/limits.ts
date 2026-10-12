/**
 * Package rules: docs/ARCHITECTURE.md section 6.3. One place for the numbers, shared by the route, the
 * validator, the dashboard copy and the tests.
 */
const MiB = 1024 * 1024;

export const PACKAGE_LIMITS = {
  /** Upload size: 30 MiB, the Meteor hub's limit. nginx accepts 32 MB on /api/me/ only. */
  maxUploadBytes: 31_457_280,
  maxEntries: 5000,
  maxNameLength: 260,
  /** Sum of the declared uncompressed sizes, and of the real ones while streaming. */
  maxTotalUncompressed: 250 * MiB,
  /** Entries bigger than this may not compress better than `maxRatio`:1. */
  ratioCheckAbove: 1 * MiB,
  maxRatio: 100,
  maxScriptBytes: 2 * MiB,
  /** Rebuild deadline. */
  rebuildTimeoutMs: 120_000,
  /** How long an upload waits for the one before it. */
  queueWaitMs: 30_000,
} as const;

export const RELEASE_NOTES_MIN = 2;
export const RELEASE_NOTES_MAX = 2000;

export type PackageErrorCode =
  | 'too_large'
  | 'not_zip'
  | 'corrupt'
  | 'too_many_entries'
  | 'unsafe_path'
  | 'duplicate'
  | 'symlink'
  | 'encrypted'
  | 'unsupported'
  | 'zip_bomb'
  | 'missing_handler'
  | 'handler_too_large'
  | 'handler_not_utf8'
  | 'handler_missing_game'
  | 'timeout'
  | 'busy';

export class PackageError extends Error {
  constructor(
    readonly code: PackageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PackageError';
  }
}

export const isPackageError = (e: unknown): e is PackageError => e instanceof PackageError;
