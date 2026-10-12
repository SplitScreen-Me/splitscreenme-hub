import 'server-only';
import type { ComponentType, ReactNode } from 'react';
import { docPages, docsNav, findDocPage, type DocPage } from '@/content/docs/nav';
import { paths } from '@/lib/urls';
import { walkDoc, walkerComponents, type DocTree } from './doc-tree';
import type { SearchIndex } from './search';

/** What every docs MDX file exports. */
export interface DocMeta {
  title: string;
  description: string;
  /** YYYY-MM-DD */
  updated: string;
}

interface DocModule {
  default: ComponentType<{ components?: Record<string, unknown> }>;
  meta?: Partial<DocMeta>;
}

export interface LoadedDoc {
  page: DocPage;
  section: string;
  meta: DocMeta;
  Content: ComponentType;
  tree: DocTree;
}

const sectionOf = new Map(docsNav.flatMap((s) => s.pages.map((p) => [p.slug, s.title] as const)));

// MDX is compiled at build time; a module never changes while the process runs, so its tree is memoised.
const trees = new Map<string, DocTree>();

async function importDoc(file: string): Promise<DocModule> {
  return (await import(`@/content/docs/${file}.mdx`)) as DocModule;
}

function treeOf(file: string, mod: DocModule): DocTree {
  let tree = trees.get(file);
  if (!tree) {
    const render = mod.default as unknown as (props: { components: Record<string, unknown> }) => ReactNode;
    tree = walkDoc(render({ components: walkerComponents }));
    trees.set(file, tree);
  }
  return tree;
}

export async function loadDoc(slug: string): Promise<LoadedDoc | null> {
  const page = findDocPage(slug);
  if (!page) return null;
  const mod = await importDoc(page.file);
  return {
    page,
    section: sectionOf.get(page.slug) ?? 'Docs',
    meta: {
      title: mod.meta?.title ?? page.title,
      description: mod.meta?.description ?? '',
      updated: mod.meta?.updated ?? '',
    },
    Content: mod.default as ComponentType,
    tree: treeOf(page.file, mod),
  };
}

/** Previous and next pages in nav order. */
export function neighbours(slug: string): { prev?: DocPage; next?: DocPage } {
  const i = docPages.findIndex((p) => p.slug === slug);
  if (i < 0) return {};
  return { prev: docPages[i - 1], next: docPages[i + 1] };
}

let indexPromise: Promise<SearchIndex> | null = null;

/** The search index of every docs page (built once per process). */
export function getSearchIndex(): Promise<SearchIndex> {
  indexPromise ??= (async () => {
    const index: SearchIndex = { v: 1, pages: [], entries: [] };
    for (const page of docPages) {
      const mod = await importDoc(page.file);
      const p = index.pages.length;
      index.pages.push({
        href: paths.doc(page.slug),
        title: mod.meta?.title ?? page.title,
        section: sectionOf.get(page.slug) ?? 'Docs',
      });
      const tree = treeOf(page.file, mod);
      for (const s of tree.sections) {
        // The page description makes a good text for the top-of-page entry.
        const t = s.id === '' ? `${mod.meta?.description ?? ''} ${s.text}`.trim() : s.text;
        index.entries.push({ p, id: s.id, h: s.heading, t });
      }
      if (!tree.sections.some((s) => s.id === '')) {
        index.entries.push({ p, id: '', h: '', t: mod.meta?.description ?? '' });
      }
    }
    return index;
  })().catch((err: unknown) => {
    indexPromise = null;
    throw err;
  });
  return indexPromise;
}
