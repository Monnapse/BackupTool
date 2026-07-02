import crypto from "node:crypto";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";
import type {
  BackupRun,
  BackupTarget,
  Destination,
  DestinationResult,
  DestResultStatus,
  RunStatus,
  SpoolItem,
  TargetConfig,
} from "./types";

export const newId = () => crypto.randomUUID();
const now = () => Date.now();

// ── Targets ────────────────────────────────────────────────────────────────
// `config.password` is encrypted before it touches disk and decrypted on read.

function encodeTargetConfig(c: TargetConfig): string {
  return JSON.stringify({ ...c, password: encrypt(c.password) });
}
function decodeTargetConfig(s: string): TargetConfig {
  const raw = JSON.parse(s) as TargetConfig;
  return { ...raw, password: decrypt(raw.password) };
}

function rowToTarget(r: any): BackupTarget {
  return {
    id: r.id,
    name: r.name,
    containerId: r.container_id,
    containerName: r.container_name,
    dbKind: r.db_kind,
    config: decodeTargetConfig(r.config),
    destinationIds: r.destination_ids
      ? JSON.parse(r.destination_ids)
      : [r.destination_id].filter(Boolean),
    schedule: r.schedule,
    enabled: !!r.enabled,
    keepCount: r.keep_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listTargets(): BackupTarget[] {
  return db().prepare("SELECT * FROM targets ORDER BY created_at DESC").all().map(rowToTarget);
}

export function getTarget(id: string): BackupTarget | null {
  const r = db().prepare("SELECT * FROM targets WHERE id = ?").get(id);
  return r ? rowToTarget(r) : null;
}

export function createTarget(
  t: Omit<BackupTarget, "id" | "createdAt" | "updatedAt">
): BackupTarget {
  const id = newId();
  const ts = now();
  db()
    .prepare(
      `INSERT INTO targets
        (id, name, container_id, container_name, db_kind, config, destination_id,
         destination_ids, schedule, enabled, keep_count, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id, t.name, t.containerId, t.containerName, t.dbKind,
      encodeTargetConfig(t.config), t.destinationIds[0] || "",
      JSON.stringify(t.destinationIds), t.schedule,
      t.enabled ? 1 : 0, t.keepCount, ts, ts
    );
  return getTarget(id)!;
}

export function updateTarget(
  id: string,
  t: Omit<BackupTarget, "id" | "createdAt" | "updatedAt">
): BackupTarget | null {
  const existing = getTarget(id);
  if (!existing) return null;
  db()
    .prepare(
      `UPDATE targets SET name=?, container_id=?, container_name=?, db_kind=?,
        config=?, destination_id=?, destination_ids=?, schedule=?, enabled=?,
        keep_count=?, updated_at=?
       WHERE id=?`
    )
    .run(
      t.name, t.containerId, t.containerName, t.dbKind,
      encodeTargetConfig(t.config), t.destinationIds[0] || "",
      JSON.stringify(t.destinationIds), t.schedule,
      t.enabled ? 1 : 0, t.keepCount, now(), id
    );
  return getTarget(id);
}

export function deleteTarget(id: string): void {
  db().prepare("DELETE FROM targets WHERE id = ?").run(id);
}

// ── Destinations ─────────────────────────────────────────────────────────────
// The whole config blob is encrypted because it may hold OAuth tokens.

function rowToDestination(r: any): Destination {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    config: JSON.parse(decrypt(r.config) || "{}"),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listDestinations(): Destination[] {
  return db()
    .prepare("SELECT * FROM destinations ORDER BY created_at DESC")
    .all()
    .map(rowToDestination);
}

export function getDestination(id: string): Destination | null {
  const r = db().prepare("SELECT * FROM destinations WHERE id = ?").get(id);
  return r ? rowToDestination(r) : null;
}

export function createDestination(
  d: Omit<Destination, "id" | "createdAt" | "updatedAt">
): Destination {
  const id = newId();
  const ts = now();
  db()
    .prepare(
      `INSERT INTO destinations (id, name, kind, config, created_at, updated_at)
       VALUES (?,?,?,?,?,?)`
    )
    .run(id, d.name, d.kind, encrypt(JSON.stringify(d.config)), ts, ts);
  return getDestination(id)!;
}

export function updateDestination(
  id: string,
  patch: Partial<Pick<Destination, "name" | "config">>
): Destination | null {
  const existing = getDestination(id);
  if (!existing) return null;
  const name = patch.name ?? existing.name;
  const config = patch.config ?? existing.config;
  db()
    .prepare("UPDATE destinations SET name=?, config=?, updated_at=? WHERE id=?")
    .run(name, encrypt(JSON.stringify(config)), now(), id);
  return getDestination(id);
}

export function deleteDestination(id: string): void {
  db().prepare("DELETE FROM destinations WHERE id = ?").run(id);
}

// ── Runs ───────────────────────────────────────────────────────────────────

function rowToRun(r: any): BackupRun {
  return {
    id: r.id,
    targetId: r.target_id,
    targetName: r.target_name,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    size: r.size,
    artifact: r.artifact,
    results: r.results ? JSON.parse(r.results) : [],
    trigger: r.trigger,
    log: r.log,
  };
}

export function createRun(
  r: Pick<BackupRun, "targetId" | "targetName" | "trigger"> & {
    destinationIds: string[];
  }
): BackupRun {
  const id = newId();
  db()
    .prepare(
      `INSERT INTO runs (id, target_id, target_name, status, started_at,
        destination_id, trigger, log)
       VALUES (?,?,?,?,?,?,?,'')`
    )
    .run(id, r.targetId, r.targetName, "running", now(), r.destinationIds[0] || "", r.trigger);
  return rowToRun(db().prepare("SELECT * FROM runs WHERE id = ?").get(id));
}

export function finishRun(
  id: string,
  status: RunStatus,
  fields: { size?: number; artifact?: string; results?: DestinationResult[]; log: string }
): void {
  db()
    .prepare(
      "UPDATE runs SET status=?, finished_at=?, size=?, artifact=?, results=?, log=? WHERE id=?"
    )
    .run(
      status, now(), fields.size ?? null, fields.artifact ?? null,
      JSON.stringify(fields.results ?? []), fields.log, id
    );
}

/**
 * Update one destination's outcome on a finished run (spool worker calling
 * home after a catch-up sync). When nothing is left spooled or failed the
 * run itself flips to success.
 */
export function updateRunResult(
  runId: string,
  destinationId: string,
  status: DestResultStatus,
  logLine?: string
): void {
  const r: any = db().prepare("SELECT * FROM runs WHERE id = ?").get(runId);
  if (!r) return;
  const results: DestinationResult[] = r.results ? JSON.parse(r.results) : [];
  const entry = results.find((x) => x.destinationId === destinationId);
  if (!entry) return;
  entry.status = status;
  if (status === "synced") delete entry.error;

  const allOk = results.every((x) => x.status === "success" || x.status === "synced");
  const newStatus: RunStatus = r.status === "running" ? r.status : allOk ? "success" : r.status;
  const log = logLine ? `${r.log}\n[${new Date().toISOString()}] ${logLine}` : r.log;
  db()
    .prepare("UPDATE runs SET results=?, status=?, log=? WHERE id=?")
    .run(JSON.stringify(results), newStatus, log, runId);
}

export function listRuns(limit = 100): BackupRun[] {
  return db()
    .prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT ?")
    .all(limit)
    .map(rowToRun);
}

export function listRunsForTarget(targetId: string, limit = 50): BackupRun[] {
  return db()
    .prepare("SELECT * FROM runs WHERE target_id=? ORDER BY started_at DESC LIMIT ?")
    .all(targetId, limit)
    .map(rowToRun);
}

// ── Spool ──────────────────────────────────────────────────────────────────
// Backups parked on local disk because their destination was unreachable.

function rowToSpool(r: any): SpoolItem {
  return {
    id: r.id,
    runId: r.run_id,
    targetId: r.target_id,
    destinationId: r.destination_id,
    filename: r.filename,
    path: r.path,
    size: r.size,
    createdAt: r.created_at,
    attempts: r.attempts,
    lastError: r.last_error,
    lastAttemptAt: r.last_attempt_at,
  };
}

export function createSpoolItem(
  s: Pick<SpoolItem, "runId" | "targetId" | "destinationId" | "filename" | "path" | "size"> & {
    lastError?: string;
  }
): SpoolItem {
  const id = newId();
  db()
    .prepare(
      `INSERT INTO spool (id, run_id, target_id, destination_id, filename, path,
        size, created_at, attempts, last_error)
       VALUES (?,?,?,?,?,?,?,?,0,?)`
    )
    .run(id, s.runId, s.targetId, s.destinationId, s.filename, s.path, s.size, now(), s.lastError ?? null);
  return rowToSpool(db().prepare("SELECT * FROM spool WHERE id = ?").get(id));
}

/** Oldest first, so catch-up uploads happen in the order backups were taken. */
export function listSpool(): SpoolItem[] {
  return db().prepare("SELECT * FROM spool ORDER BY created_at ASC").all().map(rowToSpool);
}

export function listSpoolForPair(targetId: string, destinationId: string): SpoolItem[] {
  return db()
    .prepare("SELECT * FROM spool WHERE target_id=? AND destination_id=? ORDER BY created_at ASC")
    .all(targetId, destinationId)
    .map(rowToSpool);
}

export function countSpool(): number {
  const r: any = db().prepare("SELECT COUNT(*) AS n FROM spool").get();
  return r.n;
}

export function deleteSpoolItem(id: string): void {
  db().prepare("DELETE FROM spool WHERE id = ?").run(id);
}

export function markSpoolAttempt(id: string, error: string): void {
  db()
    .prepare("UPDATE spool SET attempts = attempts + 1, last_error=?, last_attempt_at=? WHERE id=?")
    .run(error.slice(0, 2000), now(), id);
}

/** How many spool rows still reference a staged file (shared when several destinations failed). */
export function countSpoolByPath(path: string): number {
  const r: any = db().prepare("SELECT COUNT(*) AS n FROM spool WHERE path = ?").get(path);
  return r.n;
}
