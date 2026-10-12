import type { ReactNode } from 'react';
import { EmptyState, LinkButton } from '@/components/ui';

/**
 * Placeholder for a route that exists (so the nav never 404s) but whose page is not built yet.
 * `owner` is the work-breakdown letter of docs/ARCHITECTURE.md section 10.
 */
export function StubPage({
  title,
  owner,
  children,
}: {
  title: string;
  owner: 'a' | 'b' | 'c' | 'd';
  children?: ReactNode;
}) {
  return (
    <section className="pane pad min-h-[50vh]" data-stub={owner}>
      <h1 className="h1">{title}</h1>
      <EmptyState
        icon="clock"
        title="This page is being built"
        action={<LinkButton href="/">Back home</LinkButton>}
      >
        {children ?? <p>It will be part of the new SplitScreen.Me very soon.</p>}
      </EmptyState>
    </section>
  );
}
