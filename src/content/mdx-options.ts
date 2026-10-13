/**
 * MDX compile options, used by @next/mdx at build time only: nothing here runs at request time. Imported by
 * next.config.ts.
 *
 * Plugins are named by package, not imported: Turbopack runs the MDX loader from Rust and can only pass it
 * serializable options. The loader resolves each name from the project root.
 */
export const mdxOptions = {
  remarkPlugins: ['remark-gfm'],
  rehypePlugins: [
    'rehype-slug',
    ['rehype-autolink-headings', { behavior: 'wrap' }],
    ['@shikijs/rehype', { theme: 'github-dark-default' }],
  ],
} satisfies {
  remarkPlugins: (string | [string, Record<string, unknown>])[];
  rehypePlugins: (string | [string, Record<string, unknown>])[];
};
