# BackupTool

Self-hosted, scheduled backups for your Docker databases — with a clean web dashboard.

Point it at the containers on your server, pick where backups go (a mounted SD
card / USB drive, Google Drive, or Dropbox), set a schedule and a rotation
count, and it takes care of the rest. Built to deploy in one container via
Portainer / docker-compose.

![stack](https://img.shields.io/badge/Next.js-14-black) ![stack](https://img.shields.io/badge/Tailwind-3-38bdf8)

## Features

- **Auto-discovers containers** over the Docker socket and guesses the database
  type + credentials from each container's environment variables.
- **Backs up PostgreSQL, MySQL/MariaDB, MongoDB** (via `pg_dump`, `mysqldump`,
  `mongodump` run *inside* the target container) and **raw volumes/files**
  (`tar`) — which covers SQLite, Redis, and anything else.
- **Scheduling** with friendly presets or any cron expression.
- **Rotation**: keep the newest *N* backups per job; older ones are pruned
  automatically. (Your "2 rotating hourly files" idea = `keep 2` + `Hourly`.)
- **Multiple jobs**, each with its own container, destination, schedule.
- **Destinations**: local/mounted drive, Google Drive, Dropbox (pluggable).
- **Password-protected** dashboard; stored credentials & tokens are encrypted
  at rest (AES-256-GCM).
- Runs anywhere Docker does — Linux, Windows, macOS.

## Quick start (docker-compose)

```bash
cp .env.example .env
# edit .env: set ADMIN_PASSWORD and a long random APP_SECRET
#   openssl rand -hex 32   →  paste as APP_SECRET

docker compose up -d --build
```

Open http://localhost:8723 and sign in with `ADMIN_PASSWORD`.

> **Changing the port** — set `PORT` in your `.env` (default `8723`). It drives
> both the published host port and the in-container port, so that's the only
> place you need to change it. If you use cloud destinations, also update
> `APP_URL` to match.

Then:
1. **Destinations → Add destination** — add a *Local / Drive* pointing at
   `/backups` (which is mapped to your SD card / USB in `docker-compose.yml`).
2. **Backup Jobs → New job** — pick a container; type and credentials are
   auto-filled when detectable. Choose the destination, a schedule, and how many
   backups to keep. **Run now** to test immediately.

### Deploying on Portainer

Use **Stacks → Add stack**, paste the contents of `docker-compose.yml`, set the
environment variables, and deploy. Make sure the Docker socket volume and your
backup drive mount are present.

## Connecting your backup drive (SD card / USB)

Edit the `volumes` mapping in `docker-compose.yml`:

```yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - backuptool-data:/data
      - /mnt/sdcard:/backups        # Linux: your mounted SD card
      # - C:/backups:/backups       # Windows: a host folder
```

Whatever you map to `/backups` is what the *Local / Drive* destination writes to.

## Talking to Docker

| Host | `DOCKER_SOCKET` | Notes |
|------|-----------------|-------|
| Linux / macOS | `/var/run/docker.sock` | Mounted in compose (default). |
| Windows (Docker Desktop) | `tcp://host.docker.internal:2375` | Enable *Settings → General → Expose daemon on tcp://localhost:2375 without TLS*, and drop the socket volume. |

The dumps themselves run **inside each target container**, so this app doesn't
need any database client tools installed — just access to the Docker daemon.

## Cloud destinations (optional)

Google Drive and Dropbox use OAuth, so you supply your own app credentials:

- **Google Drive** — create an *OAuth 2.0 Client ID* (Web application) in the
  Google Cloud Console. Add redirect URI
  `<APP_URL>/api/destinations/oauth/google/callback`. Put the client id/secret
  in `.env`.
- **Dropbox** — create a scoped app at
  https://www.dropbox.com/developers/apps with the `files.content.write` and
  `files.content.read` scopes and redirect URI
  `<APP_URL>/api/destinations/oauth/dropbox/callback`.

Then add the destination in the UI and click **Connect** to authorize. Tokens
are stored encrypted.

## Local development

```bash
npm install
cp .env.example .env   # set DATA_DIR / BACKUP_DIR to local folders, e.g. ./data ./backups
npm run dev
```

On Windows for dev, set `DOCKER_SOCKET=tcp://localhost:2375` (with Docker
Desktop's daemon exposed) or `//./pipe/docker_engine`.

## How rotation works

After each successful backup, the destination is listed and only the newest
`keepCount` artifacts are retained — the rest are deleted. Filenames are
timestamped (`<job>_<YYYY-MM-DD_HH-mm-ss>.sql.gz`), so with `keepCount = 2` and
an hourly schedule you always hold the two most recent hourly snapshots.

## Security notes

- The dashboard is single-password. Put it on a trusted network or behind a
  reverse proxy with TLS if exposed.
- `APP_SECRET` signs sessions **and** encrypts stored secrets — back it up; if
  you change it, stored DB passwords / OAuth tokens become unreadable.
- The container mounts the Docker socket, which is root-equivalent on the host.
  Only run images you trust.

## Architecture

Single Next.js 14 (App Router) app:

- `src/lib/docker.ts` — container discovery + `exec` streaming (dockerode).
- `src/lib/backup/` — dump command builders, the run engine, rotation.
- `src/lib/destinations/` — pluggable storage backends (local, gdrive, dropbox).
- `src/lib/scheduler.ts` — in-process cron, started from `instrumentation.ts`.
- `src/lib/repo.ts` + `db.ts` — SQLite persistence with encrypted secrets.
- `src/app/` — dashboard UI + API routes.
