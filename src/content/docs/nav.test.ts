import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { docPages } from './nav';

const DIR = path.resolve('src/content/docs');

function mdxFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? mdxFiles(path.join(dir, e.name), `${prefix}${e.name}/`)
      : e.name.endsWith('.mdx')
        ? [`${prefix}${e.name.slice(0, -4)}`]
        : [],
  );
}

describe('docs nav', () => {
  it('every nav entry has a file and every file has an entry', () => {
    const files = mdxFiles(DIR).sort();
    expect(docPages.map((p) => p.file).sort()).toEqual(files);
  });

  it('slugs are unique and URL-safe', () => {
    const slugs = docPages.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^([a-z0-9-]+(\/[a-z0-9-]+)*)?$/);
  });
});
