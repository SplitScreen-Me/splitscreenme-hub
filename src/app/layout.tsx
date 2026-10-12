import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { env } from '@/lib/env';
import { getNonce } from '@/lib/nonce';
import { SITE_NAME } from '@/lib/seo/metadata';
import '@/styles/globals.css';

// Self-hosted at build by next/font: Archivo with its width axis (the hierarchy), JetBrains Mono for code.
const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const viewport: Viewport = { themeColor: '#000000', colorScheme: 'dark' };

/** Runtime values (SITE_URL, NOINDEX): metadata is generated per request, never frozen at build. */
export async function generateMetadata(): Promise<Metadata> {
  const { SITE_URL, NOINDEX } = env();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${SITE_NAME}: split-screen for PC games`, template: `%s | ${SITE_NAME}` },
    description:
      'Play PC games in split screen on one computer with Nucleus Co-op: free, open source, and 600+ games ready to play.',
    applicationName: SITE_NAME,
    robots: NOINDEX ? { index: false, follow: false } : undefined,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the request makes every page dynamic, so Next puts the per-request CSP nonce on its scripts.
  await getNonce();
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
