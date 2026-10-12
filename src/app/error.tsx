'use client';

import { Button, EmptyState, LinkButton } from '@/components/ui';

/** Error boundary of every page below the root layout. No error details are shown (digest only). */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="frame pt-6">
      <section className="pane pad">
        <EmptyState
          icon="warning"
          title="Something went wrong"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon="refresh" onClick={reset}>
                Try again
              </Button>
              <LinkButton href="/">Home</LinkButton>
            </div>
          }
        >
          <p>The error has been logged.{error.digest ? ` Reference: ${error.digest}` : ''}</p>
        </EmptyState>
      </section>
    </div>
  );
}
