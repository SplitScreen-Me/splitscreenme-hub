# Scripts

| Script                                                       | What it does                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `migrate.ts`                                                 | Applies `drizzle/` (container start, `npm run db:migrate`)                                             |
| `seed-dev.ts`                                                | Synthetic development data (`npm run db:seed -- --reset`)                                              |
| `import-mongo.ts` + `import/`                                | Mongo (Meteor hub) to Postgres importer, below                                                         |
| `build-scripts.mjs`                                          | Bundles `migrate.ts` and `import-mongo.ts` into `dist/migrate.mjs` and `dist/import.mjs` for the image |
| `dev-db.mjs`, `copy-swagger.mjs`, `check-*.mjs`, `start.mjs` | Tooling                                                                                                |

## Mongo importer (`import-mongo.ts`)

Reads the Meteor database `hubdb` (Mongo 4.0) and its GridFS bucket, writes Postgres and the package files. The rules are in `docs/ARCHITECTURE.md` section 3; the mapping code is `import/transform.ts` (unit tests in `import/transform.test.ts`, synthetic fixtures only).

```
tsx scripts/import-mongo.ts [--reset] [--igdb] [--skip-files] [--only <phase,...>] [--dry-run]
```

| Variable                               |                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `MONGO_URL`                            | required, `mongodb://...`                                              |
| `MONGO_DB`                             | default `hubdb`                                                        |
| `DATABASE_URL`                         | required (locally read from `.env.local` when unset)                   |
| `STORAGE_DIR`                          | default `./storage`; files go to `packages/<handlerId>/<versionId>.nc` |
| `IMPORT_CONFIRM`                       | must be `ssm-v3` with `--reset`                                        |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | with `--igdb` (the env module also wants `SITE_URL` and `APP_SECRET`)  |

**Modes.**

- **Default: upsert.** Re-running it is safe while the old hub stays live (rules in `docs/ARCHITECTURE.md` section 3).
  - Catalogue data (games, handlers, versions, download days) is refreshed from Mongo, except what v3 owns according to the audit log: a handler edited, moderated, transferred, deleted or uploaded to on v3 (or whose owner is banned or deleted there) keeps its v3 columns; a version verified or unverified on v3 keeps that state; a game edited on v3 is not overwritten; a newer version uploaded on v3 stays current.
  - Download counters add Mongo's new downloads to the ones counted on v3 (`imported_*` columns hold the Mongo values of the previous run).
  - A Mongo package whose version number a v3 upload already uses is left out and listed (`skipped.versionCollisionIds`) instead of failing the phase.
  - Handlers and versions gone from Mongo, and not created on v3, are soft-deleted and listed (`changed.goneFromMongo*`). Above `max(25, 2 %)` of the source, nothing is deleted and the run fails: check `MONGO_DB`.
  - Accounts and community rows (users, OAuth identities, stars, comments, reports) are only inserted when missing, so what changed on v3 (a new password, a deleted comment) is kept. A star removed on v3 comes back while the user still has it on the old hub.
- **`--reset`: truncate and reload.** Every table except `audit_log` is emptied first, sessions included, so everyone logs in again. Use this for releases.
- **`--dry-run`:** reads and maps everything and checks that every GridFS file exists. It writes nothing.

**Phases**, each in its own transaction:

1. `users`, with the placeholders for missing owners and the OAuth identities;
2. `games`;
3. `handlers`;
4. `files`, the GridFS export (no database writes);
5. `versions`;
6. `stars`;
7. `comments`;
8. `downloads`;
9. `reports`;
10. `counters` (stars, comments, open reports, trend), then `ANALYZE`.

`--only versions,counters` runs some of them; the other phases' rows are read from Postgres.

**Files** are incremental. `STORAGE_DIR/import/files-index.json` remembers the GridFS id, size, sha256 and manifest of each exported file. A file still on disk with the same GridFS id and size is not downloaded again. `--skip-files` never downloads: versions without a file already on disk are skipped and counted.

**Output** is counts, phase timings and checks, on stdout and in `STORAGE_DIR/import/last-report.json`, plus an `audit_log` entry `system.import`.

- The checks compare every source collection with what was imported plus what was skipped, by reason, and Postgres with the plan.
- A failed check makes the exit code 1.
- Only handler and version ids are ever printed, never names, emails or hashes.

### Locally

The dump holds personal data (emails, password hashes). Keep it outside every repo (below, `<data>` is that directory).

1. **Dump the production database.** The command below runs from PowerShell. It is read-only and niced, and it streams through ssh, so no copy is left on the server.

   Put this in a local file `mongo-dump.sh` with LF line endings:

   ```sh
   set -eu
   PW=$(grep -E 'MONGODB_ROOT_PASSWORD=' /root/hub/docker-compose.yml | head -1 | sed -E "s/.*MONGODB_ROOT_PASSWORD=//; s/[\"' ]//g")
   export PW
   exec nice -n 19 ionice -c3 docker exec -e PW hub-mongodb-1 sh -c 'exec nice -n 19 ionice -c3 mongodump --archive --gzip --numParallelCollections=1 -u root -p "$PW" --authenticationDatabase admin --db hubdb'
   ```

   Then:

   ```powershell
   cmd /c "C:\Windows\System32\OpenSSH\ssh.exe -o BatchMode=yes root@hub.splitscreen.me bash -s < mongo-dump.sh > <data>\hubdb-YYYYMMDD.archive.gz"
   ```

   On 2026-10-12 the dump was 3.7 GB, almost all of it in GridFS, and took about 9 minutes.

