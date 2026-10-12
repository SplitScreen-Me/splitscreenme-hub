import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from './jsonld';

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
