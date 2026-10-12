import { createElement as h, Fragment, type FunctionComponent, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { textOf, walkDoc, walkerComponents } from './doc-tree';

/** What a compiled MDX page returns: a fragment of elements, custom components included. */
type Titled = FunctionComponent<{ title: string; children?: ReactNode }>;
const Callout = walkerComponents.Callout as Titled;
const Step = walkerComponents.Step as Titled;

const page = h(
  Fragment,
  null,
  h('h1', null, 'Ignored title'),
  h('p', null, 'Intro ', h('strong', null, 'text'), '.'),
  h('h2', { id: 'install' }, h('a', { href: '#install' }, 'Install')),
  h('p', null, 'Unzip it.'),
  h(Callout, { title: 'Careful' }, h('p', null, 'Antivirus.')),
  h('h3', { id: 'update' }, 'Update ', h('code', null, 'now')),
  h('pre', null, h('code', null, h('span', { className: 'line' }, 'a()'), h('span', { className: 'line' }, 'b()'))),
  h(Step, { title: 'First' }, h('p', null, 'Do it.')),
  h(async () => 'never awaited', null),
);

describe('walkDoc', () => {
  const tree = walkDoc(page);

  it('lists h2 and h3 with their ids and plain text', () => {
    expect(tree.headings).toEqual([
      { depth: 2, id: 'install', text: 'Install' },
      { depth: 3, id: 'update', text: 'Update now' },
    ]);
  });

  it('cuts the text into sections, custom components reduced to their text', () => {
    expect(tree.sections).toEqual([
      { id: '', heading: '', text: 'Intro text.' },
      { id: 'install', heading: 'Install', text: 'Unzip it. Careful Antivirus.' },
      { id: 'update', heading: 'Update now', text: 'a() b() First Do it.' },
    ]);
  });

  it('caps the text of a section', () => {
    const long = walkDoc(h(Fragment, null, h('h2', { id: 'x' }, 'X'), h('p', null, 'word '.repeat(2000))));
    expect(long.sections[0]!.text.length).toBeLessThanOrEqual(3000);
  });
});

describe('textOf', () => {
  it('joins nested text and separates blocks', () => {
    expect(textOf(h('div', null, h('p', null, 'a'), h('p', null, 'b'), 3))).toBe('a b 3');
    expect(textOf(null)).toBe('');
  });
});
