// Shared domain types for BackupTool.

export type DbKind = "postgres" | "mysql" | "mongodb" | "files";

export type DestinationKind = "local" | "gdrive" | "dropbox";

/** "partial" = the dump succeeded but at least one destination was offline;
 * those copies are spooled locally and sync automatically later. */
export type RunStatus = "running" | "success" | "partial" | "failed";

/** A configured backup job: what to back up, where to, on what schedule. */
export interface BackupTarget {
  id: string;
  name: string;
  /** Docker container id (full) this target backs up. */
  containerId: string;
  /** Human-friendly container name captured at config time. */
  containerName: string;
  dbKind: DbKind;
  /** Connection / dump options. Sensitive values are stored encrypted. */
  config: TargetConfig;
  /** One backup fans out to every destination listed here. */
  destinationIds: string[];
  /** node-cron expression, e.g. "0 * * * *" for hourly. */
  schedule: string;
  /** Whether the scheduler runs this target automatically. */
  enabled: boolean;
  /** Round-robin retention: keep at most this many backup files. */
  keepCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface TargetConfig {
  // postgres / mysql
  user?: string;
  password?: string;
  database?: string; // empty => all databases
  port?: number;
  // mongodb
  authDb?: string;
  // files
  paths?: string[]; // container paths to archive
}

export interface Destination {
  id: string;
  name: string;
  kind: DestinationKind;
  /** Kind-specific settings (e.g. { path } for local, tokens for cloud). */
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** Per-destination outcome of one run.
 * "spooled" = destination was offline; the file is saved locally and will be
 * uploaded automatically when it comes back. "synced" = that catch-up upload
 * has since completed. */
export type DestResultStatus = "success" | "failed" | "spooled" | "synced";

export interface DestinationResult {
  destinationId: string;
  destinationName: string;
  status: DestResultStatus;
  error?: string;
}

export interface BackupRun {
  id: string;
  targetId: string;
  targetName: string;
  status: RunStatus;
  startedAt: number;
  finishedAt: number | null;
  /** Bytes written. */
  size: number | null;
  /** Filename produced (within the destination). */
  artifact: string | null;
  /** Outcome per destination this run fanned out to. */
  results: DestinationResult[];
  /** Was it kicked off by the scheduler or manually. */
  trigger: "manual" | "schedule";
  log: string;
}

/** A backup artifact saved locally because its destination was offline,
 * waiting for the background worker to upload it. */
export interface SpoolItem {
  id: string;
  runId: string;
  targetId: string;
  destinationId: string;
  filename: string;
  /** Absolute path of the staged file on local disk. */
  path: string;
  size: number;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: number | null;
}

/** Lightweight view of a Docker container for the UI. */
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  /** Best-guess DB kind from the image name. */
  guessedKind: DbKind | null;
  /** Auto-detected credentials from container env vars. */
  detected: TargetConfig;
}
