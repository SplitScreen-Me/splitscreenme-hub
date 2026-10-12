/**
 * The documentation tree: drives the sidebar, prev/next, breadcrumbs and the sitemap.
 * `slug` is the URL under /doc ('' = /doc), `file` the MDX file under src/content/docs (without .mdx).
 * A test checks that every entry has a file and every file has an entry.
 */
export interface DocPage {
  slug: string;
  file: string;
  title: string;
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export const docsNav: DocSection[] = [
  {
    title: 'Overview',
    pages: [{ slug: '', file: 'index', title: 'Documentation' }],
  },
  {
    title: 'Getting started',
    pages: [
      { slug: 'getting-started', file: 'getting-started/index', title: 'Getting started' },
      { slug: 'getting-started/install', file: 'getting-started/install', title: 'Install Nucleus Co-op' },
      {
        slug: 'getting-started/first-session',
        file: 'getting-started/first-session',
        title: 'Your first session',
      },
      {
        slug: 'getting-started/system-requirements',
        file: 'getting-started/system-requirements',
        title: 'System requirements',
      },
    ],
  },
  {
    title: 'Play',
    pages: [
      { slug: 'play/controllers', file: 'play/controllers', title: 'Controllers' },
      { slug: 'play/keyboard-and-mouse', file: 'play/keyboard-and-mouse', title: 'Keyboards and mice' },
      { slug: 'play/layouts-and-screens', file: 'play/layouts-and-screens', title: 'Layouts and screens' },
      { slug: 'play/saves-and-profiles', file: 'play/saves-and-profiles', title: 'Saves and profiles' },
      { slug: 'play/supported-games', file: 'play/supported-games', title: 'Supported games' },
    ],
  },
  {
    title: 'Troubleshooting',
    pages: [
      { slug: 'troubleshooting', file: 'troubleshooting/index', title: 'Troubleshooting' },
      {
        slug: 'troubleshooting/app-does-not-start',
        file: 'troubleshooting/app-does-not-start',
        title: 'The app does not start',
      },
      {
        slug: 'troubleshooting/handler-does-not-work',
        file: 'troubleshooting/handler-does-not-work',
        title: 'A handler does not work',
      },
      {
        slug: 'troubleshooting/controllers',
        file: 'troubleshooting/controllers',
        title: 'Controller problems',
      },
      { slug: 'troubleshooting/performance', file: 'troubleshooting/performance', title: 'Performance' },
      { slug: 'troubleshooting/report-a-bug', file: 'troubleshooting/report-a-bug', title: 'Report a bug' },
      { slug: 'faq', file: 'faq', title: 'FAQ' },
    ],
  },
  {
    title: 'Handlers',
    pages: [
      { slug: 'handlers', file: 'handlers/index', title: 'What handlers are' },
      { slug: 'handlers/create', file: 'handlers/create', title: 'Write a handler' },
      { slug: 'handlers/publish', file: 'handlers/publish', title: 'Publish on the hub' },
      {
        slug: 'handlers/keyboard-and-mouse',
        file: 'handlers/keyboard-and-mouse',
        title: 'Keyboard and mouse support',
      },
      { slug: 'handlers/proto-input', file: 'handlers/proto-input', title: 'Proto Input' },
      { slug: 'handlers/api', file: 'handlers/api', title: 'Handler API reference' },
    ],
  },
  {
    title: 'API',
    pages: [{ slug: 'api', file: 'api/index', title: 'Hub API v3' }],
  },
  {
    title: 'About',
    pages: [
      { slug: 'about', file: 'about/index', title: 'About SplitScreen.Me' },
      { slug: 'about/history', file: 'about/history', title: 'History' },
    ],
  },
];

export const docPages: DocPage[] = docsNav.flatMap((s) => s.pages);

export const findDocPage = (slug: string) => docPages.find((p) => p.slug === slug);
