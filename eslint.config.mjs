import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/** Files that render or serve public data: they may read data only through src/server/public (section 6.1). */
const PUBLIC_SURFACES = [
  'src/app/(site)/hub/**',
  'src/app/api/v3/**',
  'src/app/sitemap.ts',
  'src/app/robots.ts',
  'src/app/**/opengraph-image.tsx',
  'src/app/opengraph-image.tsx',
];

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'storage/**',
      'drizzle/**',
      'public/api-docs/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // Command-line scripts print to the console.
    files: ['scripts/**', 'src/test/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: PUBLIC_SURFACES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/db/schema',
                '@/server/private',
                '@/server/private/*',
                '**/db/schema',
                '**/server/private/**',
              ],
              message:
                'Public pages, the API, the sitemap and OG images read data only through @/server/public (docs/ARCHITECTURE.md 6.1).',
            },
          ],
        },
      ],
    },
  },
];

export default config;
