/**
 * A handler title often repeats the game name plus a variant ("Zombies", "Seamless Co-op"). Cards show
 * only that variant, and only when it carries meaning (mockup catalog.js).
 */
const STOP = new Set(['game', 'edition', 'pc', 'the', 'handler', 'nucleus', 'coop', 'co-op', 'splitscreen']);

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

export function handlerVariant(title: string, gameName: string): string {
  const t = norm(title.trim());
  const g = norm(gameName.trim());
  if (!t || t === g || !t.startsWith(g)) return '';
  const rest = title
    .trim()
    .slice(gameName.trim().length)
    .replace(/^[\s:–—()[\]-]+/, '')
    .replace(/[\s()[\]]+$/, '')
    .trim();
  const words = rest.split(/\s+/).filter((w) => /[a-z]{3,}/i.test(w) && !STOP.has(w.toLowerCase()));
  return words.length ? rest : '';
}

/** First letter for avatars ("?" when there is none). */
export const initial = (name: string) => (name.trim().match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase();
