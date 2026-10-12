import { describe, expect, it } from 'vitest';
import { excerpt, fold, highlight, queryWords, search, type SearchIndex } from './search';

const index: SearchIndex = {
  v: 1,
  pages: [
    { href: '/doc/play/controllers', title: 'Controllers', section: 'Play' },
    { href: '/doc/troubleshooting/controllers', title: 'Controller problems', section: 'Troubleshooting' },
    { href: '/doc/handlers/api', title: 'Handler API reference', section: 'Handlers' },
    { href: '/doc/faq', title: 'FAQ', section: 'Troubleshooting' },
  ],
  entries: [
    { p: 0, id: '', h: '', t: 'Which controllers work with Nucleus Co-op.' },
    { p: 0, id: 'stop-double-input-with-hidhide', h: 'Stop double input with HidHide', t: 'Many games read both XInput and DirectInput.' },
    { p: 0, id: 'steam-input', h: 'Steam Input', t: 'Steam can turn any controller into a virtual Xbox controller. Double input follows.' },
    { p: 1, id: 'one-controller-drives-two-windows', h: 'One controller drives two windows', t: 'The camera spins, buttons act twice: double input.' },
    { p: 2, id: 'game-info', h: 'Game Info', t: 'Game.ExecutableName = "Game.exe"; the name of the executable.' },
    { p: 3, id: 'is-it-free', h: 'Is it free?', t: 'Yes. Démarrer is free, open source.' },
  ],
};

describe('fold and queryWords', () => {
  it('folds case and accents', () => {
    expect(fold('Démarrer ÉLAN')).toBe('demarrer elan');
  });

  it('splits on spaces and punctuation, keeps dotted API names, caps at 6 words', () => {
    expect(queryWords('  HidHide, double-input? ')).toEqual(['hidhide', 'double-input']);
    expect(queryWords('Game.ExecutableName')).toEqual(['game.executablename']);
    expect(queryWords('a b c d e f g h')).toHaveLength(6);
    expect(queryWords('   ')).toEqual([]);
  });
});

describe('search', () => {
  it('requires every word and ranks heading matches before text matches', () => {
    const hits = search(index, 'double input');
    expect(hits.map((h) => h.href)).toEqual([
      '/doc/play/controllers#stop-double-input-with-hidhide',
      '/doc/play/controllers#steam-input',
      '/doc/troubleshooting/controllers#one-controller-drives-two-windows',
    ]);
    expect(search(index, 'double hidhide xbox')).toEqual([]);
  });

  it('matches page titles and the top of a page', () => {
    const [top] = search(index, 'controllers');
    expect(top?.href).toBe('/doc/play/controllers');
    expect(top?.pageTitle).toBe('Controllers');
  });

  it('finds API names and accent-insensitive words', () => {
    expect(search(index, 'ExecutableName')[0]?.href).toBe('/doc/handlers/api#game-info');
    expect(search(index, 'demarrer')[0]?.href).toBe('/doc/faq#is-it-free');
  });

  it('ignores one-letter queries and limits results per page and overall', () => {
    expect(search(index, 'a')).toEqual([]);
    expect(search(index, 'controller', 8, 1).filter((h) => h.href.startsWith('/doc/play/controllers'))).toHaveLength(1);
    expect(search(index, 'controller', 2)).toHaveLength(2);
  });
});

describe('excerpt and highlight', () => {
  it('cuts around the first match', () => {
    const text = `${'x '.repeat(100)}HidHide hides devices${' y'.repeat(100)}`;
    const out = excerpt(text, ['hidhide'], 20);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toContain('HidHide hides');
  });

  it('marks every match, case-insensitively', () => {
    expect(highlight('Double input, DOUBLE trouble', ['double'])).toEqual([
      { text: 'Double', match: true },
      { text: ' input, ', match: false },
      { text: 'DOUBLE', match: true },
      { text: ' trouble', match: false },
    ]);
    expect(highlight('nothing', [])).toEqual([{ text: 'nothing', match: false }]);
  });
});
