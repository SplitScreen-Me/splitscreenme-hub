/**
 * Runs once when the server starts. In the Node.js runtime, console errors are sanitised first (Next.js
 * prints uncaught action and route errors, whose database parameters are user data: section 6.7).
 * Background jobs only in the Node.js runtime of a running server: not during `next build`, not in the
 * Edge runtime, and not when DISABLE_JOBS=1 (tests, tooling).
 *
 * The runtime test wraps the import (no early return): Next also compiles this file for the Edge runtime,
 * where NEXT_RUNTIME is inlined, and webpack only drops the Node-only import when its `if` is constant false.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { scrubConsoleErrors } = await import('./lib/log');
    scrubConsoleErrors();
    if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.DISABLE_JOBS === '1') return;
    const { startJobs } = await import('./server/jobs');
    startJobs();
  }
}
