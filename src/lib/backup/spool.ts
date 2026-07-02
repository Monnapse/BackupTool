import fs from "node:fs";
import type { SpoolItem } from "../types";
import { driverFor } from "../destinations";
import { applyRotation } from "./rotation";
import { removeStagedFileIfUnreferenced } from "./engine";
import {
  deleteSpoolItem,
  getDestination,
  getTarget,
  listSpool,
  markSpoolAttempt,
  updateRunResult,
} from "../repo";

// Background catch-up worker. Backups that couldn't reach a destination
// (USB unplugged, cloud down) sit in the spool; every tick we probe each
// destination and, the moment it's reachable again, upload what's waiting.

const TICK_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let ticking = false;

export function startSpoolWorker() {
  if (timer) return;
  timer = setInterval(() => void tick(), TICK_MS);
  timer.unref?.();
  void tick(); // catch up immediately on boot too
  console.log("[spool] worker started");
}

async function tick() {
  if (ticking) return; // don't overlap slow uploads
  ticking = true;
  try {
    const pending = listSpool(); // oldest first
    if (pending.length === 0) return;

    const byDest = new Map<string, SpoolItem[]>();
    for (const item of pending) {
      const list = byDest.get(item.destinationId) || [];
      list.push(item);
      byDest.set(item.destinationId, list);
    }

    for (const [destId, items] of byDest) {
      const dest = getDestination(destId);
      if (!dest) {
        // Destination was deleted — nothing to sync to anymore.
        for (const item of items) {
          deleteSpoolItem(item.id);
          await removeStagedFileIfUnreferenced(item.path).catch(() => {});
        }
        continue;
      }

      const driver = driverFor(dest);
      try {
        await driver.test(dest); // cheap probe: still offline → skip this tick
      } catch (e: any) {
        for (const item of items) markSpoolAttempt(item.id, String(e?.message || e));
        continue;
      }

      for (const item of items) {
        try {
          if (!fs.existsSync(item.path)) {
            // Staged file vanished (manual cleanup?) — drop the row.
            deleteSpoolItem(item.id);
            updateRunResult(item.runId, destId, "failed", `Spooled file for ${dest.name} is missing; cannot sync.`);
            continue;
          }
          await driver.upload(dest, item.targetId, item.filename, fs.createReadStream(item.path));
          const target = getTarget(item.targetId);
          if (target) {
            await applyRotation(dest, item.targetId, target.keepCount).catch(() => {});
          }
          deleteSpoolItem(item.id);
          await removeStagedFileIfUnreferenced(item.path).catch(() => {});
          updateRunResult(item.runId, destId, "synced", `Synced ${item.filename} to ${dest.name} after it came back online.`);
          console.log(`[spool] synced ${item.filename} → ${dest.name}`);
        } catch (e: any) {
          markSpoolAttempt(item.id, String(e?.message || e));
          break; // destination flaked mid-sync; try again next tick
        }
      }
    }
  } catch (e) {
    console.error("[spool] tick failed", e);
  } finally {
    ticking = false;
  }
}
