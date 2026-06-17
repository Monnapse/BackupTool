import cron from "node-cron";
import type { BackupTarget, DbKind, Destination } from "./types";

// Helpers shared by API routes. Kept out of route.ts files because Next.js
// only allows HTTP-method and config exports from those.

const KINDS: DbKind[] = ["postgres", "mysql", "mongodb", "files"];

export function parseTargetBody(
  b: any
): Omit<BackupTarget, "id" | "createdAt" | "updatedAt"> {
  if (!b?.name) throw new Error("name is required");
  if (!b?.containerId) throw new Error("containerId is required");
  if (!KINDS.includes(b.dbKind)) throw new Error("invalid dbKind");
  if (!b?.destinationId) throw new Error("destinationId is required");
  if (!cron.validate(b.schedule)) throw new Error("invalid cron schedule");
  const keepCount = Number(b.keepCount);
  if (!Number.isInteger(keepCount) || keepCount < 1) throw new Error("keepCount must be >= 1");

  return {
    name: String(b.name),
    containerId: String(b.containerId),
    containerName: String(b.containerName || ""),
    dbKind: b.dbKind,
    config: b.config || {},
    destinationId: String(b.destinationId),
    schedule: String(b.schedule),
    enabled: b.enabled !== false,
    keepCount,
  };
}

/** Strip secrets from a destination; expose only what the UI needs. */
export function publicDestination(d: Destination) {
  const c = d.config as any;
  const connected = d.kind === "local" ? true : Boolean(c.refresh_token);
  const folder =
    d.kind === "gdrive"
      ? c.rootFolderName || (c.rootFolderId ? "(selected folder)" : "")
      : d.kind === "dropbox"
        ? c.basePath || ""
        : undefined;
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    connected,
    // Cloud: whether OAuth app credentials have been entered (no secrets exposed).
    hasCreds: d.kind === "local" ? true : Boolean(c.clientId && c.clientSecret),
    folder,
    path: d.kind === "local" ? c.path || "" : undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
