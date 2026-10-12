import rehypeShiki from '@shikijs/rehype';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

/**
 * MDX compile options, used by @next/mdx at build time only (webpack): nothing here runs at request time.
 * Imported by next.config.ts.
 */
export const mdxOptions = {
  remarkPlugins: [remarkGfm],
  rehypePlugins: [
    rehypeSlug,
    [rehypeAutolinkHeadings, { behavior: 'wrap' }],
    [rehypeShiki, { theme: 'github-dark-default' }],
  ],
};
