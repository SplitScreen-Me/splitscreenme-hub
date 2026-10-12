import type { ReactNode } from 'react';
import { BetaBanner } from '@/components/layout/BetaBanner';
import { Logo } from '@/components/ui';

/** Minimal centred layout for login, register and token pages. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BetaBanner />
      <div className="mx-auto grid min-h-screen w-full max-w-md content-center gap-6 px-4 py-10">
        <div className="flex justify-center">
          <Logo variant="color" />
        </div>
        <main id="main" className="pane pad">
          {children}
        </main>
      </div>
    </>
  );
}
