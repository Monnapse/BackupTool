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
  `);
}
