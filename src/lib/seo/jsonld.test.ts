import { describe, expect, it } from 'vitest';
import { release, stableRelease } from '@/content/release';
import { serializeJsonLd } from './jsonld';
import { softwareJsonLd } from './landing';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('serializeJsonLd', () => {
  it('cannot close the script tag and keeps the value', () => {
    const data = { name: '</script><script>alert(1)</script>', sep: `a${LS}b${PS}c` };
    const out = serializeJsonLd(data);
    expect(out).not.toContain('<');
    expect(out.includes(LS) || out.includes(PS)).toBe(false);
    expect(JSON.parse(out)).toEqual(data);
  });
});

describe('softwareJsonLd', () => {
  it('makes a hosted build absolute and leaves out missing release notes', () => {
    const ld = softwareJsonLd({ ...release, downloadUrl: '/releases/NucleusCoop-9.9.9.zip', notesUrl: null });
    expect(ld.downloadUrl).toBe('http://localhost:3000/releases/NucleusCoop-9.9.9.zip');
    expect(ld).not.toHaveProperty('releaseNotes');
    expect(ld.softwareVersion).toBe(release.version);
  });

  it('keeps an external build and its notes as they are', () => {
    const ld = softwareJsonLd(stableRelease);
    expect(ld.downloadUrl).toBe(stableRelease.downloadUrl);
    expect(ld.releaseNotes).toBe(stableRelease.notesUrl);
    expect(ld.fileSize).toBe('97 MB');
  });
});
