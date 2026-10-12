# SplitScreen.Me

The SplitScreen.Me website in one Next.js app: the landing page, the handler hub (catalogue, game pages,
accounts, backoffice), the documentation and the public API (`/api/v3`). It replaces the Meteor hub
(`master` of this repository) and the Docusaurus site.

Beta: <https://v3.splitscreen.me> (noindex).

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first.** It is the source of truth for the route map,
the data model, auth, the API, security, SEO, docs, deployment and the code conventions.

## Stack

Next.js 15 (App Router, `output: standalone`), React 19, TypeScript (strict), Tailwind CSS 4 with the
"Bezel" design tokens, PostgreSQL 16 with Drizzle ORM (postgres-js), zod 4, OpenAPI 3.1 with a self-hosted
Swagger UI, vitest. Runtime dependencies are pure JavaScript (bcryptjs, no sharp, no native modules).

## Getting started

Requirements: Node.js 24, Docker (for the local Postgres).

```sh
npm ci
cp .env.example .env.local      # then fill APP_SECRET (the command is in the file)
npm run db:up                   # Postgres 16 on 127.0.0.1:5433, container splitscreen-v3-pg
npm run db:migrate
npm run db:seed -- --reset      # synthetic catalogue + dev accounts (password "password")
npm run dev                     # http://localhost:3000
```

Dev accounts after seeding: `admin@example.test`, `mod@example.test`, `user@example.test`.

The dev container holds `v3_dev` (default) and `ssm_test`
(recreated by the test run).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (copies the Swagger UI assets first) |
| `npm run build` | Production build (standalone output) |
| `npm start` | Serves the production build |
| `npm run typecheck` | Route types + `tsc --noEmit` |
| `npm run lint` | ESLint, then `scripts/check-security.mjs` (TLS bypasses, `dangerouslySetInnerHTML`, plain `http://`) |
| `npm test` | vitest; DB suites run against `ssm_test` (skipped with a warning if Postgres is down, unless `REQUIRE_DB=1`) |
| `npm run db:up` / `db:down` | Start / stop the dev Postgres |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` (`-- --name <purpose>`; see docs/ARCHITECTURE.md 10.3) |
| `npm run db:migrate` | Apply `drizzle/` migrations to `DATABASE_URL` |
| `npm run db:push` | Push schema changes to a scratch database while iterating |
| `npm run db:seed` | Synthetic development data (`--reset`, `--no-files`) |

Every branch must pass `lint`, `typecheck`, `test` and `build`.

## Layout

```
src/app/(site)/        public pages (header + footer layout): landing, hub, docs, legal, account, dashboard, admin
src/app/(auth)/        login, register, password reset, email verification
src/app/api/v3/        public API (CORS *, no cookies), OpenAPI document and Swagger UI
src/components/ui/     Bezel UI kit (Button, Pane, Tag, FormField, Pagination, CoverImage, SafeMarkdown...)
src/components/layout/ header, footer, beta banner, stub page
src/content/docs/      documentation pages (MDX) and nav.ts
src/db/                Drizzle schema and client
src/lib/               shared helpers: env, auth, api, rate limits, storage, audit, igdb, mail, seo...
src/server/public/     the only data access for public pages and the API (listed handlers only)
src/server/            cache, jobs, actions, private queries
drizzle/               SQL migrations
scripts/               migrate, seed, build and check scripts, importer
deploy/                production compose, nginx vhost, env template, deploy script
```

## Rules that matter

- Public pages, the API, the sitemap and OG images read data **only** through `src/server/public`
  (enforced by ESLint). Anything not listed is a 404.
- Nothing that depends on the environment may be evaluated at build time: no `SITE_URL` in a static
  `metadata` export or in `next.config.ts`. Use `generateMetadata` and read `env()` at request time.
- Secrets live only in the environment (`.env.local`, never committed). Never commit dumps, `storage/`
  or personal data.
- Player colours (`--p1`..`--p8`) mean a player, a slot or a device, nothing else.

## Deployment

Images are built locally and loaded on the server (`deploy/deploy.ps1`); the server never builds. The
runbook (deploy, update, re-import, rollback, logs, memory) is [`docs/DEPLOY.md`](docs/DEPLOY.md); the
design is in `docs/ARCHITECTURE.md` section 9.

## License

Not decided yet for this repository (the Meteor hub never declared one; Nucleus Co-op is GPL-3.0).
