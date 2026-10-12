/**
 * Old Docusaurus paths (www.splitscreen.me/docs/*, /blog/*) to the new docs, as static permanent redirects in
 * next.config.ts (docs/ARCHITECTURE.md 8.2). Anchors survive: browsers keep the #fragment across a redirect,
 * and the pages keep the old anchor ids that the app links to (FAQ 7).
 */
export interface LegacyRedirect {
  source: string;
  destination: string;
}

const DOCS: Record<string, string> = {
  installation: 'getting-started/install',
  usage: 'getting-started/first-session',
  faq: 'faq',
  proto: 'handlers/proto-input',
  protoinput: 'handlers/proto-input',
  games: 'play/supported-games',
  handlers: 'handlers',
  'create-handlers': 'handlers/create',
  'kbm-setup': 'handlers/keyboard-and-mouse',
  'handler-api': 'handlers/api',
  'what-is-splitscreen-me': 'about',
  history: 'about/history',
  'doesnt-launch': 'troubleshooting/app-does-not-start',
  'bug-report-reddit': 'troubleshooting/report-a-bug',
  xboxone: 'play/controllers',
};

export const legacyRedirects: LegacyRedirect[] = [
  { source: '/docs', destination: '/doc' },
  ...Object.entries(DOCS).map(([from, to]) => ({ source: `/docs/${from}`, destination: `/doc/${to}` })),
  // Any other old docs path lands on the docs home rather than a 404.
  { source: '/docs/:path*', destination: '/doc' },
  { source: '/blog', destination: '/doc/getting-started' },
  { source: '/blog/:path*', destination: '/doc/getting-started' },
];
