import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

/**
 * Reads a compiled MDX page as data: its headings (for "On this page") and its text cut into sections (for
 * search). The MDX module's default export is called as a plain function with `walkerComponents`, so every
 * custom component is a pass-through and the result is a tree of plain elements; nothing is rendered.
 */

export interface DocHeading {
  depth: 2 | 3;
  id: string;
  text: string;
}

export interface DocSection {
  /** heading id, '' for the text before the first heading */
  id: string;
  heading: string;
  text: string;
}

export interface DocTree {
  headings: DocHeading[];
  sections: DocSection[];
}

/** Longest text kept per section in the search index. */
export const SECTION_TEXT_MAX = 3000;

const pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);

/** Every custom component of src/mdx-components.tsx, reduced to its text. */
export const walkerComponents: Record<string, unknown> = {
  a: 'a',
  table: 'table',
  img: 'img',
  Callout: ({ title, children }: { title?: ReactNode; children?: ReactNode }) =>
    createElement('div', null, title ? createElement('p', null, title) : null, children),
  Steps: pass,
  Step: ({ title, children }: { title?: ReactNode; children?: ReactNode }) =>
    createElement('div', null, createElement('p', null, title), children),
  Kbd: pass,
  Figure: ({ caption }: { caption?: ReactNode }) => createElement('p', null, caption),
  YouTube: ({ title }: { title?: string }) => createElement('p', null, title),
  GameLink: pass,
  SiteUrl: ({ path }: { path?: string }) => createElement('code', null, path ?? '/'),
  CardGrid: pass,
  Card: ({ title, children }: { title?: string; children?: ReactNode }) =>
    createElement('div', null, createElement('p', null, title), createElement('p', null, children)),
};

/** Elements whose content is a block of its own: their text is separated from what surrounds it. */
const BLOCK = new Set([
  'p',
  'div',
  'li',
  'ul',
  'ol',
  'pre',
  'blockquote',
  'table',
  'tr',
  'td',
  'th',
  'figure',
  'figcaption',
  'aside',
  'dt',
  'dd',
  'br',
  'hr',
  'h1',
  'h4',
  'h5',
  'h6',
  'span.line',
]);

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

type AnyProps = { children?: ReactNode; id?: string; className?: string };

/** Plain text of a node (used for heading texts). */
export function textOf(node: ReactNode): string {
  const out: string[] = [];
  collect(node, (s) => out.push(s), () => out.push(' '));
  return squash(out.join(''));
}

function collect(node: ReactNode, emit: (s: string) => void, gap: () => void, depth = 0): void {
  if (depth > 200 || node == null || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
    emit(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, emit, gap, depth + 1);
    return;
  }
  if (!isValidElement(node)) return;
  const el = node as ReactElement<AnyProps>;
  const { type, props } = el;
  if (typeof type === 'string') {
    const key = type === 'span' && props.className === 'line' ? 'span.line' : type;
    const block = BLOCK.has(key);
    if (block) gap();
    collect(props.children, emit, gap, depth + 1);
    if (block) gap();
    return;
  }
  collect(expand(el), emit, gap, depth + 1);
}

/** The children a non-DOM element stands for: a Fragment's children, or what a sync function returns. */
function expand(el: ReactElement<AnyProps>): ReactNode {
  const { type, props } = el;
  if (type === Fragment) return props.children;
  if (typeof type === 'function') {
    try {
      const out = (type as (p: unknown) => unknown)(props);
      if (out && typeof (out as Promise<unknown>).then === 'function') return props.children;
      return out as ReactNode;
    } catch {
      return props.children;
    }
  }
  return props.children;
}

/** Headings and sections of a page tree, in document order. */
export function walkDoc(root: ReactNode): DocTree {
  const headings: DocHeading[] = [];
  const sections: DocSection[] = [{ id: '', heading: '', text: '' }];
  let buf: string[] = [];

  const flush = () => {
    const current = sections[sections.length - 1]!;
    current.text = squash(`${current.text} ${buf.join('')}`).slice(0, SECTION_TEXT_MAX);
    buf = [];
  };
  const emit = (s: string) => buf.push(s);
  const gap = () => buf.push(' ');

  const visit = (node: ReactNode, depth: number): void => {
    if (depth > 200 || node == null || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
      emit(String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    if (!isValidElement(node)) return;
    const el = node as ReactElement<AnyProps>;
    const { type, props } = el;
    if ((type === 'h2' || type === 'h3') && props.id) {
      flush();
      const text = textOf(props.children);
      headings.push({ depth: type === 'h2' ? 2 : 3, id: props.id, text });
      sections.push({ id: props.id, heading: text, text: '' });
      return;
    }
    if (type === 'h1') return; // the page title comes from meta, never from the body
    if (typeof type === 'string') {
      const key = type === 'span' && props.className === 'line' ? 'span.line' : type;
      const block = BLOCK.has(key);
      if (block) gap();
      visit(props.children, depth + 1);
      if (block) gap();
      return;
    }
    visit(expand(el), depth + 1);
  };

  visit(root, 0);
  flush();
  return { headings, sections: sections.filter((s) => s.id !== '' || s.text !== '') };
}
