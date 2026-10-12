# Deploying v3.splitscreen.me

Runbook for the beta at <https://v3.splitscreen.me>, live since 2026-10-12 and not indexed (`NOINDEX=1`). The design behind it is
in `docs/ARCHITECTURE.md` section 9; this file is what to type.

The server is small and shared: 2 vCPU, 1.86 GB of RAM, 2 GB of swap. It also runs the production hub (`hub-hub-1`), its
Mongo 4.0 (`hub-mongodb-1`), the Discord bot and the Docusaurus site. **Never change anything of theirs**: `/root/hub`,
`/root/discordbot`, `/root/www`, `/var/www/build`, their containers, their nginx vhosts and their certificate.

## What runs where

| What                     | Where                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compose project `ssm-v3` | `/root/v3/docker-compose.yml`, a copy of `deploy/docker-compose.prod.yml`                                                                                                          |
| Environment              | `/root/v3/.env`, mode 600, written on the server (see "From scratch")                                                                                                              |
| Database backups         | `/root/v3/backups/` (mode 700): `pre-<tag>.dump` before each release, `nightly-<Day>.dump` (7 kept)                                                                                |
| Postgres 16              | container `ssm-v3-db-1`, volume `ssm-v3_pgdata`, `mem_limit` 200m, no published port                                                                                               |
| Site                     | container `ssm-v3-web-1`, image `ssm-site:<git short sha>`, `127.0.0.1:3010`, 320m without swap, 1 CPU                                                                             |
| Package files            | `/srv/ssm-v3/storage` (owner `1001:33`, mode 750): `packages/`, `import/` (importer index and last report)                                                                         |
| nginx                    | `/etc/nginx/sites-available/v3.splitscreen.me` (from `deploy/nginx/`), linked in `sites-enabled`                                                                                   |
| nginx logs               | `/var/log/nginx/v3.splitscreen.me.access.log`, `.error.log`                                                                                                                        |
| Certificate              | `/etc/letsencrypt/live/v3.splitscreen.me`, webroot `/var/www/letsencrypt`, the ACME account of the other certificates; `certbot.timer` renews it and the deploy hook reloads nginx |
| Nightly dump             | `/etc/cron.d/ssm-v3-backup`, 04:30 server time                                                                                                                                     |

**Access.** `root@hub.splitscreen.me` answers only to the Windows OpenSSH client and its agent
(`C:\Windows\System32\OpenSSH\ssh.exe -o BatchMode=yes`). From PowerShell, send a multi-line script as base64 and decode it
on the server (`echo <b64> | base64 -d | bash -s`): piping a here-string adds a BOM. When a script arrives on stdin,
`docker compose exec -T` swallows the rest of it unless you give it `< /dev/null`.

**Secrets** are never printed: read them into variables inside the remote command, and print only names, counts and
booleans.

## Update to a new version

1. **Build locally**, from a clean working tree, so the tag names the code:

   ```powershell
   $tag = git rev-parse --short HEAD
   docker build --platform linux/amd64 -t ssm-site:$tag .
   ```

2. **Move the image.** PowerShell 5.1 corrupts binary pipes, so stream it from Git Bash, which can still call the Windows
   ssh (about 1.5 minutes for the 320 MB image):

   ```sh
   docker save ssm-site:$tag | gzip -1 | /c/Windows/System32/OpenSSH/ssh.exe -o BatchMode=yes root@hub.splitscreen.me "nice -n 10 gunzip | docker load"
   ```

   `deploy/deploy.ps1` does steps 1 and 2 through a tar file and `scp` instead; with `-Up` it also runs step 3.

3. **Release on the server:**

   ```sh
   cd /root/v3
   free -m
   docker compose exec -T db pg_dump -U ssm -Fc ssm < /dev/null > backups/pre-$tag.dump && test -s backups/pre-$tag.dump
   sed -i "s/^SITE_TAG=.*/SITE_TAG=$tag/" .env
   docker compose up -d web            # migrations run at container start (dist/migrate.mjs)
   docker compose ps
   curl -s 127.0.0.1:3010/api/v3/health
   ```

