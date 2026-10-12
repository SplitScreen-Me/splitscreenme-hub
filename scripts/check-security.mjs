// Fails (exit 1) on patterns that must never ship: TLS bypasses, plain http:// to third parties, and
// dangerouslySetInnerHTML outside the JSON-LD component. Run by `npm run lint`. docs/ARCHITECTURE.md 6.7.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['src', 'scripts', 'next.config.ts', 'drizzle.config.ts', 'vitest.config.ts'];
const EXT = /\.(ts|tsx|mts|js|mjs|cjs)$/;
const SELF = path.normalize('scripts/check-security.mjs');
const JSONLD = path.normalize('src/components/seo/JsonLd.tsx');

const RULES = [
  { name: 'NODE_TLS_REJECT_UNAUTHORIZED', re: /NODE_TLS_REJECT_UNAUTHORIZED/ },
  { name: 'rejectUnauthorized: false', re: /rejectUnauthorized\s*:\s*false/ },
  { name: 'checkServerIdentity override', re: /checkServerIdentity/ },
  {
    name: 'plain http:// URL to a third party',
    // localhost, loopback and XML namespaces are fine.
    re: /['"`]http:\/\/(?!localhost\b|127\.0\.0\.1\b|0\.0\.0\.0\b|\[::1\]|www\.w3\.org\/)/,
  },
  { name: 'dangerouslySetInnerHTML outside JsonLd.tsx', re: /dangerouslySetInnerHTML/, except: [JSONLD] },
];

function* walk(p) {
  const s = statSync(p, { throwIfNoEntry: false });
  if (!s) return;
  if (s.isFile()) {
    if (EXT.test(p)) yield p;
    return;
  }
  for (const name of readdirSync(p)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    yield* walk(path.join(p, name));
  }
}

const problems = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = path.normalize(file);
    if (rel === SELF) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.except?.includes(rel)) continue;
        if (rule.re.test(line)) problems.push(`${rel}:${i + 1}: ${rule.name}`);
      }
    });
  }
}

if (problems.length) {
  console.error(`check-security: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('check-security: ok');
