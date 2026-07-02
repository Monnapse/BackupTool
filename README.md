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
- **Multiple jobs**, each with its own container, schedule, and **one or more
  destinations** — a single dump fans out to every place you tick (e.g. USB
  drive *and* Google Drive).
- **Offline-safe**: if a destination is unreachable when a backup runs (USB
  unplugged, cloud down), that copy is **kept on the machine and uploaded
  automatically** the moment the destination comes back — no backup is lost and
  nothing to do manually. The dashboard shows what's waiting to sync.
- **Destinations**: local drive (with a built-in **drive/folder picker** that
  shows each disk & SD card separately and updates **live** as you plug/unplug
  drives), plus Google Drive and Dropbox — all linked from the website, with a
  live folder picker. No env editing for cloud.
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
1. **Destinations → Add destination** — choose *Local / Drive* and **browse your
   drives** to pick a folder (see below), or link *Google Drive* / *Dropbox*.
2. **Backup Jobs → New job** — pick a container; type and credentials are
   auto-filled when detectable. Tick **one or more destinations**, choose a
   schedule and how many backups to keep. **Run now** to test immediately.

### Deploying on Portainer

Use **Stacks → Add stack**, paste the contents of `docker-compose.yml`, set the
environment variables, and deploy. Make sure the Docker socket volume and your
backup drive mounts are present.

## Picking a drive (SD card / microSD / USB / disk)

When you add a *Local / Drive* destination, the dashboard shows a **drive picker**
that lists every disk/mount the app can see — each with its free space — and
updates live as drives are plugged in and out. SD/microSD cards in a built-in
slot (e.g. a Raspberry Pi or laptop reader) are detected as such and shown with
an SD-card icon; cards in a USB reader appear as removable drives. Either way
they work identically.

The catch with Docker: a container only sees drives that are **mounted into it**.
The bundled `docker-compose.yml` already mounts the three places Linux puts
drives — `/media`, `/run/media` (auto-mounted USB/SD), and `/mnt` (manual
mounts) — with `rslave` propagation, so anything you plug in later appears
automatically:

```yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - backuptool-data:/data
      - ./backups:/backups
      - /media:/media:rslave          # Linux: USB / SD auto-mount here
      - /run/media:/run/media:rslave  # (some distros use this instead)
      - /mnt:/mnt:rslave              # manual mounts, e.g. mount /dev/mmcblk0p1 /mnt/sdcard
      # - D:/backups:/mnt/d           # a Windows host folder
```

The host has to mount the card itself: desktop distros do it automatically via
udisks2; on a headless server install `udiskie`/`usbmount`, or mount manually
(`mount /dev/mmcblk0p1 /mnt/sdcard`). If a card is unplugged when a backup
runs, the backup is spooled locally and synced when the card returns.

Running the app **natively** (not in Docker) on Windows/Linux, it sees your real
drive letters / mounts directly — no mounting needed.

> Set `FS_BROWSE_ROOT` to restrict the picker to a single path if you'd rather
> not expose the whole filesystem to the dashboard.

## Talking to Docker

| Host | `DOCKER_SOCKET` | Notes |
|------|-----------------|-------|
| Linux / macOS | `/var/run/docker.sock` | Mounted in compose (default). |
| Windows (Docker Desktop) | `tcp://host.docker.internal:2375` | Enable *Settings → General → Expose daemon on tcp://localhost:2375 without TLS*, and drop the socket volume. |

The dumps themselves run **inside each target container**, so this app doesn't
need any database client tools installed — just access to the Docker daemon.

## Cloud destinations (linked in the website — no env needed)

Google Drive and Dropbox are set up **entirely in the dashboard** — you don't
touch any env vars. The one unavoidable step is creating an OAuth app once (this
is how Google/Dropbox require third-party apps to access an account):

1. **Add destination → Google Drive / Dropbox.** The form shows the exact
   **redirect URI** to register — copy it.
2. Create the OAuth app and paste its **Client ID/Secret** (Google) or
   **App key/secret** (Dropbox) into the form, then **Create**.
   - **Google** — *APIs & Services → Credentials → OAuth client ID*, type
     *Web application*; add the redirect URI shown.
   - **Dropbox** — https://www.dropbox.com/developers/apps, scoped app with the
     `files.content.write` + `files.content.read` scopes; add the redirect URI.
3. On the destination card click **Link account** and sign in.
4. Click **Choose folder** and pick where backups go — each job gets its own
   subfolder inside it.

Make sure `APP_URL` matches how you actually reach the app (e.g.
`http://192.168.1.50:8723`), since the redirect URI is built from it. Credentials
and tokens are stored encrypted.

## Local development

```bash
npm install
cp .env.example .env   # set DATA_DIR / BACKUP_DIR to local folders, e.g. ./data ./backups
npm run dev
```

On Windows for dev, set `DOCKER_SOCKET=tcp://localhost:2375` (with Docker
Desktop's daemon exposed) or `//./pipe/docker_engine`.

## How rotation works

After each successful backup, each destination is listed and only the newest
`keepCount` artifacts are retained — the rest are deleted. Filenames are
timestamped (`<job>_<YYYY-MM-DD_HH-mm-ss>.sql.gz`), so with `keepCount = 2` and
an hourly schedule you always hold the two most recent hourly snapshots.

## How offline destinations are handled

Every run dumps the database **once** to local disk, then uploads that file to
each of the job's destinations. Any destination that fails (drive unplugged,
cloud unreachable) is skipped — the file stays spooled under `DATA_DIR/spool`
and a background worker probes the destination every 30 seconds, uploading the
pending backups (oldest first) as soon as it's reachable again. The run shows as
**pending sync** until then, and flips to **success** once everything has
synced. The spool itself is rotated with the same `keepCount`, so a long outage
can't fill your disk.

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
