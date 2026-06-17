import crypto from "node:crypto";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";
import type {
  BackupRun,
  BackupTarget,
  Destination,
  RunStatus,
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
    destinationId: r.destination_id,
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
         schedule, enabled, keep_count, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id, t.name, t.containerId, t.containerName, t.dbKind,
      encodeTargetConfig(t.config), t.destinationId, t.schedule,
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
        config=?, destination_id=?, schedule=?, enabled=?, keep_count=?, updated_at=?
       WHERE id=?`
    )
    .run(
      t.name, t.containerId, t.containerName, t.dbKind,
      encodeTargetConfig(t.config), t.destinationId, t.schedule,
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
    destinationId: r.destination_id,
    trigger: r.trigger,
    log: r.log,
  };
}

export function createRun(
  r: Pick<BackupRun, "targetId" | "targetName" | "destinationId" | "trigger">
): BackupRun {
  const id = newId();
  db()
    .prepare(
      `INSERT INTO runs (id, target_id, target_name, status, started_at,
        destination_id, trigger, log)
       VALUES (?,?,?,?,?,?,?,'')`
    )
    .run(id, r.targetId, r.targetName, "running", now(), r.destinationId, r.trigger);
  return db().prepare("SELECT * FROM runs WHERE id = ?").get(id) as any;
}

export function finishRun(
  id: string,
  status: RunStatus,
  fields: { size?: number; artifact?: string; log: string }
): void {
  db()
    .prepare(
      "UPDATE runs SET status=?, finished_at=?, size=?, artifact=?, log=? WHERE id=?"
    )
    .run(status, now(), fields.size ?? null, fields.artifact ?? null, fields.log, id);
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
