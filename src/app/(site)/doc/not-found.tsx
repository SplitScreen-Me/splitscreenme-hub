import { DocsShell } from '@/components/docs/DocsShell';
import { Card, CardGrid } from '@/components/docs/mdx';
import { paths } from '@/lib/urls';

/** Unknown docs path: stay in the docs, with search and the main entry points. */
export default function DocNotFound() {
  return (
    <DocsShell currentTitle="Page not found">
      <article className="pane doc-article">
        <header className="doc-head">
          <p className="micro faint mb-3 font-semibold tracking-wide uppercase">404 · Docs</p>
          <h1 className="h1 doc-title">This page left the session</h1>
          <p className="lede doc-lede">
            The docs moved to new addresses with the new site. Search for what you need, or start from one of
            these.
          </p>
        </header>
        <CardGrid>
          <Card href={paths.doc('getting-started')} title="Getting started" icon="play">
            Download, install and play your first game.
          </Card>
          <Card href={paths.doc('troubleshooting')} title="Troubleshooting" icon="warning">
            Fixes for the app, handlers, controllers and performance.
          </Card>
          <Card href={paths.doc('faq')} title="FAQ" icon="info">
            Short answers to the questions people ask first.
          </Card>
          <Card href={paths.doc('handlers/create')} title="Write a handler" icon="code">
            Add a game to Nucleus Co-op yourself.
          </Card>
        </CardGrid>
      </article>
    </DocsShell>
  );
}
