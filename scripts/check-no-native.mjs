// Fails the image build if a native module made it into the runtime output: the server has no build
// tools and the runtime must stay pure JS (bcryptjs, no sharp, no argon2). Usage: node check-no-native.mjs <dir>...
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: node scripts/check-no-native.mjs <dir>...');
  process.exit(2);
}

const found = [];
function walk(p) {
  const s = statSync(p, { throwIfNoEntry: false });
  if (!s) return;
  if (s.isFile()) {
    if (p.endsWith('.node') || path.basename(p) === 'binding.gyp') found.push(p);
    return;
  }
  if (s.isSymbolicLink?.()) return;
  for (const name of readdirSync(p)) walk(path.join(p, name));
}
for (const d of dirs) walk(d);

if (found.length) {
  console.error(`check-no-native: native files in the runtime output:\n${found.join('\n')}`);
  process.exit(1);
}
console.log(`check-no-native: ok (${dirs.join(', ')})`);