2. **Restore it into the local Mongo 4.0** (container `splitscreen-v3-mongo`, `127.0.0.1:27018`):

   ```powershell
   docker compose -f docker-compose.dev.yml --profile legacy up -d mongo
   cmd /c "docker exec -i splitscreen-v3-mongo mongorestore --gzip --archive --drop < <data>\hubdb-YYYYMMDD.archive.gz"
   ```

3. **Import** into `v3_dev`, or your own database. `.env.local` provides `DATABASE_URL`.

   ```powershell
   $env:MONGO_URL = 'mongodb://127.0.0.1:27018/?directConnection=true'
   $env:STORAGE_DIR = "$PWD\storage"
   $env:IMPORT_CONFIRM = 'ssm-v3'
   npx tsx scripts/import-mongo.ts --reset
   ```

   A full run takes a few minutes, most of it the 3.7 GB file export. Later runs reuse the files.

4. **Optionally, refresh the template database** other local databases start from. No session may be connected to `v3_dev` while you do it.

   ```powershell
   docker exec splitscreen-v3-pg psql -U ssm -d postgres -c "ALTER DATABASE v3_template IS_TEMPLATE false" -c "DROP DATABASE IF EXISTS v3_template" -c "CREATE DATABASE v3_template TEMPLATE v3_dev" -c "ALTER DATABASE v3_template IS_TEMPLATE true"
   ```

   Another database then starts with `CREATE DATABASE <name> TEMPLATE v3_template`, with `STORAGE_DIR` pointing at the same storage directory so the package files resolve.

### On the server

The importer runs next to the live Mongo, so personal data never leaves the server. It ships in the site image as `dist/import.mjs`.

**How it reaches Mongo.** The hub's Mongo is published on the host as `127.0.0.1:27017`, which a container cannot reach. The importer container therefore joins two networks:

- `ssm-v3_default`, where Postgres is `db`;
- `hub_default`, where the same mongod is `mongodb:27017`.

**Credentials.** It uses the hub's own `MONGO_URL`, with the replica set, read access to `hubdb` and no root credentials. Nothing is printed.

Choose a quiet hour and stop `web` to free memory. This is the command used for the first import (2026-10-12); `docs/DEPLOY.md` has the whole runbook around it.

```sh
cd /root/v3
umask 077
docker inspect hub-hub-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^MONGO_URL=' > .env.import
printf 'MONGO_DB=hubdb\nIMPORT_CONFIRM=ssm-v3\n' >> .env.import
SITE_TAG=$(grep -E '^SITE_TAG=' .env | cut -d= -f2-)
DATABASE_URL="postgres://ssm:$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)@db:5432/ssm"
export DATABASE_URL

docker compose stop web
docker run -d --name ssm-v3-import --no-healthcheck \
  --network ssm-v3_default --network hub_default \
  --memory 256m --memory-swap 256m --cpus 1 -e NODE_OPTIONS=--max-old-space-size=192 \
  --env-file .env --env-file .env.import -e DATABASE_URL -e STORAGE_DIR=/data/storage \
  -v /srv/ssm-v3/storage:/data/storage \
  --entrypoint nice "ssm-site:$SITE_TAG" -n 19 ionice -c3 node dist/import.mjs --reset --igdb
unset DATABASE_URL
docker wait ssm-v3-import            # prints the exit code: 0 means every check passed
docker logs ssm-v3-import 2>&1 | tail -40
docker rm ssm-v3-import && rm -f .env.import
docker compose start web
```

- **Detached on purpose:** the run survives a dropped SSH session; `docker logs -f ssm-v3-import` follows it.
- **Niceness:** `nice` in front of `docker run` would only nice the client; the image's busybox `nice` and `ionice` lower the importer itself.
- **Compose equivalent:** `docker compose --profile tools run --rm importer --reset --igdb` runs the same container in the foreground, without `nice`.
- **`.env`:** passed for `--igdb` (IGDB credentials, plus `SITE_URL` and `APP_SECRET` for the env module). `docker run --env-file` keeps quotes literally, so `.env` values stay unquoted.
- **Disk:** the first run wrote 3.5 GB under `/srv/ssm-v3/storage/packages` in about 1 minute (2026-10-12: 2840 files).
- **Load on the server:** the importer streams GridFS one file at a time and Mongo only serves plain reads, but those reads fill Mongo's WiredTiger cache (configured above the RAM of the box): after the first run, Mongo held about 1.1 GB of cache, most of it pushed to swap. Later runs only read new files.

### Re-running at release time

The final import happens at the switch, against the live Mongo:

1. Freeze writes on the old hub if possible, by announcing a maintenance window.
2. Back up Postgres: `docker compose exec -T db pg_dump -U ssm -Fc ssm > backups/pre-import.dump`.
3. Run the server command above with `--reset` (and `--igdb`). The file export only downloads packages added since the last run.
4. Read the checks at the end, or `/srv/ssm-v3/storage/import/last-report.json`. Every line must say `OK`, and the exit code must be 0.
5. Start `web`, then smoke-test the catalogue, a game page, a download and a login with a legacy password.

A plain re-run without `--reset` is the upsert mode. Use it to catch up on new handlers and versions during the beta without logging everyone out; it keeps what was changed on v3 (above).
