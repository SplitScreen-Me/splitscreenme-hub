// Copies the Swagger UI assets from swagger-ui-dist into public/api-docs (gitignored, except init.js).
// Runs at predev and prebuild; safe to run repeatedly.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve('swagger-ui-dist/package.json'));
const out = path.resolve('public/api-docs');
mkdirSync(out, { recursive: true });

for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
  copyFileSync(path.join(dist, file), path.join(out, file));
}
console.log('copy-swagger: swagger-ui assets copied to public/api-docs');
