// Shared domain types for BackupTool.

export type DbKind = "postgres" | "mysql" | "mongodb" | "files";

export type DestinationKind = "local" | "gdrive" | "dropbox";

export type RunStatus = "running" | "success" | "failed";

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
  destinationId: string;
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
  destinationId: string;
  /** Was it kicked off by the scheduler or manually. */
  trigger: "manual" | "schedule";
  log: string;
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
