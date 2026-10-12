import type { Components, Options } from 'react-markdown';
import { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Rendering rules for user markdown (handler descriptions): docs/ARCHITECTURE.md section 6.4.
 * Raw HTML is skipped, URLs go through react-markdown's default filter (no javascript:, data: ...),
 * links are nofollow ugc, images become links (no third-party image loads), headings shift down two levels.
 */

const shift = (level: number) => `h${Math.min(level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6';

const heading =
  (level: number): Components['h1'] =>
  // eslint-disable-next-line react/display-name
  ({ children, node: _node, ...rest }) => {
    const Tag = shift(level);
    return <Tag {...rest}>{children}</Tag>;
  };

const components: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  a: ({ children, href, node: _node, ...rest }) => (
    <a {...rest} href={href} rel="nofollow ugc noopener noreferrer" target="_blank">
      {children}
    </a>
  ),
  img: ({ src, alt }) =>
    typeof src === 'string' && src ? (
      <a href={src} rel="nofollow ugc noopener noreferrer" target="_blank">
        {alt ? `Image: ${alt}` : 'Image'}
      </a>
    ) : null,
};

export const userMarkdownOptions: Omit<Options, 'children'> = {
  remarkPlugins: [remarkGfm],
  skipHtml: true,
  urlTransform: defaultUrlTransform,
  components,
};

/** Plain-text comment bodies: split into lines and autolink http(s) URLs (no markdown). */
export function linkifyText(text: string): (string | { href: string })[] {
  const parts: (string | { href: string })[] = [];
  const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ href: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
