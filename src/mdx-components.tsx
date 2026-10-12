import type { MDXComponents } from 'mdx/types';
import {
  Callout,
  Card,
  CardGrid,
  DocImage,
  DocLink,
  DocTable,
  Figure,
  GameLink,
  SiteUrl,
  Step,
  Steps,
} from '@/components/docs/mdx';
import { YouTube } from '@/components/docs/YouTube';
import { Kbd } from '@/components/ui';

/**
 * Required by @next/mdx (App Router): the components every docs MDX file can use without an import, and the
 * Bezel versions of the markdown elements. Headings keep their default tags: rehype-slug gives them ids and
 * the docs page reads them for "On this page" and search (src/components/docs/doc-tree.ts).
 */
export const docComponents = {
  Callout,
  Steps,
  Step,
  Kbd,
  Figure,
  YouTube,
  GameLink,
  SiteUrl,
  CardGrid,
  Card,
} satisfies MDXComponents;

const components: MDXComponents = {
  ...docComponents,
  a: DocLink,
  table: DocTable,
  img: DocImage,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
