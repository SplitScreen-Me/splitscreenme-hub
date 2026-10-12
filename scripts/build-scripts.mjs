// Bundles the command-line entry points that ship in the image into dist/*.mjs (esbuild, Node ESM):
// dist/migrate.mjs (run at container start) and dist/import.mjs (the Mongo importer).
import { build } from 'esbuild';

const EXTERNAL = [
  // optional native or cloud add-ons of the mongodb driver, never used here
  'kerberos',
  'snappy',
  '@mongodb-js/zstd',
  'mongodb-client-encryption',
  'gcp-metadata',
  'socks',
  '@aws-sdk/credential-providers',
];

await build({
  entryPoints: { migrate: 'scripts/migrate.ts', import: 'scripts/import-mongo.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: false,
  legalComments: 'none',
  external: EXTERNAL,
  tsconfig: 'tsconfig.json',
  // CommonJS dependencies inside an ESM bundle need require().
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  // 'server-only' throws outside React Server Components; scripts are not RSC.
  alias: { 'server-only': './src/test/server-only-stub.ts' },
  logLevel: 'info',
});
