/**
 * Client-side docs search. The server builds the index once (src/app/(site)/doc/search-index.json) from the
 * compiled MDX; the browser downloads it on first use and ranks entries here. Pure functions, shared by both.
 */

export interface SearchPage {
  /** /doc path */
  href: string;
  title: string;
  /** nav section, e.g. "Troubleshooting" */
  section: string;
}

export interface SearchEntry {
  /** index in `pages` */
  p: number;
  /** heading id ('' = top of the page) */
  id: string;
  /** heading text ('' = top of the page) */
  h: string;
  /** section text */
  t: string;
}

export interface SearchIndex {
  v: 1;
  pages: SearchPage[];
  entries: SearchEntry[];
}

export interface SearchHit {
  href: string;
  pageTitle: string;
  section: string;
  heading: string;
  /** short excerpt around the first match */
  excerpt: string;
  /** query words, normalised, for highlighting */
  words: string[];
  score: number;
}

/** Lower case, accents and punctuation folded, so "Démarrer" matches "demarrer" and "co-op" matches "coop". */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Query words: folded, at most 6, punctuation trimmed (dots and underscores kept for API names). */
export function queryWords(q: string): string[] {
  return fold(q)
    .split(/[\s,;:!?()"'[\]{}<>/\\|]+/)
    .map((w) => w.replace(/^[.\-_]+|[.\-_]+$/g, ''))
    .filter((w) => w.length > 0)
    .slice(0, 6);
}

interface Prepared {
  entry: SearchEntry;
  title: string;
  heading: string;
  text: string;
}

const cache = new WeakMap<SearchIndex, Prepared[]>();

function prepare(index: SearchIndex): Prepared[] {
  let prepared = cache.get(index);
  if (!prepared) {
    prepared = index.entries.map((entry) => ({
      entry,
      title: fold(index.pages[entry.p]?.title ?? ''),
      heading: fold(entry.h),
      text: fold(entry.t),
    }));
    cache.set(index, prepared);
  }
  return prepared;
}

const isWordStart = (hay: string, at: number) => at === 0 || !/[a-z0-9]/.test(hay[at - 1]!);

function wordScore(w: string, p: Prepared): number {
  let score = 0;
  const inTitle = p.title.indexOf(w);
  const inHeading = p.heading.indexOf(w);
  const inText = p.text.indexOf(w);
  if (inTitle >= 0) score += isWordStart(p.title, inTitle) ? 12 : 6;
  if (inHeading >= 0) score += isWordStart(p.heading, inHeading) ? 9 : 4;
  if (inText >= 0) score += isWordStart(p.text, inText) ? 2 : 1;
  return score;
}

/** Excerpt of `text` around the first occurrence of one of `words`. */
export function excerpt(text: string, words: string[], radius = 70): string {
  if (!text) return '';
  const folded = fold(text);
  let at = -1;
  for (const w of words) {
    const i = folded.indexOf(w);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.length > radius * 2 ? `${text.slice(0, radius * 2).trimEnd()}…` : text;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Ranked hits: every query word must appear in the page title, the section heading or the section text.
 * Title and heading matches weigh most; at most `perPage` hits per page, `limit` in all.
 */
export function search(index: SearchIndex, q: string, limit = 8, perPage = 3): SearchHit[] {
  const words = queryWords(q);
  if (words.length === 0 || words.every((w) => w.length < 2)) return [];
  const phrase = words.join(' ');
  const scored: { p: Prepared; score: number }[] = [];
  for (const p of prepare(index)) {
    let score = 0;
    let all = true;
    for (const w of words) {
      const s = wordScore(w, p);
      if (s === 0) {
        all = false;
        break;
      }
      score += s;
    }
    if (!all) continue;
    if (words.length > 1 && (p.heading.includes(phrase) || p.title.includes(phrase))) score += 10;
    // A whole-page hit (top of the page) is a good landing spot when the title matches.
    if (p.entry.id === '' && words.some((w) => p.title.includes(w))) score += 3;
    scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.p.entry.p - b.p.entry.p);
  const perPageCount = new Map<number, number>();
  const hits: SearchHit[] = [];
  for (const { p, score } of scored) {
    const n = perPageCount.get(p.entry.p) ?? 0;
    if (n >= perPage) continue;
    perPageCount.set(p.entry.p, n + 1);
    const page = index.pages[p.entry.p]!;
    hits.push({
      href: p.entry.id ? `${page.href}#${p.entry.id}` : page.href,
      pageTitle: page.title,
      section: page.section,
      heading: p.entry.h,
      excerpt: excerpt(p.entry.t, words),
      words,
      score,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Splits `text` into plain and matched parts, for <mark> highlighting without HTML strings. */
export function highlight(text: string, words: string[]): { text: string; match: boolean }[] {
  if (!text || words.length === 0) return [{ text, match: false }];
  const folded = fold(text);
  // fold() keeps the length for Latin text (NFKD + removed marks can shift it): fall back to no highlight.
  if (folded.length !== text.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    if (w.length < 2) continue;
    let i = folded.indexOf(w);
    while (i >= 0) {
      for (let k = i; k < i + w.length; k++) marks[k] = true;
      i = folded.indexOf(w, i + w.length);
    }
  }
  const parts: { text: string; match: boolean }[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      parts.push({ text: text.slice(start, i), match: marks[start]! });
      start = i;
    }
  }
  return parts;
}