4. Run the [smoke test](#smoke-test) and [check the memory](#memory).
5. Keep the last 3 images: `docker image ls ssm-site`, then `docker image rm ssm-site:<old tag>`.

A change to `deploy/docker-compose.prod.yml` is copied to `/root/v3/docker-compose.yml` by hand, then `docker compose up -d`.
A change to the vhost: back up nginx (below), copy the file, `nginx -t`, then `systemctl reload nginx`.

## Re-import from the old hub

The importer (`scripts/README.md`) reads the hub's Mongo on the server, so personal data never leaves it. It joins the hub's
network `hub_default` (a container cannot reach the host's `127.0.0.1:27017`) and uses the hub's own `MONGO_URL`, copied
from the container without printing it.

- **During the beta:** run it without `--reset` (upsert). It adds the new handlers, versions and downloads and keeps what
  was changed on v3.
- **At release time:** announce a maintenance window, freeze the old hub if possible, back up Postgres, then run it with
  `--reset`. A reset empties every table except `audit_log`, sessions included, so everyone logs in again.

Command, at a quiet hour. `web` is stopped to free memory:

```sh
cd /root/v3
docker compose exec -T db pg_dump -U ssm -Fc ssm < /dev/null > backups/pre-import.dump
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
  --entrypoint nice "ssm-site:$SITE_TAG" -n 19 ionice -c3 node dist/import.mjs --igdb    # add --reset at release time
unset DATABASE_URL
docker wait ssm-v3-import                         # exit code: 0 when every check passed
docker logs ssm-v3-import 2>&1 | grep -v 'check OK' | tail -40
docker logs ssm-v3-import 2>&1 | grep -c 'check OK'
docker rm ssm-v3-import && rm -f .env.import
docker compose start web
```

- The container runs detached, so a dropped SSH session does not kill it; `docker logs -f ssm-v3-import` follows it.
- Every `check` line must say `OK` and the exit code must be 0. The report is also in
  `/srv/ssm-v3/storage/import/last-report.json`. Only handler and version ids are printed, never names or emails.
- `--dry-run` reads and maps everything and writes nothing.
- First run, 2026-10-12, with `--reset --igdb`: 58 s, 19 checks OK. It imported 3584 users, 2912 OAuth identities,
  1175 games (IGDB found 1171), 1549 handlers (891 listed), 2840 versions, 5192 stars, 230 comments, 267 407 download days
  and 199 reports, and wrote 3.5 GB of packages. The file export is incremental: later runs download only new packages.

## Rollback

- **Code only** (no migration between the two tags): put the previous tag back in `.env`, then run
  `docker compose up -d web`.
- **With a migration in between:** stop the site, restore the dump taken before the release, then start the old tag:

  ```sh
  cd /root/v3
  docker compose stop web
  docker compose exec -T db psql -U ssm -d postgres -c 'DROP DATABASE ssm' -c 'CREATE DATABASE ssm' < /dev/null
  docker compose exec -T db pg_restore -U ssm -d ssm --no-owner < backups/pre-<new tag>.dump
  sed -i 's/^SITE_TAG=.*/SITE_TAG=<old tag>/' .env
  docker compose up -d web
  ```

- **Take the beta offline** (memory emergency, incident): run `docker compose stop web`, and nginx answers 502.
  `docker compose down` also stops Postgres and keeps the volume. To remove the site from nginx, run
  `rm /etc/nginx/sites-enabled/v3.splitscreen.me && nginx -t && systemctl reload nginx`.
- **nginx:** before any change, copy both directories:
  `D=/root/nginx-backups/$(date +%Y%m%d-%H%M%S); mkdir -p $D && cp -a /etc/nginx/sites-available /etc/nginx/sites-enabled $D/`.
  The state before v3 is in `/root/nginx-backups/20261012-235204`.
- **Data during the beta:** the catalogue can always be rebuilt from Mongo (`--reset`). Accounts and comments created on
  v3 only exist in the dumps.

## Logs

| What                                              | Command                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Site (JSON lines, no secrets or emails by design) | `docker compose logs -f --tail 100 web`                                                                                 |
| Errors only                                       | `docker compose logs web \| grep -E '"level":"(error\|warn)"'`                                                          |
| Postgres (queries over 500 ms)                    | `docker compose logs --tail 100 db`                                                                                     |
| nginx                                             | `tail -f /var/log/nginx/v3.splitscreen.me.error.log` (429s show up as `limiting requests`)                              |
| Last import                                       | `/srv/ssm-v3/storage/import/last-report.json`                                                                           |
| Certificate                                       | `certbot certificates`, `certbot renew --dry-run --cert-name v3.splitscreen.me`, `/var/log/letsencrypt/letsencrypt.log` |

Container logs rotate at 3 x 10 MB.

## Memory

Measured on 2026-10-12 with `free -m`, "available" column:

| Moment                                             | Available     | Swap used |
| -------------------------------------------------- | ------------- | --------- |
| Before v3                                          | 533 to 554 MB | 1064 MB   |
| db + web started, idle                             | 417 MB        | 1074 MB   |
| Import running (`web` stopped)                     | 229 to 311 MB | 1119 MB   |
| After the import, `web` restarted, smoke test done | 344 to 378 MB | 1271 MB   |

At rest, `web` uses 110 to 165 MiB of its 320 MiB and `db` 25 to 65 MiB of its 200 MiB. `web` has no swap
(`memswap_limit`) and a 192 MB V8 heap, which leaves room for upload buffers and Open Graph rendering.

**Mongo's cache.** Mongo's WiredTiger cache is configured at 1.4 GB, more than the free RAM. The first import read 3.5 GB of
GridFS and filled it to 1.1 GB (682 MB resident, the rest in swap), which explains the swap growth above. Only a Mongo
restart with a smaller cache (`--wiredTigerCacheSizeGB 0.25`) gives that memory back. That is the hub's decision: do it in
one of its maintenance windows, not from here.

**Check after every change:**

```sh
free -m
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}'
for c in hub-hub-1 hub-mongodb-1 discordbot-hub-1 ssm-v3-web-1 ssm-v3-db-1; do
  echo "$c $(docker inspect -f '{{.RestartCount}} {{.State.StartedAt}} oom={{.State.OOMKilled}}' $c)"; done
```

Act in either of these cases:

- "available" stays under about 150 MB;
- the hub or Mongo restarts (its `StartedAt` changes).

Then:

1. Run `docker compose stop web`, which frees about 150 MB at once.
2. Then lower the limits in `/root/v3/docker-compose.yml`. Keep the V8 heap about 128 MB under the `web` limit
   (`--max-old-space-size`): at a 256 MB heap in a 320 MB cgroup, the kernel killed the container before V8 collected.

## Smoke test

Run it from any machine after a release. `count=false` keeps the download out of the counters, and curl's user agent is not
counted anyway.

```sh
B=https://v3.splitscreen.me; H=QC7TTYjjZzaQ6Y6Nw    # any listed handler id
for p in / /hub /hub/minecraft /doc /doc/getting-started /login /download /api/v3 /api/v3/docs /api/v3/openapi.json \
         "/api/v3/handlers?limit=5" /api/v3/handlers/$H /robots.txt /sitemap.xml; do
  printf '%-32s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code} %{time_total}s' "$B$p")"; done
curl -sI "$B/" | grep -iE '^(x-robots-tag|strict-transport-security):'          # noindex, nofollow + max-age=63072000
curl -s -D - -o pkg.nc "$B/api/v3/handlers/$H/download?count=false" | grep -iE '^(content-type|content-length):'
curl -sI http://v3.splitscreen.me/hub | grep -i '^location'                       # https://v3.splitscreen.me/hub
echo | openssl s_client -connect v3.splitscreen.me:443 -servername v3.splitscreen.me 2>/dev/null | openssl x509 -noout -enddate
for u in https://hub.splitscreen.me/ https://www.splitscreen.me/; do curl -s -o /dev/null -w "$u %{http_code}\n" "$u"; done
```

Expected: 200 everywhere, the download is `application/zip` and its sha256 equals the one in the handler's JSON, and the
production hosts still answer 200. The first request after a start can take several seconds while Next loads the route.

## From scratch

This is what was done on 2026-10-12, kept for a rebuild of the server:

1. **Directories and compose:**
   `mkdir -p /root/v3/backups /srv/ssm-v3/storage && chmod 700 /root/v3/backups && chown 1001:33 /srv/ssm-v3/storage && chmod 750 /srv/ssm-v3/storage`,
   then copy `deploy/docker-compose.prod.yml` to `/root/v3/docker-compose.yml`.
2. **`.env`, created with `umask 077`, from `deploy/env.example`:**
   - generated: `POSTGRES_PASSWORD` (`openssl rand -hex 24`) and `APP_SECRET` (`openssl rand -hex 32`);
   - taken from the running hub (`docker inspect hub-hub-1`, `METEOR_SETTINGS.private`, never printed):
     - `OAuth.{discord,github,google}.{clientId,secret}` become `<PROVIDER>_CLIENT_ID` and `<PROVIDER>_CLIENT_SECRET`;
     - `IGDB_API_ID` and `IGDB_API_KEY` become `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`;
     - the hub's `MAIL_URL` (smtps, port 465) becomes `SMTP_URL`, and `supportEmail` becomes `MAIL_FROM`;
   - set by hand: `SITE_TAG`, `SITE_URL=https://v3.splitscreen.me`, `NOINDEX=1`, `BETA=1`, `LOG_LEVEL=info`;
   - left empty: the Discord webhooks, during the beta. Facebook has no login on v3.

   Write the values unquoted, with no `$`, quote or `#`: compose interpolates `$`, and `docker run --env-file` keeps quotes
   literally.

3. **Start:** `docker compose pull db && docker compose up -d`, then wait for `ssm-v3-web-1` to be `healthy`.
4. **Import:** run the importer with `--reset --igdb` (above).
5. **nginx and certificate:**
   1. Back up nginx.
   2. Install a port-80-only vhost for the ACME challenge, link it, then `mkdir -p /var/www/letsencrypt`, `nginx -t` and
      `systemctl reload nginx`.
   3. Get the certificate:
      `certbot certonly --webroot -w /var/www/letsencrypt -d v3.splitscreen.me --non-interactive --agree-tos --deploy-hook "systemctl reload nginx"`.
   4. Install `deploy/nginx/v3.splitscreen.me.conf`, then `nginx -t` and `systemctl reload nginx`.
6. **Nightly dump,** in `/etc/cron.d/ssm-v3-backup`:

   ```
   30 4 * * * root cd /root/v3 && f=backups/nightly-$(date +\%a).dump && docker compose exec -T db pg_dump -U ssm -Fc ssm < /dev/null > $f.part && test -s $f.part && mv $f.part $f
   ```

## Outside the server

**OAuth redirect URIs.** The beta uses the hub's provider apps, which keep the same user ids. Until each provider knows the
URI below, its button on `/login` fails at the provider. Email and password logins work.

| Provider                                                                    | URI to add                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Discord (Developer Portal, OAuth2, Redirects)                               | `https://v3.splitscreen.me/api/auth/oauth/discord/callback` |
| Google (Cloud Console, Credentials, OAuth client, Authorized redirect URIs) | `https://v3.splitscreen.me/api/auth/oauth/google/callback`  |
| GitHub (OAuth App)                                                          | `https://v3.splitscreen.me/api/auth/oauth/github/callback`  |

A GitHub OAuth App has a single callback URL, so GitHub needs one of these:

- **A second OAuth App for v3** (recommended): GitHub user ids are global, so imported identities still match. Put its id and
  secret in `/root/v3/.env`, then run `docker compose up -d web`.
- **Widen the hub app's callback** to `https://splitscreen.me/`: GitHub accepts any subdomain and any path below it, so both
  the hub and v3 work.

**At the cutover:** set the final `SITE_URL` and `NOINDEX=0`, register the redirect URIs of the final host, turn the Discord
webhooks on, and add the nginx redirects listed in the appendix of `docs/ARCHITECTURE.md`.
