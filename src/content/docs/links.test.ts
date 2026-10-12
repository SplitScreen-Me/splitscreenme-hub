import { readFileSync } from 'node:fs';
import path from 'node:path';
// rehype-slug's own slugger (a dependency of it): the ids it gives headings are the ones links must use.
import GithubSlugger from 'github-slugger';
import { describe, expect, it } from 'vitest';
import { legacyRedirects } from './legacy-redirects';
import { docPages, findDocPage } from './nav';

const DIR = path.resolve('src/content/docs');
const source = (file: string) => readFileSync(path.join(DIR, `${file}.mdx`), 'utf8');

/** Text outside fenced code blocks. */
function prose(src: string): string {
  let fence = false;
  return src
    .split(/\r?\n/)
    .filter((line) => {
      if (/^\s*```/.test(line)) {
        fence = !fence;
        return false;
      }
      return !fence;
    })
    .join('\n');
}

/** The ids a page exposes: heading slugs (as rehype-slug computes them) and explicit id attributes. */
function idsOf(file: string): Set<string> {
  const text = prose(source(file));
  const slugger = new GithubSlugger();
  const ids = new Set<string>();
  for (const m of text.matchAll(/^#{2,6} (.+)$/gm)) {
    const plain = m[1]!
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*]/g, '')
      .trim();
    ids.add(slugger.slug(plain));
  }
  for (const m of text.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1]!);
  return ids;
}

/** Internal links of a page: markdown links and href attributes that start with "/". */
function linksOf(file: string): string[] {
  const text = prose(source(file)).replace(/`[^`]*`/g, '');
  const out: string[] = [];
  for (const m of text.matchAll(/\]\((\/[^)\s]*)\)/g)) out.push(m[1]!);
  for (const m of text.matchAll(/href="(\/[^"]*)"/g)) out.push(m[1]!);
  return out;
}

/** Site routes outside the docs that pages may link to. */
const OTHER_ROUTES = [/^\/$/, /^\/hub(\/|\?|$)/, /^\/download$/, /^\/legal\/(privacy|terms|notice)$/, /^\/dashboard$/, /^\/api\/v3\/(docs|openapi\.json)$/, /^\/doc\/img\//];

describe('docs links', () => {
  const ids = new Map(docPages.map((p) => [p.slug, idsOf(p.file)]));

  it('every internal link points to an existing page and anchor', () => {
    const broken: string[] = [];
    let checked = 0;
    for (const page of docPages) {
      for (const link of linksOf(page.file)) {
        checked++;
        const [pathname = '', hash] = link.split('#');
        if (pathname === '' && hash) {
          if (!ids.get(page.slug)!.has(hash)) broken.push(`${page.file}: ${link}`);
          continue;
        }
        if (pathname === '/doc' || pathname.startsWith('/doc/')) {
          if (pathname.startsWith('/doc/img/')) continue;
          const slug = pathname.replace(/^\/doc\/?/, '');
          const target = findDocPage(slug);
          if (!target) broken.push(`${page.file}: ${link} (no such page)`);
          else if (hash && !ids.get(target.slug)!.has(hash)) broken.push(`${page.file}: ${link} (no such anchor)`);
          continue;
        }
        if (!OTHER_ROUTES.some((re) => re.test(pathname))) broken.push(`${page.file}: ${link} (unknown route)`);
      }
    }
    expect(broken).toEqual([]);
    expect(checked).toBeGreaterThan(100);
  });

  it('every page declares a title, a description and an updated date', () => {
    for (const page of docPages) {
      const src = source(page.file);
      expect(src, page.file).toMatch(/export const meta = \{/);
      expect(src, page.file).toMatch(/title: (['"]).+\1/);
      expect(src, page.file).toMatch(/description:\s+(['"]).{40,}\1/);
      expect(src, page.file).toMatch(/updated: '\d{4}-\d{2}-\d{2}'/);
      // The title comes from meta: a level-1 heading in the body would duplicate it.
      expect(prose(src), page.file).not.toMatch(/^# /m);
    }
  });

  it('keeps the anchors of the old FAQ that the app and old posts link to', () => {
    const faq = ids.get('faq')!;
    expect(faq.has('7--nucleus-co-op-doesnt-launchcrashes-how-do-i-fix-it')).toBe(true);
    for (let n = 1; n <= 30; n++) {
      expect([...faq].some((id) => id.startsWith(`${n}--`)), `FAQ ${n}`).toBe(true);
    }
  });
});

describe('legacy redirects', () => {
  it('lead to existing docs pages', () => {
    for (const r of legacyRedirects) {
      expect(r.source, r.source).toMatch(/^\/(docs|blog)(\/|$)/);
      const slug = r.destination.replace(/^\/doc\/?/, '');
      expect(findDocPage(slug), `${r.source} -> ${r.destination}`).toBeDefined();
    }
  });

  it('cover every page of the old Docusaurus docs', () => {
    const old = ['installation', 'usage', 'faq', 'proto', 'games', 'handlers', 'create-handlers', 'kbm-setup', 'handler-api', 'what-is-splitscreen-me', 'history', 'doesnt-launch', 'bug-report-reddit', 'xboxone'];
    const sources = new Set(legacyRedirects.map((r) => r.source));
    for (const id of old) expect(sources.has(`/docs/${id}`), id).toBe(true);
  });
});
