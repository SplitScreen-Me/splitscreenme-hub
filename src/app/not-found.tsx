import type { Metadata } from 'next';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Field, LinkButton, PlayerTag } from '@/components/ui';
import { paths } from '@/lib/urls';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: true } };

/**
 * 404 for every unknown URL (the docs have their own, in src/app/(site)/doc/not-found.tsx). The art is a split
 * screen where player 2's pane has lost its signal.
 */
export default function NotFound() {
  return (
    <div className="frame">
      <SiteHeader />
      <main id="main" className="split">
        <section className="pane pad grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div>
            <p className="micro faint mb-4 font-semibold tracking-wide uppercase">Error 404</p>
            <h1 className="display max-w-[12ch]">This screen has no signal</h1>
            <p className="lede mt-5">
              The page you&apos;re looking for doesn&apos;t exist, moved with the new site, or isn&apos;t public. Old
              hub and docs links usually still lead somewhere: try a search.
            </p>
            <form action={paths.hub()} method="get" role="search" className="mt-6 max-w-md">
              <Field icon="search" type="search" name="q" placeholder="Search games" aria-label="Search games" />
            </form>
            <div className="mt-6 flex flex-wrap gap-2">
              <LinkButton href={paths.hub()} variant="primary" icon="search">
                Browse games
              </LinkButton>
              <LinkButton href={paths.doc()} icon="book">
                Docs
              </LinkButton>
              <LinkButton href="/" variant="ghost">
                Home
              </LinkButton>
            </div>
          </div>
          <div aria-hidden="true" className="grid aspect-[16/10] grid-cols-2 gap-[var(--gutter)] rounded-[var(--r-pane)] bg-bezel p-[var(--gutter)]">
            <div className="relative rounded-[10px] bg-pane-3 shadow-[inset_0_0_0_2px_var(--p1)]">
              <PlayerTag player={1} className="absolute top-3 left-3" />
            </div>
            <div className="relative grid place-items-center rounded-[10px] shadow-[inset_0_0_0_1.5px_var(--line-strong)]">
              <PlayerTag player={2} outline className="absolute top-3 left-3" />
              <span className="micro faint font-semibold tracking-wide uppercase">No signal</span>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
