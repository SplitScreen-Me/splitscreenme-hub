import type { ReactNode } from 'react';
import { BetaBanner } from '@/components/layout/BetaBanner';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

/** Public layout: the black bezel frame, header on the bezel, panes split by the gutter, footer pane. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <BetaBanner />
      <div className="frame">
        <SiteHeader />
        <main id="main" className="split">
          {children}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
