import { PassThrough } from "node:stream";
import type { BackupRun, BackupTarget, Destination } from "../types";
import { execStreamToWritable } from "../docker";
import { driverFor } from "../destinations";
import { buildDumpPlan } from "./dumpers";
import { applyRotation } from "./rotation";
import {
  createRun,
  finishRun,
  getDestination,
  getTarget,
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

export interface RunOutcome {
  run: BackupRun;
  ok: boolean;
}

/**
 * Execute one backup for a target: dump from the container, stream straight
 * into the destination, then rotate old artifacts. Records a run row either way.
 */
export async function runBackup(
  targetId: string,
  trigger: "manual" | "schedule"
): Promise<RunOutcome> {
  const target = getTarget(targetId);
  if (!target) throw new Error(`Target ${targetId} not found`);
  const dest = getDestination(target.destinationId);

  const run = createRun({
    targetId: target.id,
    targetName: target.name,
    destinationId: target.destinationId,
    trigger,
  });

  const lines: string[] = [];
  const log = (m: string) => lines.push(`[${new Date().toISOString()}] ${m}`);

  if (!dest) {
    log("Destination not found.");
    finishRun(run.id, "failed", { log: lines.join("\n") });
    return { run, ok: false };
  }

  try {
    log(`Starting ${target.dbKind} backup of "${target.containerName}".`);
    const plan = buildDumpPlan(target.dbKind, target.config);
    const filename = `${safe(target.name)}_${timestamp()}${plan.ext}`;
    const driver = driverFor(dest);

    const pass = new PassThrough();
    log(`Dumping → ${dest.name} (${dest.kind}) as ${filename}`);

    const uploadPromise = driver
      .upload(dest, target.id, filename, pass)
      .catch((e) => {
        // Make sure the exec side unblocks if upload dies early.
        pass.destroy(e);
        throw e;
      });

    let execResult;
    try {
      execResult = await execStreamToWritable(
        target.containerId,
        plan.cmd,
        plan.env,
        pass
      );
    } catch (e: any) {
      pass.destroy();
      throw new Error(`Dump command failed: ${e?.message || e}`);
    }

    const uploaded = await uploadPromise;

    if (execResult.exitCode !== 0) {
      log(`Dump exited with code ${execResult.exitCode}.`);
      if (execResult.stderr.trim()) log(`stderr: ${execResult.stderr.trim().slice(0, 4000)}`);
      // Remove the partial/corrupt artifact we just stored.
      try {
        await driver.remove(dest, uploaded.ref);
        log("Removed incomplete artifact.");
      } catch {
        /* ignore */
      }
      finishRun(run.id, "failed", { log: lines.join("\n") });
      return { run, ok: false };
    }

    log(`Uploaded ${formatBytes(uploaded.size)}.`);

    const removed = await applyRotation(dest, target.id, target.keepCount);
    if (removed.length) log(`Rotation removed ${removed.length} old backup(s): ${removed.join(", ")}`);
    log("Backup complete.");

    finishRun(run.id, "success", {
      size: uploaded.size,
      artifact: filename,
      log: lines.join("\n"),
    });
    return { run, ok: true };
  } catch (e: any) {
    log(`Error: ${e?.message || e}`);
    finishRun(run.id, "failed", { log: lines.join("\n") });
    return { run, ok: false };
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
