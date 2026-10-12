import { describe, expect, it } from 'vitest';
import { ID_ALPHABET, ID_PATTERN, isValidId, newId } from './ids';
import { slugify, uniqueGameSlug } from './slug';

describe('newId', () => {
  it('makes 17-char Meteor-style ids the app accepts', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId()));
    expect(ids.size).toBe(2000);
    for (const id of ids) {
      expect(id).toHaveLength(17);
      expect([...id].every((c) => ID_ALPHABET.includes(c))).toBe(true);
      expect(ID_PATTERN.test(id)).toBe(true);
    }
  });

  it('uses the whole alphabet (no modulo bias towards the start)', () => {
    const seen = new Set(Array.from({ length: 400 }, () => newId()).join(''));
    expect(seen.size).toBe(ID_ALPHABET.length);
  });

  it('validates ids before any query', () => {
    expect(isValidId('RkbcpmL5dNbrDcfjL')).toBe(true);
    expect(isValidId('')).toBe(false);
    expect(isValidId('../etc')).toBe(false);
    expect(isValidId('a'.repeat(65))).toBe(false);
    expect(isValidId(42)).toBe(false);
  });
});

describe('slugify', () => {
  it.each([
    ['Pokémon Épée', 'pokemon-epee'],
    ['Call of Duty: Black Ops II', 'call-of-duty-black-ops-ii'],
    ["Assassin's Creed® IV", 'assassin-s-creed-iv'],
    ['  --Halo--  ', 'halo'],
    ['ＦＵＬＬＷＩＤＴＨ', 'fullwidth'],
    ['東方', ''],
  ])('%s -> %s', (input, slug) => {
    expect(slugify(input)).toBe(slug);
  });

  it('caps at 80 chars without a trailing dash', () => {
    const s = slugify(`${'a'.repeat(79)} b`);
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('uniqueGameSlug', () => {
  it('adds the year, then the IGDB id, and skips reserved slugs', async () => {
    const taken = new Set(['halo', 'halo-2001']);
    expect(await uniqueGameSlug('Halo', { releaseYear: 2001, igdbId: 740 }, (s) => taken.has(s))).toBe(
      'halo-740',
    );
    expect(await uniqueGameSlug('Genres', { releaseYear: 2020 }, () => false)).toBe('genres-2020');
    expect(await uniqueGameSlug('東方', {}, () => false)).toBe('game');
  });
});
