import type { Destination } from "../types";
import { driverFor } from "../destinations";

// Round-robin retention: after a successful upload, keep only the newest
// `keepCount` artifacts for a target and delete the rest.
//
// This realises the "N rotating files" behaviour: with keepCount = 2 and an
// hourly schedule, the destination always holds the two most recent hourly
// backups, the oldest being overwritten as new ones arrive.

export async function applyRotation(
  dest: Destination,
  targetId: string,
  keepCount: number
): Promise<string[]> {
  const driver = driverFor(dest);
  const existing = await driver.list(dest, targetId);
  if (existing.length <= keepCount) return [];

  const sorted = [...existing].sort((a, b) => b.mtime - a.mtime); // newest first
  const toDelete = sorted.slice(keepCount);
  const removed: string[] = [];
  for (const a of toDelete) {
    await driver.remove(dest, a.ref);
    removed.push(a.name);
  }
  return removed;
}
