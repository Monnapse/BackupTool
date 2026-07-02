import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { BackupRun, DestinationResult } from "../types";
import { execStreamToWritable } from "../docker";
import { driverFor } from "../destinations";
import { buildDumpPlan } from "./dumpers";
import { applyRotation } from "./rotation";
import {
  countSpoolByPath,
  createRun,
  createSpoolItem,
  deleteSpoolItem,
  finishRun,
  getDestination,
  getTarget,
  listSpoolForPair,
} from "../repo";

function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Where offline backups wait for their destination to come back. */
export function spoolDir(): string {
  return path.join(process.env.DATA_DIR || "/data", "spool");
}

/** Delete a staged file once no spool row references it anymore. */
export async function removeStagedFileIfUnreferenced(file: string): Promise<void> {
  if (countSpoolByPath(file) > 0) return;
  await fsp.rm(file, { force: true });
}

export interface RunOutcome {
  run: BackupRun;
  ok: boolean;
}

/**
 * Execute one backup for a target:
 *   1. dump from the container into a local staging file (one dump total),
 *   2. fan the file out to every configured destination,
 *   3. any destination that's offline is skipped — the file stays spooled on
 *      local disk and the spool worker uploads it when the destination is back.
 * The run is "success" if every destination got its copy, "partial" if some
 * are spooled, "failed" only if the dump itself failed.
 */
export async function runBackup(
  targetId: string,
  trigger: "manual" | "schedule"
): Promise<RunOutcome> {
  const target = getTarget(targetId);
  if (!target) throw new Error(`Target ${targetId} not found`);

  const run = createRun({
    targetId: target.id,
    targetName: target.name,
    destinationIds: target.destinationIds,
    trigger,
  });

  const lines: string[] = [];
  const log = (m: string) => lines.push(`[${new Date().toISOString()}] ${m}`);

  const plan = buildDumpPlan(target.dbKind, target.config);
  const filename = `${safe(target.name)}_${timestamp()}${plan.ext}`;
  const staging = path.join(spoolDir(), `${run.id}_${filename}`);

  // 1. Dump once, to local disk.
  let size = 0;
  try {
    log(`Starting ${target.dbKind} backup of "${target.containerName}".`);
    await fsp.mkdir(spoolDir(), { recursive: true });

    const out = fs.createWriteStream(staging);
    const flushed = new Promise<void>((resolve, reject) => {
      out.on("close", resolve);
      out.on("error", reject);
    });
    flushed.catch(() => {}); // if exec throws first, don't leave an unhandled rejection
    const execResult = await execStreamToWritable(
      target.containerId,
      plan.cmd,
      plan.env,
      out
    );
    await flushed; // exec end ≠ file flushed; wait before reading the size
    if (execResult.exitCode !== 0) {
      const err = execResult.stderr.trim().slice(0, 4000);
      throw new Error(`Dump exited with code ${execResult.exitCode}${err ? `: ${err}` : ""}`);
    }
    size = (await fsp.stat(staging)).size;
    log(`Dump complete (${formatBytes(size)}).`);
  } catch (e: any) {
    await fsp.rm(staging, { force: true }).catch(() => {});
    log(`Error: ${e?.message || e}`);
    finishRun(run.id, "failed", { results: [], log: lines.join("\n") });
    return { run, ok: false };
  }

  // 2. Fan out to every destination.
  const results: DestinationResult[] = [];
  for (const destId of target.destinationIds) {
    const dest = getDestination(destId);
    if (!dest) {
      log(`Destination ${destId} no longer exists — skipped.`);
      results.push({ destinationId: destId, destinationName: "(deleted)", status: "failed", error: "destination deleted" });
      continue;
    }
    try {
      const driver = driverFor(dest);
      await driver.upload(dest, target.id, filename, fs.createReadStream(staging));
      log(`Uploaded to ${dest.name} (${dest.kind}).`);
      try {
        const removed = await applyRotation(dest, target.id, target.keepCount);
        if (removed.length) log(`${dest.name}: rotation removed ${removed.length} old backup(s).`);
      } catch (e: any) {
        log(`${dest.name}: rotation failed (${e?.message || e}) — backup itself is fine.`);
      }
      results.push({ destinationId: destId, destinationName: dest.name, status: "success" });
    } catch (e: any) {
      const msg = String(e?.message || e);
      log(`${dest.name} is unavailable (${msg}) — keeping a local copy, will sync when it's back.`);
      createSpoolItem({
        runId: run.id,
        targetId: target.id,
        destinationId: destId,
        filename,
        path: staging,
        size,
        lastError: msg,
      });
      pruneSpool(target.id, destId, target.keepCount, log);
      results.push({ destinationId: destId, destinationName: dest.name, status: "spooled", error: msg });
    }
  }

  // 3. Drop the staging file unless a spooled destination still needs it.
  await removeStagedFileIfUnreferenced(staging).catch(() => {});

  const allOk = results.every((r) => r.status === "success");
  const status = allOk ? "success" : "partial";
  log(allOk ? "Backup complete." : "Backup complete — some destinations pending sync.");

  finishRun(run.id, status, {
    size,
    artifact: filename,
    results,
    log: lines.join("\n"),
  });
  return { run, ok: true };
}

/**
 * Keep the spool from growing without bound while a destination stays offline:
 * retain only the newest `keepCount` pending files per (target, destination) —
 * the same rotation the destination itself would apply.
 */
function pruneSpool(
  targetId: string,
  destinationId: string,
  keepCount: number,
  log: (m: string) => void
): void {
  const rows = listSpoolForPair(targetId, destinationId); // oldest first
  const excess = rows.length - keepCount;
  for (let i = 0; i < excess; i++) {
    const row = rows[i];
    deleteSpoolItem(row.id);
    removeStagedFileIfUnreferenced(row.path).catch(() => {});
    log(`Spool rotation dropped ${row.filename} (superseded by newer backups).`);
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}
