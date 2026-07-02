import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Single shared SQLite connection. Holds targets, destinations and run history.
// Persisted under DATA_DIR so it survives container restarts (mount a volume).

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;

  const dir = process.env.DATA_DIR || "/data";
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, "backuptool.db");
  const d = new Database(file);
  d.pragma("journal_mode = WAL");
  migrate(d);
  _db = d;
  return d;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS destinations (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      kind        TEXT NOT NULL,
      config      TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS targets (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      container_id   TEXT NOT NULL,
      container_name TEXT NOT NULL,
      db_kind        TEXT NOT NULL,
      config         TEXT NOT NULL DEFAULT '{}',
      destination_id TEXT NOT NULL,
      schedule       TEXT NOT NULL,
      enabled        INTEGER NOT NULL DEFAULT 1,
      keep_count     INTEGER NOT NULL DEFAULT 2,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id             TEXT PRIMARY KEY,
      target_id      TEXT NOT NULL,
      target_name    TEXT NOT NULL,
      status         TEXT NOT NULL,
      started_at     INTEGER NOT NULL,
      finished_at    INTEGER,
      size           INTEGER,
      artifact       TEXT,
      destination_id TEXT NOT NULL,
      trigger        TEXT NOT NULL,
      log            TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_runs_target ON runs(target_id, started_at DESC);

    -- Backups saved locally because a destination was offline; the spool
    -- worker retries them until the destination is reachable again.
    CREATE TABLE IF NOT EXISTS spool (
      id              TEXT PRIMARY KEY,
      run_id          TEXT NOT NULL,
      target_id       TEXT NOT NULL,
      destination_id  TEXT NOT NULL,
      filename        TEXT NOT NULL,
      path            TEXT NOT NULL,
      size            INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_error      TEXT,
      last_attempt_at INTEGER
    );
  `);

  // Column migrations for databases created before multi-destination support.
  if (!hasColumn(d, "targets", "destination_ids")) {
    d.exec(`ALTER TABLE targets ADD COLUMN destination_ids TEXT`);
    d.exec(`UPDATE targets SET destination_ids = json_array(destination_id) WHERE destination_ids IS NULL`);
  }
  if (!hasColumn(d, "runs", "results")) {
    d.exec(`ALTER TABLE runs ADD COLUMN results TEXT`);
  }
}

function hasColumn(d: Database.Database, table: string, col: string): boolean {
  const rows = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === col);
}
